import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzedPlay } from './types';

// Mock only the network call; keep the SDK's real error classes.
const parse = vi.fn();
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic extends actual.default {
    constructor() {
      super({ apiKey: 'test' });
      Object.defineProperty(this, 'beta', { value: { messages: { parse } } });
    }
  }
  return { ...actual, default: FakeAnthropic };
});

let plays: AnalyzedPlay[];
let explainPlay: typeof import('./explainer').explainPlay;
let Anthropic: typeof import('@anthropic-ai/sdk').default;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  ({ explainPlay } = await import('./explainer'));
  ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  const { findBigPlays } = await import('./pipeline');
  ({ plays } = await findBigPlays({ minNotionalUsd: 10_000, limit: 20, explain: 0, lookbackHours: 24 }));
});

beforeEach(() => parse.mockReset());

const output = (overrides: Record<string, unknown> = {}) => ({
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  parsed_output: {
    headline: 'Late Man City money that the market followed',
    primary_reason: 'informed_flow',
    confidence: 'high',
    narrative: 'n',
    supporting_evidence: [{ signal: 'other_venue_post_move', why: 'Kalshi followed.' }],
    counter_evidence: [],
    what_would_change_my_mind: ['Prices revert'],
    follow_takeaway: 'Following now is slightly negative EV.',
    ...overrides,
  },
});

// Each test uses a different play so the explanation cache doesn't interfere.
const pick = (i: number) => plays[i];

describe('explainPlay', () => {
  it('returns Claude’s structured explanation and sends best-practice request options', async () => {
    parse.mockResolvedValueOnce(output());
    const e = await explainPlay(pick(0));

    expect(e.source).toBe('claude');
    expect(e.primaryReason).toBe('informed_flow');
    expect(e.supportingEvidence[0].signal).toBe('other_venue_post_move');

    const req = parse.mock.calls[0][0];
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toContain('server-side-fallback-2026-07-01');
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.output_config.effort).toBe('medium');
    expect(req.output_config.format).toBeDefined();
    // Every number the model may use is in the payload; nothing volatile in the system prompt.
    const payload = JSON.parse(req.messages[0].content);
    expect(payload.signals.length).toBeGreaterThan(10);
    expect(req.system[0].text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('caches explanations for unchanged evidence', async () => {
    parse.mockResolvedValue(output());
    await explainPlay(pick(1));
    await explainPlay(pick(1));
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('flags when the model picks an explanation the rules scored low', async () => {
    const play = pick(2);
    const lowest = play.hypotheses[play.hypotheses.length - 1];
    expect(lowest.score).toBeLessThan(0.25);
    parse.mockResolvedValueOnce(output({ primary_reason: lowest.id }));
    const e = await explainPlay(play);
    expect(e.disagreesWithRules).toBe(true);
  });

  it('falls back to rules on refusal', async () => {
    parse.mockResolvedValueOnce({ ...output(), stop_reason: 'refusal', parsed_output: null });
    const e = await explainPlay(pick(3));
    expect(e.source).toBe('rules');
    expect(e.fallbackReason).toMatch(/declined/);
  });

  it('falls back to rules on API errors without throwing', async () => {
    parse.mockRejectedValueOnce(
      new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers())
    );
    const e = await explainPlay(pick(4));
    expect(e.source).toBe('rules');
    expect(e.fallbackReason).toBe('Anthropic rate limit reached');
    expect(e.primaryReason).toBe(pick(4).hypotheses[0].id);
  });
});
