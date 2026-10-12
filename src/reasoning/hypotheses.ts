// Rule-based scoring of *why* a big play was made.
//
// Each hypothesis gets a 0-1 plausibility score from transparent rules over
// the signals, plus the evidence that moved it. Scores are heuristics for
// ranking explanations — not calibrated probabilities — and they are what
// the LLM narrative is checked against.

import type { Trade } from '@/types/market';
import type { Evidence, Hypothesis, HypothesisId, Signal } from './types';
import { signalValue } from './signals';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const HYPOTHESIS_LABELS: Record<HypothesisId, string> = {
  value: 'Priced edge vs the market',
  arbitrage: 'Cross-venue arbitrage',
  hedge: 'Hedging an existing position',
  informed_flow: 'Informed / early-information flow',
  momentum_chase: 'Chasing a move',
  favorite_backing: 'Price-insensitive favourite backing',
};

export const HYPOTHESIS_DESCRIPTIONS: Record<HypothesisId, string> = {
  value: 'The fill was cheaper than the cross-venue fair probability — a positive-EV bet on price alone.',
  arbitrage: 'The fill can be paired with the opposite side on another exchange for a locked-in profit.',
  hedge: 'Large opposite-side flow on another venue at the same time, without a locked profit — likely offsetting risk.',
  informed_flow: 'Late, large, and the market (including the other exchange) moved in its direction afterwards.',
  momentum_chase: 'Bought after the price had already run in that direction, at or worse than fair, and it gave back.',
  favorite_backing: 'Big money on a heavy favourite at a worse price than available elsewhere — popularity, not edge.',
};

type Rule = (s: (id: Signal['id']) => number | null, play: Trade) => { score: number; evidence: Evidence[] };

/** Prefer edge measured at the fill (no look-ahead); fall back to today's consensus. */
function edge(s: (id: Signal['id']) => number | null): { id: Signal['id']; value: number | null } {
  const atFill = s('ev_at_fill');
  return atFill != null ? { id: 'ev_at_fill', value: atFill } : { id: 'ev_vs_consensus', value: s('ev_vs_consensus') };
}

const RULES: Record<HypothesisId, Rule> = {
  value: (s) => {
    const { id: evId, value: ev } = edge(s);
    const gap = s('cross_venue_price_gap');
    const evidence: Evidence[] = [];
    if (ev == null) return { score: 0, evidence };
    let score = clamp01(ev / 0.08);
    if (ev >= 0.02) evidence.push({ signal: evId, effect: 'supports', note: 'Filled below fair value.' });
    if (ev < 0) evidence.push({ signal: evId, effect: 'weakens', note: 'Paid more than fair value.' });
    if (gap != null && gap > 0.005 && ev > 0) {
      score = clamp01(score + 0.1);
      evidence.push({ signal: 'cross_venue_price_gap', effect: 'supports', note: 'Got a better price than the other exchange.' });
    }
    return { score, evidence };
  },

  arbitrage: (s) => {
    const margin = s('arbitrage_margin');
    const opposite = s('opposite_flow_other_venue');
    const evidence: Evidence[] = [];
    if (margin == null) return { score: 0, evidence };
    let score = margin > 0 ? 0.45 + 0.4 * clamp01(margin / 0.03) : 0;
    if (margin > 0) evidence.push({ signal: 'arbitrage_margin', effect: 'supports', note: 'Opposite side on the other exchange locks a profit.' });
    else evidence.push({ signal: 'arbitrage_margin', effect: 'weakens', note: 'No locked profit against the other exchange.' });
    if (opposite != null && opposite >= 0.5 && margin > -0.01) {
      score = clamp01(score + 0.3);
      evidence.push({ signal: 'opposite_flow_other_venue', effect: 'supports', note: 'A similar number of opposite-side contracts on the other venue — the other leg.' });
    }
    return { score, evidence };
  },

  hedge: (s) => {
    const opposite = s('opposite_flow_other_venue');
    const margin = s('arbitrage_margin');
    const evidence: Evidence[] = [];
    if (opposite == null || opposite < 0.3) return { score: 0, evidence };
    const locked = margin != null && margin > 0;
    const score = clamp01(opposite) * (locked ? 0.3 : 0.75);
    evidence.push({ signal: 'opposite_flow_other_venue', effect: 'supports', note: 'Offsetting flow on another venue at the same time.' });
    if (locked) evidence.push({ signal: 'arbitrage_margin', effect: 'weakens', note: 'The pair locks a profit, which reads as arbitrage rather than a hedge.' });
    return { score, evidence };
  },

  informed_flow: (s) => {
    const post = s('post_trade_move');
    const otherPost = s('other_venue_post_move');
    const cluster = s('same_direction_cluster');
    const hours = s('hours_to_kickoff');
    const size = s('size_multiple');
    const pre = s('pre_trade_move');
    const evidence: Evidence[] = [];
    let score = 0;
    if (post != null && post >= 0.02) {
      score += 0.3 * clamp01(post / 0.04);
      evidence.push({ signal: 'post_trade_move', effect: 'supports', note: 'Price kept moving in the bettor’s direction.' });
    } else if (post != null && post < 0) {
      evidence.push({ signal: 'post_trade_move', effect: 'weakens', note: 'Price moved against the bettor afterwards.' });
    }
    if (otherPost != null && otherPost >= 0.015) {
      score += 0.3 * clamp01(otherPost / 0.03);
      evidence.push({ signal: 'other_venue_post_move', effect: 'supports', note: 'The other exchange repriced the same way — not one venue’s noise.' });
    }
    if (cluster != null && cluster >= 1) {
      score += 0.15;
      evidence.push({ signal: 'same_direction_cluster', effect: 'supports', note: 'Other sizeable trades on the same side around the same time.' });
    }
    if (hours != null && hours >= 0 && hours <= 2) {
      score += 0.15;
      evidence.push({ signal: 'hours_to_kickoff', effect: 'supports', note: 'Placed in the lineup-announcement window.' });
    }
    if (size != null && size >= 10) score += 0.1;
    if (pre != null && pre >= 0.03) {
      score -= 0.15;
      evidence.push({ signal: 'pre_trade_move', effect: 'weakens', note: 'The move started before this trade — it followed rather than led.' });
    }
    return { score: clamp01(score), evidence };
  },

  momentum_chase: (s) => {
    const pre = s('pre_trade_move');
    const { id: evId, value: ev } = edge(s);
    const post = s('post_trade_move');
    const evidence: Evidence[] = [];
    if (pre == null || pre < 0.02) return { score: 0, evidence };
    let score = 0.35 + 0.2 * clamp01(pre / 0.06);
    evidence.push({ signal: 'pre_trade_move', effect: 'supports', note: 'Bought after the price had already run.' });
    if (ev != null && ev <= 0) {
      score += 0.25;
      evidence.push({ signal: evId, effect: 'supports', note: 'Paid at or above fair value.' });
    }
    if (post != null && post <= 0) {
      score += 0.2;
      evidence.push({ signal: 'post_trade_move', effect: 'supports', note: 'The move reversed after the trade.' });
    }
    return { score: clamp01(score), evidence };
  },

  favorite_backing: (s, play) => {
    const rank = s('favorite_rank');
    const entry = s('entry_probability');
    const { id: evId, value: ev } = edge(s);
    const gap = s('cross_venue_price_gap');
    const post = s('post_trade_move');
    const evidence: Evidence[] = [];
    if (play.stance !== 'for' || rank !== 1 || entry == null || entry < 0.6) return { score: 0, evidence };
    let score = 0.35;
    evidence.push({ signal: 'favorite_rank', effect: 'supports', note: 'Backing the match favourite.' });
    if (ev != null && ev < 0) {
      score += 0.3;
      evidence.push({ signal: evId, effect: 'supports', note: 'Negative expected value at this price.' });
    }
    if (gap != null && gap < 0) {
      score += 0.2;
      evidence.push({ signal: 'cross_venue_price_gap', effect: 'supports', note: 'Cheaper on the other exchange — price-insensitive.' });
    }
    if (post != null && post <= 0.005) score += 0.1;
    return { score: clamp01(score), evidence };
  },
};

export function scoreHypotheses(signals: Signal[], play: Trade): Hypothesis[] {
  const s = (id: Signal['id']) => signalValue(signals, id);
  return (Object.keys(RULES) as HypothesisId[])
    .map((id) => {
      const { score, evidence } = RULES[id](s, play);
      return { id, label: HYPOTHESIS_LABELS[id], score: Number(score.toFixed(3)), evidence };
    })
    .sort((a, b) => b.score - a.score);
}
