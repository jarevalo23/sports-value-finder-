// Kalshi market-data service layer.
//
// Pulls event-contract markets from Kalshi, normalizes them into games with
// win/tie/lose outcomes, and exposes two rankings:
//   1. getHighestBets()        -> where the most money is actually placed
//   2. getMostProbableEvents() -> the likeliest outcome per game (by price)
//
// Mirrors the demo-fallback pattern used by oddsApi.ts so the app keeps working
// with no credentials configured.

import {
  KalshiRawMarket,
  KalshiGame,
  KalshiOutcome,
  KalshiOutcomeSide,
  KalshiHighestBet,
  KalshiProbableEvent,
  VolumeMetric,
} from '@/types/kalshi';
import { probabilityToAmerican } from '@/utils/oddsCalculations';

// Public Kalshi v2 trade API host.
const KALSHI_BASE_URL =
  process.env.KALSHI_API_BASE_URL || 'https://api.elections.kalshi.com/trade-api/v2';

// Use demo data unless a real series is configured.
const USE_DEMO_DATA = !process.env.KALSHI_SERIES_TICKER;

interface KalshiConfig {
  seriesTicker?: string;
  limit?: number;
}

/**
 * Convert a Kalshi contract price (cents, 1-99) to an implied probability (0-1).
 */
export function priceCentsToProbability(priceCents: number): number {
  return Math.min(0.99, Math.max(0.01, priceCents / 100));
}

/**
 * Pick the best available price for a market: prefer last traded price, fall
 * back to the bid/ask midpoint.
 */
function effectivePriceCents(m: KalshiRawMarket): number {
  if (m.last_price && m.last_price > 0) return m.last_price;
  if (m.yes_bid && m.yes_ask) return Math.round((m.yes_bid + m.yes_ask) / 2);
  return m.yes_ask || m.yes_bid || 50;
}

/**
 * Fetch raw markets for a Kalshi series. Falls back to demo data when no series
 * is configured or the request fails.
 */
export async function fetchKalshiMarkets(
  config: KalshiConfig = {}
): Promise<KalshiRawMarket[]> {
  if (USE_DEMO_DATA && !config.seriesTicker) {
    return getDemoMarkets();
  }

  const seriesTicker = config.seriesTicker || process.env.KALSHI_SERIES_TICKER;
  const limit = config.limit ?? 200;
  const url = `${KALSHI_BASE_URL}/markets?limit=${limit}&status=open${
    seriesTicker ? `&series_ticker=${seriesTicker}` : ''
  }`;

  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) {
    throw new Error(`Failed to fetch Kalshi markets: ${response.statusText}`);
  }

  const json = await response.json();
  return (json.markets || []) as KalshiRawMarket[];
}

/**
 * Infer which side of a game a market represents from its label. Kalshi soccer
 * markets are typically phrased per-outcome (team win / draw / opponent win).
 */
function inferSide(label: string, homeTeam: string, awayTeam: string): KalshiOutcomeSide {
  const l = label.toLowerCase();
  if (/(draw|tie)/.test(l)) return 'tie';
  if (awayTeam && l.includes(awayTeam.toLowerCase())) return 'lose'; // away win = home loses
  if (homeTeam && l.includes(homeTeam.toLowerCase())) return 'win';
  return 'win';
}

/**
 * Normalize a single raw market into an outcome.
 */
function normalizeOutcome(
  m: KalshiRawMarket,
  homeTeam: string,
  awayTeam: string
): KalshiOutcome {
  const priceCents = effectivePriceCents(m);
  const impliedProbability = priceCentsToProbability(priceCents);
  const selection = m.yes_sub_title || m.title;
  const openInterest = m.open_interest ?? 0;

  return {
    ticker: m.ticker,
    selection,
    side: inferSide(selection, homeTeam, awayTeam),
    priceCents,
    impliedProbability,
    americanOdds: probabilityToAmerican(impliedProbability),
    volume: m.volume ?? 0,
    volume24h: m.volume_24h ?? 0,
    openInterest,
    notionalUsd: Math.round(openInterest * (priceCents / 100)),
  };
}

/**
 * Group raw markets into games keyed by event ticker. Metadata (teams, sport,
 * commence time) is taken from the embedded demo fields when present.
 */
export function normalizeKalshiGames(markets: KalshiRawMarket[]): KalshiGame[] {
  const byEvent = new Map<string, KalshiRawMarket[]>();
  for (const m of markets) {
    if (!byEvent.has(m.event_ticker)) byEvent.set(m.event_ticker, []);
    byEvent.get(m.event_ticker)!.push(m);
  }

  const games: KalshiGame[] = [];
  for (const [eventTicker, group] of byEvent) {
    const meta = DEMO_EVENT_META[eventTicker] || parseTitle(group[0]?.title || eventTicker);
    const outcomes = group.map((m) => normalizeOutcome(m, meta.homeTeam, meta.awayTeam));

    games.push({
      eventTicker,
      sportKey: meta.sportKey,
      sportTitle: meta.sportTitle,
      title: meta.title,
      homeTeam: meta.homeTeam,
      awayTeam: meta.awayTeam,
      commenceTime: meta.commenceTime,
      outcomes,
      totalVolume: outcomes.reduce((s, o) => s + o.volume, 0),
      totalOpenInterest: outcomes.reduce((s, o) => s + o.openInterest, 0),
    });
  }

  return games;
}

/**
 * Rank every outcome across all games by how heavily it is backed.
 * This answers: "what is the highest bet for win / tie / lose right now?"
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
 * For each game, return its single most probable outcome, ranked across games.
 * This answers: "what is the most probable event happening?"
 */
export function getMostProbableEvents(games: KalshiGame[]): KalshiProbableEvent[] {
  const rows: KalshiProbableEvent[] = [];
  for (const game of games) {
    if (game.outcomes.length === 0) continue;
    const favored = game.outcomes.reduce((best, o) =>
      o.impliedProbability > best.impliedProbability ? o : best
    );
    rows.push({
      eventTicker: game.eventTicker,
      title: game.title,
      favoredSelection: favored.selection,
      side: favored.side,
      impliedProbability: favored.impliedProbability,
      priceCents: favored.priceCents,
      americanOdds: favored.americanOdds,
      volume: favored.volume,
      openInterest: favored.openInterest,
    });
  }

  return rows.sort((a, b) => b.impliedProbability - a.impliedProbability);
}

// ============== METADATA / DEMO DATA ==============

interface EventMeta {
  sportKey: string;
  sportTitle: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
}

/**
 * Best-effort parse of a market title like "Brazil vs Haiti" into teams.
 */
function parseTitle(title: string): EventMeta {
  const match = title.match(/(.+?)\s+(?:vs\.?|@|v)\s+(.+)/i);
  const homeTeam = match ? match[1].trim() : title;
  const awayTeam = match ? match[2].trim() : '';
  return {
    sportKey: 'soccer',
    sportTitle: 'Soccer',
    title,
    homeTeam,
    awayTeam,
    commenceTime: new Date().toISOString(),
  };
}

const soon = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

const DEMO_EVENT_META: Record<string, EventMeta> = {
  'WORLDCUP-BRAHAI': {
    sportKey: 'soccer',
    sportTitle: 'Soccer (World Cup)',
    title: 'Brazil vs Haiti',
    homeTeam: 'Brazil',
    awayTeam: 'Haiti',
    commenceTime: soon(6),
  },
  'WORLDCUP-ARGMEX': {
    sportKey: 'soccer',
    sportTitle: 'Soccer (World Cup)',
    title: 'Argentina vs Mexico',
    homeTeam: 'Argentina',
    awayTeam: 'Mexico',
    commenceTime: soon(9),
  },
  'EPL-MCILIV': {
    sportKey: 'soccer_epl',
    sportTitle: 'Premier League',
    title: 'Man City vs Liverpool',
    homeTeam: 'Man City',
    awayTeam: 'Liverpool',
    commenceTime: soon(28),
  },
};

/**
 * Demo markets approximating Kalshi soccer (3-way win/tie/lose) contracts.
 * Prices are in cents (= implied probability); volume/open_interest are
 * contract counts. Numbers are illustrative.
 */
export function getDemoMarkets(): KalshiRawMarket[] {
  return [
    // Brazil vs Haiti — lopsided favorite, very heavy backing on Brazil.
    {
      ticker: 'WORLDCUP-BRAHAI-BRA',
      event_ticker: 'WORLDCUP-BRAHAI',
      title: 'Brazil vs Haiti',
      yes_sub_title: 'Brazil',
      status: 'active',
      yes_bid: 87,
      yes_ask: 89,
      last_price: 88,
      volume: 412350,
      volume_24h: 95120,
      open_interest: 188400,
    },
    {
      ticker: 'WORLDCUP-BRAHAI-DRAW',
      event_ticker: 'WORLDCUP-BRAHAI',
      title: 'Brazil vs Haiti',
      yes_sub_title: 'Draw',
      status: 'active',
      yes_bid: 8,
      yes_ask: 10,
      last_price: 9,
      volume: 54210,
      volume_24h: 9800,
      open_interest: 31200,
    },
    {
      ticker: 'WORLDCUP-BRAHAI-HAI',
      event_ticker: 'WORLDCUP-BRAHAI',
      title: 'Brazil vs Haiti',
      yes_sub_title: 'Haiti',
      status: 'active',
      yes_bid: 3,
      yes_ask: 5,
      last_price: 4,
      volume: 38900,
      volume_24h: 6400,
      open_interest: 22750,
    },
    // Argentina vs Mexico — closer favorite.
    {
      ticker: 'WORLDCUP-ARGMEX-ARG',
      event_ticker: 'WORLDCUP-ARGMEX',
      title: 'Argentina vs Mexico',
      yes_sub_title: 'Argentina',
      status: 'active',
      yes_bid: 61,
      yes_ask: 63,
      last_price: 62,
      volume: 221400,
      volume_24h: 71250,
      open_interest: 142800,
    },
    {
      ticker: 'WORLDCUP-ARGMEX-DRAW',
      event_ticker: 'WORLDCUP-ARGMEX',
      title: 'Argentina vs Mexico',
      yes_sub_title: 'Draw',
      status: 'active',
      yes_bid: 22,
      yes_ask: 24,
      last_price: 23,
      volume: 88600,
      volume_24h: 20100,
      open_interest: 64300,
    },
    {
      ticker: 'WORLDCUP-ARGMEX-MEX',
      event_ticker: 'WORLDCUP-ARGMEX',
      title: 'Argentina vs Mexico',
      yes_sub_title: 'Mexico',
      status: 'active',
      yes_bid: 14,
      yes_ask: 16,
      last_price: 15,
      volume: 73400,
      volume_24h: 16850,
      open_interest: 51900,
    },
    // Man City vs Liverpool — tight, big total volume.
    {
      ticker: 'EPL-MCILIV-MCI',
      event_ticker: 'EPL-MCILIV',
      title: 'Man City vs Liverpool',
      yes_sub_title: 'Man City',
      status: 'active',
      yes_bid: 45,
      yes_ask: 47,
      last_price: 46,
      volume: 305700,
      volume_24h: 50300,
      open_interest: 175600,
    },
    {
      ticker: 'EPL-MCILIV-DRAW',
      event_ticker: 'EPL-MCILIV',
      title: 'Man City vs Liverpool',
      yes_sub_title: 'Draw',
      status: 'active',
      yes_bid: 26,
      yes_ask: 28,
      last_price: 27,
      volume: 142900,
      volume_24h: 24700,
      open_interest: 98200,
    },
    {
      ticker: 'EPL-MCILIV-LIV',
      event_ticker: 'EPL-MCILIV',
      title: 'Man City vs Liverpool',
      yes_sub_title: 'Liverpool',
      status: 'active',
      yes_bid: 27,
      yes_ask: 29,
      last_price: 28,
      volume: 151200,
      volume_24h: 26900,
      open_interest: 101400,
    },
  ];
}
