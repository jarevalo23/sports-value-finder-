// Semantic explanation of a big play.
//
// Claude turns the deterministic signals + rule-scored hypotheses into a
// plain-English explanation of why the play was likely made. Guardrails:
//   - structured output: primary_reason and every cited signal come from
//     fixed enums, so the model can't cite evidence that doesn't exist;
//   - all numbers are pre-computed and passed in; the prompt forbids new math;
//   - the result is checked against the rule scores (disagreesWithRules);
//   - any failure (no key, refusal, timeout, rate limit, bad output) falls back
//     to a deterministic rules-based explanation, never an error to the user.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { TtlCache } from '@/lib/cache';
import type { AnalyzedPlay, CitedEvidence, HypothesisId, PlayExplanation } from './types';
import { HYPOTHESIS_IDS, SIGNAL_IDS } from './types';
import { HYPOTHESIS_DESCRIPTIONS, HYPOTHESIS_LABELS } from './hypotheses';

const MODEL = process.env.REASONING_MODEL || 'claude-opus-5-5';
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORT: Effort = (['low', 'medium', 'high', 'xhigh', 'max'] as const).includes(
  process.env.REASONING_EFFORT as Effort
)
  ? (process.env.REASONING_EFFORT as Effort)
  : 'medium';

const ExplanationOutput = z.object({
  headline: z.string(),
  primary_reason: z.enum(HYPOTHESIS_IDS),
  confidence: z.enum(['low', 'medium', 'high']),
  narrative: z.string(),
  supporting_evidence: z.array(z.object({ signal: z.enum(SIGNAL_IDS), why: z.string() })),
  counter_evidence: z.array(z.object({ signal: z.enum(SIGNAL_IDS), why: z.string() })),
  what_would_change_my_mind: z.array(z.string()),
  follow_takeaway: z.string(),
});

// Stable across requests (no timestamps/IDs) so the prefix caches.
const SYSTEM_PROMPT = `You are a sports-betting market analyst. You explain why a specific large trade (a "big play") was likely placed on a prediction-market exchange (Kalshi or Polymarket), using cross-venue market data: the other exchange plus a devigged sportsbook consensus.

You receive JSON containing: the play, the match, a per-venue price comparison, deterministic signals (every number you may use), rule-based hypothesis scores, and a follow_now quote (what copying the play would cost right now).

Candidate explanations — primary_reason must be one of these ids:
${HYPOTHESIS_IDS.map((id) => `- ${id}: ${HYPOTHESIS_DESCRIPTIONS[id]}`).join('\n')}

How to reason:
- Use only numbers that appear in the input; quote their display strings. Do not compute new figures.
- A signal whose value is null is unknown. Do not infer it.
- You cannot see news, lineups, injuries, or who the trader is. If informed flow is plausible, you may name the kind of information that could explain it, labelled as unverified.
- ev_at_fill is the edge at the moment of the trade (vs the other exchange's devigged price then). ev_vs_consensus and consensus_fair_probability use current prices, so for older plays they include later moves. Judge "was this a good price when placed" from ev_at_fill, and treat a gap between the two as "the market later moved toward (or away from) the bettor".
- Several explanations can hold at once (for example value and informed flow, or arbitrage and hedge). Choose the one that best explains why this trade was made, and name a close runner-up in the narrative.
- The rule scores are a starting point. You may disagree with them, but say which signals justify it.
- confidence: high only when several independent signals agree; low when key signals are null or conflict.
- follow_takeaway: one or two factual sentences on whether taking the same side now, at the follow_now price, would be positive expected value versus consensus. Mention fees when they matter. Do not tell the reader to bet.

Write for a bettor: headline under 12 words, narrative of 2-4 sentences, evidence items one sentence each.`;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (process.env.REASONING_LLM === 'off') return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  // Timeouts are retried by the SDK: worst case ≈ timeout × (maxRetries + 1).
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return client;
}

const explanationCache = new TtlCache<PlayExplanation>(500);

function cacheKeyFor(play: AnalyzedPlay): string {
  // Re-explain when the evidence changes, not on every request.
  const fingerprint = play.signals.map((s) => `${s.id}:${s.value}`).join('|');
  return `${MODEL}:${EFFORT}:${play.id}:${fingerprint}:${play.followNow?.evPerDollar ?? 'na'}`;
}

function buildPayload(play: AnalyzedPlay) {
  return {
    play: {
      venue: play.trade.venue,
      outcome: play.outcomeLabel,
      stance: play.trade.stance === 'for' ? `backed ${play.outcomeLabel}` : `bet against ${play.outcomeLabel}`,
      fill_probability: play.trade.probability,
      size: play.trade.size,
      notional_usd: play.trade.notionalUsd,
      time: play.trade.timestamp,
      trader: play.trade.trader ? `${play.trade.trader.slice(0, 6)}…${play.trade.trader.slice(-4)}` : null,
    },
    match: { title: play.event.title, kickoff: play.event.commenceTime },
    comparison: play.comparison.map((c) => ({
      venue: c.venue,
      data: c.source,
      fair_probability: Number(c.fairProbability.toFixed(4)),
      bid: c.bid ?? null,
      ask: c.ask ?? null,
      venue_margin: Number(c.overround.toFixed(4)),
    })),
    signals: play.signals.map((s) => ({ id: s.id, label: s.label, value: s.value, display: s.display, meaning: s.description })),
    rule_hypotheses: play.hypotheses.map((h) => ({
      id: h.id,
      score: h.score,
      evidence: h.evidence.map((e) => `${e.effect}: ${e.signal} — ${e.note}`),
    })),
    follow_now: play.followNow
      ? { venue: play.followNow.venue, summary: play.followNow.display, ev_per_dollar: play.followNow.evPerDollar }
      : null,
  };
}

function disagrees(play: AnalyzedPlay, primary: HypothesisId): boolean {
  const chosen = play.hypotheses.find((h) => h.id === primary)?.score ?? 0;
  const top = play.hypotheses[0]?.score ?? 0;
  return chosen < 0.25 && top >= 0.5;
}

// ------------------------------------------------------- rules fallback

const CHANGE_MY_MIND: Record<HypothesisId, string[]> = {
  value: ['Consensus moves to the fill price before kickoff', 'A sharp book prices the outcome well below consensus'],
  arbitrage: ['The opposite leg turns out to be an unrelated trader', 'Fees or slippage exceed the locked margin'],
  hedge: ['The opposite flow is unrelated retail', 'The position grows instead of being offset'],
  informed_flow: ['Prices revert before kickoff', 'Confirmed lineups or news contradict the direction of the play'],
  momentum_chase: ['The price keeps trending after the trade', 'News emerges that justified the run-up'],
  favorite_backing: ['The other exchange reprices up to this fill', 'The trader turns out to be hedging a short elsewhere'],
};

export function rulesExplanation(play: AnalyzedPlay, fallbackReason?: string): PlayExplanation {
  const [top, second] = play.hypotheses;
  const display = (id: string) => play.signals.find((s) => s.id === id)?.display ?? 'n/a';
  // The UI shows each cited signal's value next to the sentence.
  const cite = (e: { signal: CitedEvidence['signal']; note: string }): CitedEvidence => ({
    signal: e.signal,
    why: e.note,
  });

  const supporting = top.evidence.filter((e) => e.effect === 'supports').map(cite);
  const counter = top.evidence.filter((e) => e.effect === 'weakens').map(cite);
  if (second && second.score >= 0.4) {
    counter.push(
      ...second.evidence
        .filter((e) => e.effect === 'supports')
        .slice(0, 1)
        .map((e) => ({ signal: e.signal, why: `Also consistent with ${second.label.toLowerCase()}: ${e.note}` }))
    );
  }

  const gapToNext = top.score - (second?.score ?? 0);
  const confidence = top.score >= 0.7 && gapToNext >= 0.2 ? 'high' : top.score >= 0.45 ? 'medium' : 'low';
  const side = play.trade.stance === 'for' ? `on ${play.outcomeLabel}` : `against ${play.outcomeLabel}`;

  return {
    source: 'rules',
    headline: `${display('notional_usd')} ${side}: ${HYPOTHESIS_LABELS[top.id].toLowerCase()}`,
    primaryReason: top.id,
    confidence,
    narrative:
      second && second.score >= 0.4
        ? `${HYPOTHESIS_DESCRIPTIONS[top.id]} Runner-up: ${second.label.toLowerCase()} (rule score ${second.score.toFixed(2)} vs ${top.score.toFixed(2)}).`
        : HYPOTHESIS_DESCRIPTIONS[top.id],
    supportingEvidence: supporting,
    counterEvidence: counter,
    whatWouldChangeMyMind: CHANGE_MY_MIND[top.id],
    followTakeaway: play.followNow
      ? play.followNow.display
      : 'No current executable price on any venue to evaluate following this play.',
    disagreesWithRules: false,
    fallbackReason,
  };
}

// ----------------------------------------------------------- LLM path

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic authentication failed';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Anthropic key lacks permission for this model';
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic rate limit reached';
  if (err instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Anthropic request timed out';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API';
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}

export async function explainPlay(play: AnalyzedPlay): Promise<PlayExplanation> {
  const anthropic = getClient();
  if (!anthropic) return rulesExplanation(play, 'No Anthropic credentials configured (set ANTHROPIC_API_KEY)');

  return explanationCache
    .getOrLoad(cacheKeyFor(play), 15 * 60_000, async () => {
      const response = await anthropic.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // If a safety classifier declines, retry server-side on Anthropic's
        // recommended fallback model instead of failing the request.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: EFFORT, format: betaZodOutputFormat(ExplanationOutput) },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: JSON.stringify(buildPayload(play)) }],
      });

      if (response.stop_reason === 'refusal') throw new Error('model declined to explain this play');
      if (response.stop_reason === 'max_tokens') throw new Error('explanation was cut off (max_tokens)');
      const out = response.parsed_output;
      if (!out) throw new Error('explanation did not match the expected schema');

      return {
        source: 'claude',
        model: response.model,
        headline: out.headline,
        primaryReason: out.primary_reason,
        confidence: out.confidence,
        narrative: out.narrative,
        supportingEvidence: out.supporting_evidence,
        counterEvidence: out.counter_evidence,
        whatWouldChangeMyMind: out.what_would_change_my_mind,
        followTakeaway: out.follow_takeaway,
        disagreesWithRules: disagrees(play, out.primary_reason),
      } satisfies PlayExplanation;
    })
    .catch((err) => {
      const reason = describeError(err);
      console.warn(`[reasoning] falling back to rules for ${play.id}: ${reason}`);
      return rulesExplanation(play, reason);
    });
}
