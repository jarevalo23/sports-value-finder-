import { describe, expect, it } from 'vitest';
import type { VenueEvent } from '@/types/market';
import { DRAW_KEY } from '@/types/market';
import { matchEvents } from './eventMatcher';
import { canonicalTeam, splitMatchup } from '@/lib/teams';
import { devigMultiplicative, overround, contractEvPerDollar } from '@/utils/oddsCalculations';

function ev(venue: VenueEvent['venue'], home: string, away: string, kickoffH = 0): VenueEvent {
  const keys = [canonicalTeam(home), DRAW_KEY, canonicalTeam(away)];
  return {
    venue,
    source: 'demo',
    eventId: `${venue}-${home}`,
    title: `${home} vs ${away}`,
    homeTeam: home,
    awayTeam: away,
    commenceTime: new Date(Date.UTC(2026, 9, 12) + kickoffH * 3600_000).toISOString(),
    overround: 0,
    outcomes: keys.map((key, i) => ({
      key,
      label: [home, 'Draw', away][i],
      marketId: `${venue}-${i}`,
      rawProbability: 1 / 3,
      fairProbability: 1 / 3,
    })),
  };
}

describe('team normalization', () => {
  it('maps venue-specific names to one key', () => {
    expect(canonicalTeam('Man City')).toBe(canonicalTeam('Manchester City FC'));
    expect(canonicalTeam('USA')).toBe(canonicalTeam('United States'));
    expect(canonicalTeam('Atlético Madrid')).toBe(canonicalTeam('Atletico Madrid'));
  });

  it('splits matchup titles', () => {
    expect(splitMatchup('Brazil vs. Haiti')).toEqual({ home: 'Brazil', away: 'Haiti' });
    expect(splitMatchup('Man City vs Liverpool Winner?')).toEqual({ home: 'Man City', away: 'Liverpool' });
    expect(splitMatchup('Will it rain?')).toBeNull();
  });
});

describe('matchEvents', () => {
  it('matches across naming differences and swapped home/away', () => {
    const { matched, unmatched } = matchEvents({
      kalshi: [ev('kalshi', 'Man City', 'Liverpool', -2)],
      polymarket: [ev('polymarket', 'Liverpool FC', 'Manchester City FC', 0)],
      sportsbooks: [ev('sportsbooks', 'Manchester City', 'Liverpool', 0)],
    });
    expect(unmatched).toEqual([]);
    expect(matched).toHaveLength(1);
    expect(Object.keys(matched[0].venues).sort()).toEqual(['kalshi', 'polymarket', 'sportsbooks']);
    // Kickoff comes from the books (exact), not Kalshi's approximation.
    expect(matched[0].commenceTime).toBe(ev('sportsbooks', 'a', 'b', 0).commenceTime);
  });

  it('refuses to match different fixtures or far-apart kickoffs', () => {
    const { matched, unmatched } = matchEvents({
      kalshi: [ev('kalshi', 'Brazil', 'Haiti'), ev('kalshi', 'Spain', 'Italy')],
      polymarket: [ev('polymarket', 'Brazil', 'Peru'), ev('polymarket', 'Spain', 'Italy', 72)],
    });
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(4);
  });
});

describe('devig math', () => {
  it('removes the overround so probabilities sum to 1', () => {
    const raw = [0.5238, 0.5238]; // -110 / -110
    expect(overround(raw)).toBeCloseTo(0.0476, 4);
    const fair = devigMultiplicative(raw);
    expect(fair[0]).toBeCloseTo(0.5, 6);
    expect(fair.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('prices $1 contracts', () => {
    expect(contractEvPerDollar(0.5, 0.45)).toBeCloseTo(0.1111, 4);
    expect(contractEvPerDollar(0.5, 0.5)).toBe(0);
  });
});
