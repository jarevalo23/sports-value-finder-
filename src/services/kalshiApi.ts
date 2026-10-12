// Kalshi market-data service layer.
//
// Pulls event-contract markets (and individual trades) from Kalshi, validates
// them, and normalizes them into games with win/tie/lose outcomes. Exposes:
//   1. getHighestBets()        -> where the most money is placed (popularity,
//                                 NOT a value signal)
//   2. getMostProbableEvents() -> the likeliest outcome per game (devigged)
//   3. kalshiGameToVenueEvent / fetchKalshiTrades -> inputs for the
//                                 cross-venue reasoning layer
//
// Live and demo data go through the same schema + normalizer, so demo mode
// exercises the real code path.

import { z } from 'zod';
import {
  KalshiRawMarket,
  KalshiGame,
  KalshiOutcome,
  KalshiOutcomeSide,
  KalshiHighestBet,
  KalshiProbableEvent,
  VolumeMetric,
} from '@/types/kalshi';
import type { DataSource, Trade, VenueEvent } from '@/types/market';
import { DRAW_KEY } from '@/types/market';
import { probabilityToAmerican, devigMultiplicative, overround } from '@/utils/oddsCalculations';
import { fetchJson, mapLimit } from '@/lib/http';
import { canonicalTeam, isDrawLabel, splitMatchup } from '@/lib/teams';
import { demoKalshiEventsResponse, demoKalshiTradesResponse } from '@/services/demo/crossVenueDemo';

// Public Kalshi v2 trade API host (market data needs no auth).
const KALSHI_BASE_URL =
  process.env.KALSHI_API_BASE_URL || 'https://api.elections.kalshi.com/trade-api/v2';

/** Comma-separated Kalshi series tickers to load; unset means demo mode. */
function configuredSeries(): string[] {
  return (process.env.KALSHI_SERIES_TICKER || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function kalshiSource(): DataSource {
  return configuredSeries().length > 0 ? 'live' : 'demo';
}

/** Kalshi taker fee ≈ 0.07 × P × (1 − P) per contract. Verify against the current fee schedule. */
export const KALSHI_FEE_COEFFICIENT = 0.07;

// ------------------------------------------------------------- schemas
// Kalshi has published prices both as integer cents (`yes_bid`) and as
// dollar strings (`yes_bid_dollars`); accept either and normalize to cents.

const optNum = z.number().nullish();
const optStr = z.string().nullish();

const KalshiMarketSchema = z
  .object({
    ticker: z.string(),
    event_ticker: z.string(),
    title: z.string().nullish(),
    yes_sub_title: optStr,
    no_sub_title: optStr,
    status: optStr,
    yes_bid: optNum,
    yes_bid_dollars: optStr,
    yes_ask: optNum,
    yes_ask_dollars: optStr,
    last_price: optNum,
    last_price_dollars: optStr,
    volume: optNum,
    volume_fp: optStr,
    volume_24h: optNum,
    volume_24h_fp: optStr,
    open_interest: optNum,
    open_interest_fp: optStr,
    liquidity: optNum,
    close_time: optStr,
    expected_expiration_time: optStr,
  })
  .transform((m): KalshiRawMarket => {
    const cents = (n: number | null | undefined, dollars: string | null | undefined) =>
      n ?? (dollars != null ? Math.round(Number(dollars) * 100) : 0);
    const count = (n: number | null | undefined, fp: string | null | undefined) =>
      n ?? (fp != null ? Number(fp) : 0);
    return {
      ticker: m.ticker,
      event_ticker: m.event_ticker,
      title: m.title ?? '',
      yes_sub_title: m.yes_sub_title ?? undefined,
      no_sub_title: m.no_sub_title ?? undefined,
      status: m.status ?? 'active',
      yes_bid: cents(m.yes_bid, m.yes_bid_dollars),
      yes_ask: cents(m.yes_ask, m.yes_ask_dollars),
      last_price: cents(m.last_price, m.last_price_dollars),
      volume: count(m.volume, m.volume_fp),
      volume_24h: count(m.volume_24h, m.volume_24h_fp),
      open_interest: count(m.open_interest, m.open_interest_fp),
      liquidity: m.liquidity ?? undefined,
      close_time: m.close_time ?? undefined,
      expected_expiration_time: m.expected_expiration_time ?? undefined,
    };
  });

const KalshiEventSchema = z.object({
  event_ticker: z.string(),
  title: z.string(),
  sub_title: optStr,
  markets: z.array(KalshiMarketSchema).nullish(),
});

const KalshiEventsResponseSchema = z.object({
  events: z.array(KalshiEventSchema),
  cursor: optStr,
});
type KalshiEvent = z.infer<typeof KalshiEventSchema>;

const KalshiTradeSchema = z.object({
  trade_id: z.string(),
  ticker: z.string(),
  count: optNum,
  count_fp: optStr,
  yes_price: optNum,
  yes_price_dollars: optStr,
  taker_side: z.enum(['yes', 'no']),
  created_time: z.string(),
});

const KalshiTradesResponseSchema = z.object({
  trades: z.array(KalshiTradeSchema),
  cursor: optStr,
});

// ------------------------------------------------------------- helpers

/**
 * Convert a Kalshi contract price (cents, 1-99) to an implied probability (0-1).
 */
export function priceCentsToProbability(priceCents: number): number {
  return Math.min(0.99, Math.max(0.01, priceCents / 100));
}

/**
 * Best estimate of the current price: bid/ask midpoint when the book is
 * two-sided (it reflects now), otherwise the last trade.
 */
function effectivePriceCents(m: KalshiRawMarket): number {
  if (m.yes_bid > 0 && m.yes_ask > 0) return Math.round((m.yes_bid + m.yes_ask) / 2);
  if (m.last_price > 0) return m.last_price;
  return m.yes_ask || m.yes_bid || 50;
}

function inferSide(label: string, homeTeam: string, awayTeam: string): KalshiOutcomeSide {
  if (isDrawLabel(label)) return 'tie';
  const key = canonicalTeam(label);
  if (awayTeam && key === canonicalTeam(awayTeam)) return 'lose'; // away win = home loses
  return 'win';
}

// --------------------------------------------------------------- fetch

/**
 * Load open events (with nested markets) for every configured series. Demo
 * mode returns the bundled demo payload through the same schema.
 */
export async function fetchKalshiEvents(): Promise<KalshiEvent[]> {
  const series = configuredSeries();
  if (series.length === 0) {
    return KalshiEventsResponseSchema.parse(demoKalshiEventsResponse()).events;
  }

  const pages = await mapLimit(series, 3, (s) =>
    fetchJson(
      `${KALSHI_BASE_URL}/events?series_ticker=${encodeURIComponent(s)}&status=open&with_nested_markets=true&limit=200`,
      { source: 'kalshi', schema: KalshiEventsResponseSchema, init: { next: { revalidate: 30 } } as RequestInit }
    )
  );
  return pages.flatMap((p) => p.events);
}

/**
 * Backward-compatible flat market list (used by /api/kalshi).
 */
export async function fetchKalshiMarkets(): Promise<KalshiRawMarket[]> {
  const events = await fetchKalshiEvents();
  return events.flatMap((e) => e.markets ?? []);
}

/**
 * Recent trades for one market, normalized to the venue-neutral Trade shape.
 */
export async function fetchKalshiTrades(
  ticker: string,
  outcomeKey: string,
  eventId: string,
  limit: number = 500
): Promise<Trade[]> {
  const raw =
    kalshiSource() === 'demo'
      ? KalshiTradesResponseSchema.parse(demoKalshiTradesResponse(ticker))
      : await fetchJson(
          `${KALSHI_BASE_URL}/markets/trades?ticker=${encodeURIComponent(ticker)}&limit=${limit}`,
          { source: 'kalshi', schema: KalshiTradesResponseSchema }
        );

  return raw.trades.map((t) => {
    const yesCents = t.yes_price ?? Math.round(Number(t.yes_price_dollars ?? 0) * 100);
    const contracts = t.count ?? Number(t.count_fp ?? 0);
    const probability = priceCentsToProbability(yesCents);
    const stance = t.taker_side === 'yes' ? 'for' : 'against';
    // Taker buying YES pays the YES price; taker buying NO pays (1 − YES price).
    const costPerContract = stance === 'for' ? probability : 1 - probability;
    return {
      venue: 'kalshi' as const,
      tradeId: t.trade_id,
      eventId,
      marketId: t.ticker,
      outcomeKey,
      stance,
      probability,
      size: contracts,
      notionalUsd: Math.round(contracts * costPerContract),
      timestamp: new Date(t.created_time).toISOString(),
    };
  });
}

// ----------------------------------------------------------- normalize

function eventTeams(event: KalshiEvent): { homeTeam: string; awayTeam: string } {
  const split = splitMatchup(event.title);
  if (split) return { homeTeam: split.home, awayTeam: split.away };
  const teams = (event.markets ?? [])
    .map((m) => m.yes_sub_title || '')
    .filter((l) => l && !isDrawLabel(l));
  return { homeTeam: teams[0] ?? event.title, awayTeam: teams[1] ?? '' };
}

/**
 * Kalshi doesn't publish kickoff on the market; expected expiration is roughly
 * the end of the match, so back off ~2h. Cross-venue matching prefers the
 * sportsbook/Polymarket kickoff when one is available.
 */
function approxKickoff(markets: KalshiRawMarket[]): string {
  const times = markets
    .map((m) => Date.parse(m.expected_expiration_time ?? m.close_time ?? ''))
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return new Date().toISOString();
  return new Date(Math.min(...times) - 2 * 3600_000).toISOString();
}

export function normalizeKalshiEvents(events: KalshiEvent[]): KalshiGame[] {
  return events
    .filter((e) => (e.markets ?? []).length > 0)
    .map((event) => {
      const markets = event.markets ?? [];
      const { homeTeam, awayTeam } = eventTeams(event);
      const raw = markets.map((m) => priceCentsToProbability(effectivePriceCents(m)));
      const fair = devigMultiplicative(raw);

      const outcomes: KalshiOutcome[] = markets.map((m, i) => {
        const priceCents = effectivePriceCents(m);
        const selection = m.yes_sub_title || m.title;
        const openInterest = m.open_interest ?? 0;
        return {
          ticker: m.ticker,
          selection,
          side: inferSide(selection, homeTeam, awayTeam),
          priceCents,
          bidCents: m.yes_bid || undefined,
          askCents: m.yes_ask || undefined,
          impliedProbability: raw[i],
          fairProbability: fair[i],
          americanOdds: probabilityToAmerican(fair[i]),
          volume: m.volume ?? 0,
          volume24h: m.volume_24h ?? 0,
          openInterest,
          notionalUsd: Math.round(openInterest * (priceCents / 100)),
        };
      });

      return {
        eventTicker: event.event_ticker,
        sportKey: 'soccer',
        sportTitle: 'Soccer',
        title: event.title,
        homeTeam,
        awayTeam,
        commenceTime: approxKickoff(markets),
        outcomes,
        totalVolume: outcomes.reduce((s, o) => s + o.volume, 0),
        totalOpenInterest: outcomes.reduce((s, o) => s + o.openInterest, 0),
      };
    });
}

/**
 * Backward-compatible: group a flat market list into games (titles inferred).
 */
export function normalizeKalshiGames(markets: KalshiRawMarket[]): KalshiGame[] {
  const byEvent = new Map<string, KalshiRawMarket[]>();
  for (const m of markets) {
    if (!byEvent.has(m.event_ticker)) byEvent.set(m.event_ticker, []);
    byEvent.get(m.event_ticker)!.push(m);
  }
  const events: KalshiEvent[] = [...byEvent].map(([event_ticker, ms]) => ({
    event_ticker,
    title: (ms[0]?.title || event_ticker).replace(/\s*winner\??$/i, ''),
    markets: ms,
  }));
  return normalizeKalshiEvents(events);
}

export function getDemoMarkets(): KalshiRawMarket[] {
  return KalshiEventsResponseSchema.parse(demoKalshiEventsResponse()).events.flatMap((e) => e.markets ?? []);
}

export function kalshiGameToVenueEvent(game: KalshiGame): VenueEvent {
  return {
    venue: 'kalshi',
    source: kalshiSource(),
    eventId: game.eventTicker,
    title: game.title,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    commenceTime: game.commenceTime,
    overround: overround(game.outcomes.map((o) => o.impliedProbability)),
    outcomes: game.outcomes.map((o) => ({
      key: o.side === 'tie' ? DRAW_KEY : canonicalTeam(o.selection),
      label: o.selection,
      marketId: o.ticker,
      rawProbability: o.impliedProbability,
      fairProbability: o.fairProbability,
      bid: o.bidCents != null ? o.bidCents / 100 : undefined,
      ask: o.askCents != null ? o.askCents / 100 : undefined,
      volume: o.volume,
    })),
  };
}

// ------------------------------------------------------------- rankings

/**
 * Rank every outcome across all games by how heavily it is backed.
 * This is a flow/popularity signal — heavy volume is not evidence of value.
 */
export function getHighestBets(
  games: KalshiGame[],
  metric: VolumeMetric = 'volume',
  limit: number = 20
): KalshiHighestBet[] {
  const rows: KalshiHighestBet[] = [];
  for (const game of games) {
    for (const o of game.outcomes) {
      rows.push({
        eventTicker: game.eventTicker,
        title: game.title,
        selection: o.selection,
        side: o.side,
        priceCents: o.priceCents,
        impliedProbability: o.impliedProbability,
        americanOdds: o.americanOdds,
        volume: o.volume,
        volume24h: o.volume24h,
        openInterest: o.openInterest,
        notionalUsd: o.notionalUsd,
      });
    }
  }
  return rows.sort((a, b) => b[metric] - a[metric]).slice(0, limit);
}

/**
 * For each game, return its single most probable outcome (devigged),
 * ranked across games.
 */
export function getMostProbableEvents(games: KalshiGame[]): KalshiProbableEvent[] {
  const rows: KalshiProbableEvent[] = [];
  for (const game of games) {
    if (game.outcomes.length === 0) continue;
    const favored = game.outcomes.reduce((best, o) =>
      o.fairProbability > best.fairProbability ? o : best
    );
    rows.push({
      eventTicker: game.eventTicker,
      title: game.title,
      favoredSelection: favored.selection,
      side: favored.side,
      impliedProbability: favored.fairProbability,
      priceCents: favored.priceCents,
      americanOdds: favored.americanOdds,
      volume: favored.volume,
      openInterest: favored.openInterest,
    });
  }
  return rows.sort((a, b) => b.impliedProbability - a.impliedProbability);
}
