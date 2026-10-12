// Types for the big-play reasoning layer.
//
// Design rule: numbers are computed deterministically (signals), candidate
// explanations are scored by transparent rules (hypotheses), and the LLM only
// writes the narrative on top — it may weigh the evidence differently, but it
// can only cite signals that exist and pick from a fixed set of explanations.

import type { MatchedEvent, Trade, Venue, DataSource } from '@/types/market';

export const SIGNAL_IDS = [
  'notional_usd',
  'size_multiple',
  'entry_probability',
  'consensus_fair_probability',
  'ev_at_fill',
  'ev_vs_consensus',
  'fee_cost',
  'cross_venue_price_gap',
  'arbitrage_margin',
  'pre_trade_move',
  'post_trade_move',
  'other_venue_post_move',
  'same_direction_cluster',
  'opposite_flow_other_venue',
  'hours_to_kickoff',
  'favorite_rank',
  'venue_overround',
] as const;
export type SignalId = (typeof SIGNAL_IDS)[number];

export type SignalUnit = 'usd' | 'prob' | 'pct' | 'pts' | 'cents' | 'x' | 'hours' | 'count' | 'rank';

export interface Signal {
  id: SignalId;
  label: string;
  /** null when the inputs needed to compute it were unavailable. */
  value: number | null;
  unit: SignalUnit;
  display: string;
  description: string;
}

export const HYPOTHESIS_IDS = [
  'value',
  'arbitrage',
  'hedge',
  'informed_flow',
  'momentum_chase',
  'favorite_backing',
] as const;
export type HypothesisId = (typeof HYPOTHESIS_IDS)[number];

export interface Evidence {
  signal: SignalId;
  effect: 'supports' | 'weakens';
  note: string;
}

export interface Hypothesis {
  id: HypothesisId;
  label: string;
  /** Rule-based plausibility score, 0-1. Not a calibrated probability. */
  score: number;
  evidence: Evidence[];
}

export interface VenueComparisonRow {
  venue: Venue;
  source: DataSource;
  marketId: string;
  label: string;
  fairProbability: number;
  rawProbability: number;
  bid?: number;
  ask?: number;
  overround: number;
}

export interface CitedEvidence {
  signal: SignalId;
  why: string;
}

export interface PlayExplanation {
  /** "claude" when written by the model, "rules" for the deterministic fallback. */
  source: 'claude' | 'rules';
  model?: string;
  headline: string;
  primaryReason: HypothesisId;
  confidence: 'low' | 'medium' | 'high';
  narrative: string;
  supportingEvidence: CitedEvidence[];
  counterEvidence: CitedEvidence[];
  whatWouldChangeMyMind: string[];
  followTakeaway: string;
  /** Model picked a primary reason the rules scored low — worth a human look. */
  disagreesWithRules: boolean;
  /** Why the deterministic fallback was used, when it was. */
  fallbackReason?: string;
}

/** What copying the play would cost right now, at the best executable price. */
export interface FollowNowQuote {
  venue: Venue;
  /** Cost of one $1 contract on the same side, incl. estimated fees. */
  cost: number;
  /** Probability the position pays out, per current cross-venue consensus. */
  fairProbability: number;
  evPerDollar: number;
  display: string;
}

export interface AnalyzedPlay {
  id: string;
  trade: Trade;
  outcomeLabel: string;
  event: Pick<MatchedEvent, 'matchId' | 'title' | 'commenceTime'>;
  comparison: VenueComparisonRow[];
  signals: Signal[];
  hypotheses: Hypothesis[];
  followNow: FollowNowQuote | null;
  explanation?: PlayExplanation;
}
