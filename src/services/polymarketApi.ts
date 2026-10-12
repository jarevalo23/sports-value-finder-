// Polymarket market-data service layer.
//
// Gamma API  -> events and their per-outcome YES/NO markets (prices, book)
// Data API   -> individual trades (with the public trader wallet)
//
// Soccer matches on Polymarket are an event with one binary market per
// outcome ("Will Brazil win?", "Draw", "Will Haiti win?"); YES price is the
// implied probability. Everything is normalized into the venue-neutral
// VenueEvent / Trade shapes from '@/types/market'.

import { z } from 'zod';
import type { DataSource, Trade, VenueEvent, VenueOutcome } from '@/types/market';
import { DRAW_KEY } from '@/types/market';
import { devigMultiplicative, overround } from '@/utils/oddsCalculations';
import { fetchJson } from '@/lib/http';
import { canonicalTeam, isDrawLabel, splitMatchup, teamSimilarity } from '@/lib/teams';
import { demoPolymarketEventsResponse, demoPolymarketTradesResponse } from '@/services/demo/crossVenueDemo';

const GAMMA_BASE_URL = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';
const DATA_BASE_URL = process.env.POLYMARKET_DATA_URL || 'https://data-api.polymarket.com';

/** Polymarket market data is public; opt into live mode explicitly. */
export function polymarketSource(): DataSource {
  return process.env.POLYMARKET_LIVE === 'true' ? 'live' : 'demo';
}

/** Taker fee as a fraction of P×(1−P) per share. Most sports markets are 0 — verify per market. */
export const POLYMARKET_FEE_COEFFICIENT = Number(process.env.POLYMARKET_FEE_COEFFICIENT ?? 0);

// ------------------------------------------------------------- schemas
// Gamma encodes `outcomes` / `outcomePrices` as JSON strings; accept arrays too.

const jsonStringArray = z
  .union([z.string(), z.array(z.union([z.string(), z.number()]))])
  .transform((v): string[] => {
    if (Array.isArray(v)) return v.map(String);
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });

const idString = z.union([z.string(), z.number()]).transform(String);
const optNum = z.union([z.number(), z.string()]).nullish().transform((v) => (v == null || v === '' ? undefined : Number(v)));

const GammaMarketSchema = z.object({
  id: idString,
  question: z.string().nullish(),
  conditionId: z.string(),
  groupItemTitle: z.string().nullish(),
  outcomes: jsonStringArray.nullish(),
  outcomePrices: jsonStringArray.nullish(),
  bestBid: optNum,
  bestAsk: optNum,
  lastTradePrice: optNum,
  volumeNum: optNum,
  gameStartTime: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
});

const GammaEventSchema = z.object({
  id: idString,
  slug: z.string().nullish(),
  title: z.string(),
  startTime: z.string().nullish(),
  endDate: z.string().nullish(),
  markets: z.array(GammaMarketSchema).nullish(),
});

const GammaEventsResponseSchema = z.array(GammaEventSchema);
type GammaEvent = z.infer<typeof GammaEventSchema>;
type GammaMarket = z.infer<typeof GammaMarketSchema>;

const PolyTradeSchema = z.object({
  proxyWallet: z.string().nullish(),
  side: z.enum(['BUY', 'SELL']),
  conditionId: z.string(),
  size: z.coerce.number(),
  price: z.coerce.number(),
  timestamp: z.coerce.number(),
  outcome: z.string(),
  transactionHash: z.string().nullish(),
});

const PolyTradesResponseSchema = z.array(PolyTradeSchema);

// --------------------------------------------------------------- fetch

export async function fetchPolymarketEvents(): Promise<GammaEvent[]> {
  if (polymarketSource() === 'demo') {
    return GammaEventsResponseSchema.parse(demoPolymarketEventsResponse());
  }
  const tag = encodeURIComponent(process.env.POLYMARKET_TAG_SLUG || 'soccer');
  return fetchJson(`${GAMMA_BASE_URL}/events?tag_slug=${tag}&active=true&closed=false&limit=200`, {
    source: 'polymarket-gamma',
    schema: GammaEventsResponseSchema,
  });
}

/**
 * Recent trades for one market (conditionId), normalized to Trade.
 * BUY YES / SELL NO back the outcome; BUY NO / SELL YES bet against it.
 */
export async function fetchPolymarketTrades(
  conditionId: string,
  outcomeKey: string,
  eventId: string,
  limit: number = 500
): Promise<Trade[]> {
  const raw =
    polymarketSource() === 'demo'
      ? PolyTradesResponseSchema.parse(demoPolymarketTradesResponse(conditionId))
      : await fetchJson(
          `${DATA_BASE_URL}/trades?market=${encodeURIComponent(conditionId)}&limit=${limit}&takerOnly=true`,
          { source: 'polymarket-data', schema: PolyTradesResponseSchema }
        );

  return raw.map((t, i) => {
    const isYes = t.outcome.toLowerCase() === 'yes';
    const probability = isYes ? t.price : 1 - t.price;
    const backs = (t.side === 'BUY') === isYes;
    return {
      venue: 'polymarket' as const,
      tradeId: t.transactionHash ? `${t.transactionHash}-${i}` : `${conditionId}-${t.timestamp}-${i}`,
      eventId,
      marketId: conditionId,
      outcomeKey,
      stance: backs ? 'for' : 'against',
      probability,
      size: t.size,
      notionalUsd: Math.round(t.size * t.price),
      timestamp: new Date(t.timestamp * 1000).toISOString(),
      trader: t.proxyWallet ?? undefined,
    };
  });
}

// ----------------------------------------------------------- normalize

function yesPrice(m: GammaMarket): number | undefined {
  if (m.bestBid != null && m.bestAsk != null && m.bestAsk > 0) return (m.bestBid + m.bestAsk) / 2;
  const outcomes = m.outcomes ?? [];
  const prices = m.outcomePrices ?? [];
  const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
  if (yesIndex >= 0 && prices[yesIndex] != null) return Number(prices[yesIndex]);
  return m.lastTradePrice;
}

/**
 * Map a market to an outcome key of this matchup, or null when it's some
 * other market in the event (totals, props, etc.).
 */
function outcomeKeyFor(m: GammaMarket, home: string, away: string): string | null {
  const label = m.groupItemTitle || m.question || '';
  if (isDrawLabel(label) || isDrawLabel(m.question ?? '')) return DRAW_KEY;
  for (const team of [home, away]) {
    if (teamSimilarity(label, team) >= 0.6) return canonicalTeam(team);
  }
  const winner = (m.question ?? '').match(/will (.+?) win/i)?.[1];
  if (winner) {
    for (const team of [home, away]) {
      if (teamSimilarity(winner, team) >= 0.6) return canonicalTeam(team);
    }
  }
  return null;
}

export function polymarketEventToVenueEvent(event: GammaEvent): VenueEvent | null {
  const teams = splitMatchup(event.title);
  if (!teams) return null;

  const picked: Array<{ key: string; market: GammaMarket; price: number }> = [];
  for (const m of event.markets ?? []) {
    if (m.closed) continue;
    const key = outcomeKeyFor(m, teams.home, teams.away);
    const price = yesPrice(m);
    if (key && price != null && !picked.some((p) => p.key === key)) picked.push({ key, market: m, price });
  }
  // Need the full 3-way book to devig; partial books would bias fair values.
  if (picked.length !== 3) return null;

  const raw = picked.map((p) => p.price);
  const fair = devigMultiplicative(raw);
  const outcomes: VenueOutcome[] = picked.map((p, i) => ({
    key: p.key,
    label: p.market.groupItemTitle || p.market.question || p.key,
    marketId: p.market.conditionId,
    rawProbability: raw[i],
    fairProbability: fair[i],
    bid: p.market.bestBid,
    ask: p.market.bestAsk,
    volume: p.market.volumeNum,
  }));

  const kickoff =
    event.markets?.find((m) => m.gameStartTime)?.gameStartTime ?? event.startTime ?? event.endDate;

  return {
    venue: 'polymarket',
    source: polymarketSource(),
    eventId: event.id,
    title: event.title,
    homeTeam: teams.home,
    awayTeam: teams.away,
    commenceTime: kickoff ? new Date(kickoff).toISOString() : new Date().toISOString(),
    outcomes,
    overround: overround(raw),
  };
}
