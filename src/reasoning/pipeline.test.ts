import { describe, expect, it } from 'vitest';
import { findBigPlays } from './pipeline';

// Runs the full pipeline on the bundled cross-venue demo data, whose scripted
// plays are each designed to exercise one explanation.
describe('findBigPlays (demo data)', async () => {
  const result = await findBigPlays({ minNotionalUsd: 10_000, limit: 20, explain: 0, lookbackHours: 24 });
  const play = (venue: string, outcome: string, stance = 'for') =>
    result.plays.find((p) => p.trade.venue === venue && p.outcomeLabel === outcome && p.trade.stance === stance);
  const sig = (p: ReturnType<typeof play>, id: string) => p!.signals.find((s) => s.id === id)!.value;

  it('matches all three demo matches across venues', () => {
    expect(result.meta.matchedEvents).toBe(3);
    expect(result.meta.unmatchedEvents).toEqual([]);
    expect(result.meta.sources).toEqual({ kalshi: 'demo', polymarket: 'demo', sportsbooks: 'demo' });
    expect(result.meta.warnings).toEqual([]);
  });

  it('flags only trades above the notional floor, largest first', () => {
    expect(result.plays.length).toBe(6);
    expect(result.plays.every((p) => p.trade.notionalUsd >= 10_000)).toBe(true);
    const sizes = result.plays.map((p) => p.trade.notionalUsd);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('compares each play against every venue', () => {
    for (const p of result.plays) {
      expect(p.comparison.map((c) => c.venue).sort()).toEqual(['kalshi', 'polymarket', 'sportsbooks']);
    }
  });

  it('reads Brazil on Kalshi as price-insensitive favourite backing', () => {
    const p = play('kalshi', 'Brazil');
    expect(p!.hypotheses[0].id).toBe('favorite_backing');
    expect(sig(p, 'ev_vs_consensus')!).toBeLessThan(0);
    expect(sig(p, 'cross_venue_price_gap')!).toBeLessThan(0); // cheaper on Polymarket
  });

  it('reads the Argentina–Mexico draw on Kalshi as value', () => {
    const p = play('kalshi', 'Draw');
    expect(p!.hypotheses[0].id).toBe('value');
    expect(sig(p, 'ev_vs_consensus')!).toBeGreaterThan(0.1);
  });

  it('reads the Liverpool Kalshi YES + Polymarket NO pair as arbitrage', () => {
    const yes = play('kalshi', 'Liverpool', 'for');
    const no = play('polymarket', 'Liverpool', 'against');
    expect(yes!.hypotheses[0].id).toBe('arbitrage');
    expect(no!.hypotheses[0].id).toBe('arbitrage');
    expect(sig(yes, 'arbitrage_margin')!).toBeGreaterThan(0);
    // Legs pair ~1:1 in contracts (the cash per leg differs a lot).
    expect(sig(yes, 'opposite_flow_other_venue')!).toBeGreaterThan(0.8);
    expect(sig(yes, 'opposite_flow_other_venue')!).toBeLessThan(1.25);
  });

  it('reads late Man City buying on Polymarket as informed flow', () => {
    const p = play('polymarket', 'Man City');
    expect(p!.hypotheses[0].id).toBe('informed_flow');
    expect(sig(p, 'other_venue_post_move')!).toBeGreaterThan(0.015);
    expect(sig(p, 'hours_to_kickoff')!).toBeLessThan(2);
  });

  it('reads Argentina on Polymarket as chasing a move', () => {
    const p = play('polymarket', 'Argentina');
    expect(p!.hypotheses[0].id).toBe('momentum_chase');
    expect(sig(p, 'pre_trade_move')!).toBeGreaterThan(0.02);
    expect(sig(p, 'post_trade_move')!).toBeLessThan(0);
  });

  it('falls back to rules explanations when no LLM is configured', () => {
    for (const p of result.plays) {
      expect(p.explanation?.source).toBe('rules');
      expect(p.explanation?.primaryReason).toBe(p.hypotheses[0].id);
    }
  });

  it('quotes what copying each play would cost now', () => {
    for (const p of result.plays) {
      expect(p.followNow).not.toBeNull();
      expect(p.followNow!.cost).toBeGreaterThan(0);
      expect(p.followNow!.cost).toBeLessThan(1);
    }
  });
});

describe('ev_at_fill (no look-ahead)', async () => {
  const { plays } = await findBigPlays({ minNotionalUsd: 10_000, limit: 20, explain: 0, lookbackHours: 24 });

  it('does not credit informed flow with value it only had in hindsight', () => {
    const city = plays.find((p) => p.trade.venue === 'polymarket' && p.outcomeLabel === 'Man City')!;
    const atFill = city.signals.find((s) => s.id === 'ev_at_fill')!.value!;
    const now = city.signals.find((s) => s.id === 'ev_vs_consensus')!.value!;
    expect(atFill).toBeLessThan(0.01); // roughly fair when placed…
    expect(now).toBeGreaterThan(0.04); // …the market moved to it afterwards
    expect(city.hypotheses.find((h) => h.id === 'value')!.score).toBeLessThan(0.2);
  });
});
