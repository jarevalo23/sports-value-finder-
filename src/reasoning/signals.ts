// Deterministic signal extraction for a big play.
//
// Every number the reasoning layer (and the LLM) talks about is computed here,
// from market data only. Signals that can't be computed are null — never
// guessed — and the narrative must treat them as unknown.

import type { MatchedEvent, Stance, Trade, Venue, VenueOutcome } from '@/types/market';
import type { Signal, SignalId, SignalUnit } from './types';
import { contractEvPerDollar } from '@/utils/oddsCalculations';

const MIN = 60_000;

export interface PlayContext {
  play: Trade;
  event: MatchedEvent;
  /** All fetched trades for this event, across venues. */
  trades: Trade[];
  now: number;
  feeCoefficients: Record<Trade['venue'], number>;
}

interface Quote {
  mid: number;
  bid: number;
  ask: number;
  basis: 'snapshot' | 'print';
}

// ------------------------------------------------------------ helpers

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Positive when the move is in the bettor's favour. */
const signed = (stance: Stance, delta: number) => (stance === 'for' ? delta : -delta);
/** Cash cost of one $1 contract on the given side at YES probability p. */
const sideCost = (stance: Stance, p: number) => (stance === 'for' ? p : 1 - p);
const t = (trade: Trade) => Date.parse(trade.timestamp);

export function otherExchange(venue: Trade['venue']): Trade['venue'] {
  return venue === 'kalshi' ? 'polymarket' : 'kalshi';
}

function outcomeOn(event: MatchedEvent, venue: Venue, key: string): VenueOutcome | undefined {
  return event.venues[venue]?.outcomes.find((o) => o.key === key);
}

/**
 * Latest print at/before `at` within `lookbackMin`, else the first print
 * after `at` within 10 minutes. Excludes the play itself.
 */
function printNear(
  trades: Trade[],
  ctx: PlayContext,
  venue: Venue,
  at: number,
  lookbackMin = 30,
  outcomeKey: string = ctx.play.outcomeKey
): Trade | null {
  const series = trades
    .filter((x) => x.venue === venue && x.outcomeKey === outcomeKey && x.tradeId !== ctx.play.tradeId)
    .sort((a, b) => t(a) - t(b));
  let before: Trade | null = null;
  for (const x of series) if (t(x) <= at && t(x) >= at - lookbackMin * MIN) before = x;
  if (before) return before;
  return series.find((x) => t(x) > at && t(x) <= at + 10 * MIN) ?? null;
}

/**
 * Best estimate of a venue's executable quote at time `at`: the live book if
 * the play is recent, otherwise the nearest trade print widened by the
 * current half-spread.
 */
function quoteAt(ctx: PlayContext, venue: Venue, at: number): Quote | null {
  const outcome = outcomeOn(ctx.event, venue, ctx.play.outcomeKey);
  if (!outcome) return null;
  const half = outcome.ask != null && outcome.bid != null ? (outcome.ask - outcome.bid) / 2 : 0.01;
  if (ctx.now - at <= 10 * MIN) {
    const mid = outcome.rawProbability;
    return { mid, bid: outcome.bid ?? mid - half, ask: outcome.ask ?? mid + half, basis: 'snapshot' };
  }
  const print = printNear(ctx.trades, ctx, venue, at);
  if (!print) return null;
  return { mid: print.probability, bid: print.probability - half, ask: print.probability + half, basis: 'print' };
}

/**
 * A venue's devigged fair probability for the play's outcome *at time `at`*,
 * rebuilt from trade prints on every outcome of the match. This avoids judging
 * an old fill against prices that already include later moves.
 */
function fairAt(ctx: PlayContext, venue: Venue, at: number): number | null {
  const mids = ctx.event.outcomeKeys.map((k) => printNear(ctx.trades, ctx, venue, at, 60, k)?.probability);
  if (mids.some((m) => m == null)) return null;
  const total = (mids as number[]).reduce((a, b) => a + b, 0);
  const i = ctx.event.outcomeKeys.indexOf(ctx.play.outcomeKey);
  return i < 0 || total <= 0 ? null : (mids[i] as number) / total;
}

function fmt(value: number | null, unit: SignalUnit, extra?: string): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  switch (unit) {
    case 'usd':
      return `$${Math.round(value).toLocaleString('en-US')}`;
    case 'prob':
      return `${(value * 100).toFixed(1)}%`;
    case 'pct':
      return `${sign}${(value * 100).toFixed(1)}%`;
    case 'pts':
      return `${sign}${(value * 100).toFixed(1)} pts`;
    case 'cents':
      return `${sign}${(value * 100).toFixed(1)}¢/contract`;
    case 'x':
      return `${value.toFixed(1)}x`;
    case 'hours':
      return value < 0 ? `${(-value).toFixed(1)}h after kickoff` : `${value.toFixed(1)}h before kickoff`;
    case 'count':
      return String(value);
    case 'rank':
      return `#${value}${extra ?? ''}`;
  }
}

function signal(
  id: SignalId,
  label: string,
  value: number | null,
  unit: SignalUnit,
  description: string,
  extra?: string
): Signal {
  const v = value != null && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
  return { id, label, value: v, unit, display: fmt(v, unit, extra), description };
}

// ------------------------------------------------------------ signals

export function computeSignals(ctx: PlayContext): Signal[] {
  const { play, event, trades, now, feeCoefficients } = ctx;
  const T = t(play);
  const p = play.probability;
  const other = otherExchange(play.venue);

  const fee = (venue: Trade['venue'], prob: number) => feeCoefficients[venue] * prob * (1 - prob);
  const playFee = fee(play.venue, p);
  const playCost = sideCost(play.stance, p) + playFee;

  // Size relative to normal flow in this market.
  const peerNotionals = trades
    .filter((x) => x.venue === play.venue && x.marketId === play.marketId && x.tradeId !== play.tradeId)
    .map((x) => x.notionalUsd);
  const typical = peerNotionals.length >= 5 ? median(peerNotionals) : null;

  // Consensus fair probability from every *other* venue that prices this outcome.
  const otherFairs = (Object.keys(event.venues) as Venue[])
    .filter((v) => v !== play.venue)
    .map((v) => outcomeOn(event, v, play.outcomeKey)?.fairProbability)
    .filter((x): x is number => x != null);
  const consensus = otherFairs.length ? otherFairs.reduce((a, b) => a + b, 0) / otherFairs.length : null;
  const stanceProb = consensus == null ? null : play.stance === 'for' ? consensus : 1 - consensus;

  // What the other exchange thought the outcome was worth when the play happened.
  const fairThen = fairAt(ctx, other, T);
  const stanceProbThen = fairThen == null ? null : play.stance === 'for' ? fairThen : 1 - fairThen;

  // Other exchange's executable quote when the play happened.
  const otherQuote = quoteAt(ctx, other, T);
  const otherSameSideCost = otherQuote
    ? (play.stance === 'for' ? otherQuote.ask : 1 - otherQuote.bid) + fee(other, otherQuote.mid)
    : null;
  const otherOppositeCost = otherQuote
    ? (play.stance === 'for' ? 1 - otherQuote.bid : otherQuote.ask) + fee(other, otherQuote.mid)
    : null;

  // Price path on the play's own venue.
  const before = printNear(trades, ctx, play.venue, T - MIN, 30);
  const hourBefore = printNear(trades, ctx, play.venue, T - 60 * MIN, 90);
  const preMove = before && hourBefore ? signed(play.stance, before.probability - hourBefore.probability) : null;
  const nowOnVenue = outcomeOn(event, play.venue, play.outcomeKey)?.rawProbability;
  const postMove = nowOnVenue != null && now - T > 5 * MIN ? signed(play.stance, nowOnVenue - p) : null;

  const otherNow = outcomeOn(event, other, play.outcomeKey)?.rawProbability;
  const otherPostMove =
    otherQuote && otherQuote.basis === 'print' && otherNow != null
      ? signed(play.stance, otherNow - otherQuote.mid)
      : null;

  // Flow around the play.
  const cluster = trades.filter(
    (x) =>
      x.tradeId !== play.tradeId &&
      x.outcomeKey === play.outcomeKey &&
      x.stance === play.stance &&
      Math.abs(t(x) - T) <= 30 * MIN &&
      x.notionalUsd >= 0.25 * play.notionalUsd
  ).length;
  // Compared in contracts, not dollars: an arbitrage/hedge pairs equal
  // contract counts, while the two legs cost very different cash per contract.
  const oppositeOther = trades
    .filter(
      (x) =>
        x.venue !== play.venue &&
        x.outcomeKey === play.outcomeKey &&
        x.stance !== play.stance &&
        Math.abs(t(x) - T) <= 15 * MIN
    )
    .reduce((s, x) => s + x.size, 0);

  // Where this outcome sits in the match (1 = favourite), by average fair prob.
  const allFair = event.outcomeKeys.map((k) => {
    const fairs = (Object.keys(event.venues) as Venue[])
      .map((v) => outcomeOn(event, v, k)?.fairProbability)
      .filter((x): x is number => x != null);
    return { k, fair: fairs.length ? fairs.reduce((a, b) => a + b, 0) / fairs.length : 0 };
  });
  const rank = [...allFair].sort((a, b) => b.fair - a.fair).findIndex((x) => x.k === play.outcomeKey) + 1;

  return [
    signal('notional_usd', 'Cash committed', play.notionalUsd, 'usd', 'Dollars the taker paid for this position.'),
    signal(
      'size_multiple',
      'Size vs typical trade',
      typical ? play.notionalUsd / typical : null,
      'x',
      'Play notional divided by the median trade notional in the same market.'
    ),
    signal(
      'entry_probability',
      'Entry price',
      p,
      'prob',
      `Implied probability of "${event.outcomeLabels[play.outcomeKey] ?? play.outcomeKey}" at the fill (YES price).`
    ),
    signal(
      'consensus_fair_probability',
      'Cross-venue fair probability',
      consensus,
      'prob',
      'Devigged probability averaged across the other venues, as of now (includes any moves since the fill).'
    ),
    signal(
      'ev_at_fill',
      'EV at the time of the fill',
      stanceProbThen != null ? contractEvPerDollar(stanceProbThen, playCost) : null,
      'pct',
      `Expected return per $1 incl. fees vs ${other}'s devigged price at the moment of the fill (no look-ahead).`
    ),
    signal(
      'ev_vs_consensus',
      'EV vs current consensus',
      stanceProb != null ? contractEvPerDollar(stanceProb, playCost) : null,
      'pct',
      'Expected return per $1 at the fill price incl. fees vs today’s consensus — includes any moves since the fill.'
    ),
    signal('fee_cost', 'Estimated fee', playFee, 'cents', 'Estimated taker fee per $1 contract on this venue.'),
    signal(
      'cross_venue_price_gap',
      'Price vs other exchange',
      otherSameSideCost != null ? otherSameSideCost - playCost : null,
      'cents',
      `Cost of the same position on ${other} at the time minus what was paid here (positive = got the better price).`
    ),
    signal(
      'arbitrage_margin',
      'Locked-in arbitrage margin',
      otherOppositeCost != null ? 1 - (playCost + otherOppositeCost) : null,
      'cents',
      `Profit per contract from pairing this fill with the opposite side on ${other} (positive = risk-free after fees).`
    ),
    signal(
      'pre_trade_move',
      'Move in the hour before',
      preMove,
      'pts',
      "Price change on this venue in the ~60 minutes before the play, in the bettor's direction."
    ),
    signal(
      'post_trade_move',
      'Move since the play (same venue)',
      postMove,
      'pts',
      "Current mid minus the fill price, in the bettor's direction."
    ),
    signal(
      'other_venue_post_move',
      'Move since the play (other exchange)',
      otherPostMove,
      'pts',
      `How far ${other} has moved since the play, in the bettor's direction — follow-through elsewhere.`
    ),
    signal(
      'same_direction_cluster',
      'Same-direction trades nearby',
      cluster,
      'count',
      'Other sizeable trades (≥25% of this one) on the same side within ±30 minutes, any venue.'
    ),
    signal(
      'opposite_flow_other_venue',
      'Opposite flow on other venues',
      play.size > 0 ? oppositeOther / play.size : null,
      'x',
      'Opposite-side contracts on other venues within ±15 minutes, relative to this play’s contracts.'
    ),
    signal(
      'hours_to_kickoff',
      'Timing',
      (Date.parse(event.commenceTime) - T) / 3600_000,
      'hours',
      'Hours between the play and kickoff (soccer lineups typically drop ~1h before).'
    ),
    signal('favorite_rank', 'Outcome rank', rank || null, 'rank', '1 = match favourite by fair probability.', ` of ${event.outcomeKeys.length}`),
    signal(
      'venue_overround',
      'Venue margin',
      event.venues[play.venue]?.overround ?? null,
      'pct',
      'Sum of implied probabilities minus 1 on the play venue for this match.'
    ),
  ];
}

export function signalValue(signals: Signal[], id: SignalId): number | null {
  return signals.find((s) => s.id === id)?.value ?? null;
}
