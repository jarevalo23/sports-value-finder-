// Types for Kalshi market-data integration.
//
// Kalshi is an event-contract exchange: each outcome is a YES/NO contract that
// settles at $1. The contract PRICE (in cents, 1-99) is therefore a direct
// implied probability, and VOLUME / OPEN INTEREST tell us where real money is
// actually being placed — the "highest bet" signal that traditional sportsbook
// odds (price-only) cannot give us.

export type KalshiOutcomeSide = 'win' | 'tie' | 'lose';

/**
 * Raw market object as returned by the Kalshi v2 `/markets` endpoint.
 * Only the fields we consume are typed; the API returns many more.
 */
export interface KalshiRawMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status: string;
  yes_bid: number; // cents (1-99)
  yes_ask: number; // cents (1-99)
  last_price: number; // cents (1-99)
  volume: number; // contracts traded (lifetime)
  volume_24h?: number; // contracts traded in last 24h
  open_interest: number; // contracts currently outstanding
  liquidity?: number;
  close_time?: string;
  expected_expiration_time?: string;
}

/**
 * A single normalized outcome for a game (e.g. "Brazil win", "Draw",
 * "Haiti win") with both the probability signal and the volume signal.
 */
export interface KalshiOutcome {
  ticker: string;
  selection: string; // human label, e.g. "Brazil" or "Draw"
  side: KalshiOutcomeSide; // win / tie / lose relative to the home/listed team
  priceCents: number; // 1-99, contract mid/last price
  bidCents?: number; // best YES bid (what you get selling YES)
  askCents?: number; // best YES ask (what you pay buying YES — the executable price)
  impliedProbability: number; // 0-1, derived from priceCents
  fairProbability: number; // impliedProbability with the event's overround removed
  americanOdds: number; // converted for parity with the sportsbook side
  volume: number; // lifetime contracts traded
  volume24h: number; // contracts traded in last 24h
  openInterest: number; // outstanding contracts (money currently on the line)
  notionalUsd: number; // approx $ on the line = openInterest * priceCents/100
}

/**
 * A game/event grouping its win/tie/lose outcomes.
 */
export interface KalshiGame {
  eventTicker: string;
  sportKey: string;
  sportTitle: string;
  title: string; // e.g. "Brazil vs Haiti"
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  outcomes: KalshiOutcome[];
  totalVolume: number; // sum of outcome volume
  totalOpenInterest: number; // sum of outcome open interest
}

/**
 * One row in the "highest bets" ranking — the most heavily backed outcome,
 * across all games, by the chosen volume metric.
 */
export interface KalshiHighestBet {
  eventTicker: string;
  title: string;
  selection: string;
  side: KalshiOutcomeSide;
  priceCents: number;
  impliedProbability: number;
  americanOdds: number;
  volume: number;
  volume24h: number;
  openInterest: number;
  notionalUsd: number;
}

/**
 * One row in the "most probable event" ranking — the single likeliest outcome
 * per game, sorted by market-implied probability.
 */
export interface KalshiProbableEvent {
  eventTicker: string;
  title: string;
  favoredSelection: string;
  side: KalshiOutcomeSide;
  impliedProbability: number;
  priceCents: number;
  americanOdds: number;
  volume: number;
  openInterest: number;
}

export type VolumeMetric = 'volume' | 'volume24h' | 'openInterest' | 'notionalUsd';
