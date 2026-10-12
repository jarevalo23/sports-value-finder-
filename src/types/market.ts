// Venue-neutral market model.
//
// Kalshi, Polymarket and sportsbooks all price the same soccer match, but with
// different units (cents, 0-1 share prices, American odds) and different
// labels. Every venue adapter converts into these types so cross-venue
// comparison and the reasoning layer never deal with venue quirks.
//
// All prices are probabilities in [0, 1].

export type Venue = 'kalshi' | 'polymarket' | 'sportsbooks';
export type DataSource = 'live' | 'demo';

/** Outcome key for the draw; team outcomes use canonicalTeam(name). */
export const DRAW_KEY = 'draw';

export interface VenueOutcome {
  /** canonicalTeam(name) or DRAW_KEY — identical across venues. */
  key: string;
  /** The venue's own label, e.g. "Man City" or "Tie". */
  label: string;
  /** Kalshi ticker / Polymarket conditionId / sportsbook selection name. */
  marketId: string;
  /** Venue's quoted probability (last/mid for exchanges, consensus for books). */
  rawProbability: number;
  /** rawProbability with the event's overround removed (sums to 1 per event). */
  fairProbability: number;
  /** Best price a buyer of YES must pay (executable), if known. */
  ask?: number;
  /** Best price a seller of YES receives (executable), if known. */
  bid?: number;
  /** Lifetime traded contracts/shares, if known. */
  volume?: number;
}

export interface VenueEvent {
  venue: Venue;
  source: DataSource;
  eventId: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  outcomes: VenueOutcome[];
  /** Sum of raw probabilities minus 1 (the venue's margin on this event). */
  overround: number;
}

/** Whether a trade backs the outcome happening or bets against it. */
export type Stance = 'for' | 'against';

export interface Trade {
  venue: Exclude<Venue, 'sportsbooks'>;
  tradeId: string;
  eventId: string;
  marketId: string;
  outcomeKey: string;
  stance: Stance;
  /** Implied probability of the OUTCOME at the fill (YES price). */
  probability: number;
  /** Contracts (Kalshi) or shares (Polymarket), each paying $1. */
  size: number;
  /** Cash the taker paid. */
  notionalUsd: number;
  timestamp: string;
  /** Public trader identifier when the venue exposes one (Polymarket wallet). */
  trader?: string;
}

/** The same real-world match as seen by each venue. */
export interface MatchedEvent {
  matchId: string;
  title: string;
  commenceTime: string;
  /** Canonical outcome keys in display order (home, draw, away). */
  outcomeKeys: string[];
  outcomeLabels: Record<string, string>;
  venues: Partial<Record<Venue, VenueEvent>>;
}
