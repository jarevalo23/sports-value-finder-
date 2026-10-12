// Devigged sportsbook consensus for soccer 3-way (win/draw/lose) markets.
//
// Fixes the audit's core problem for this pipeline: each book's prices are
// devigged *per book* first (so its margin is removed), then the fair
// probabilities are combined with a weighted mean in probability space.
// Sharper, low-margin books can be weighted up via SPORTSBOOK_WEIGHTS.

import type { Game } from '@/types/odds';
import type { DataSource, VenueEvent, VenueOutcome } from '@/types/market';
import { DRAW_KEY } from '@/types/market';
import { devigMultiplicative, impliedProbability } from '@/utils/oddsCalculations';
import { fetchOdds } from '@/services/oddsApi';
import { canonicalTeam, isDrawLabel } from '@/lib/teams';
import { demoSportsbookGames } from '@/services/demo/crossVenueDemo';

const DEFAULT_WEIGHTS: Record<string, number> = {
  pinnacle: 3,
  circasports: 2,
  lowvig: 1.5,
};

/** e.g. SPORTSBOOK_WEIGHTS="pinnacle:3,draftkings:1" */
function bookWeights(): Record<string, number> {
  const weights = { ...DEFAULT_WEIGHTS };
  for (const pair of (process.env.SPORTSBOOK_WEIGHTS || '').split(',')) {
    const [book, w] = pair.split(':');
    if (book && Number.isFinite(Number(w))) weights[book.trim()] = Number(w);
  }
  return weights;
}

export function sportsbookSource(): DataSource {
  const key = process.env.ODDS_API_KEY;
  return key && key !== 'demo' ? 'live' : 'demo';
}

export async function fetchSoccerGames(sportKeys: string[]): Promise<Game[]> {
  if (sportsbookSource() === 'demo') return sportKeys.flatMap((k) => demoSportsbookGames(k));
  const results = await Promise.all(
    sportKeys.map((k) =>
      fetchOdds(k, { apiKey: process.env.ODDS_API_KEY!, markets: ['h2h'], regions: 'us,eu', oddsFormat: 'american' })
    )
  );
  return results.flat();
}

/**
 * Build a consensus VenueEvent from one game's 3-way h2h quotes.
 * Returns null if no book offers a complete 3-way market.
 */
export function sportsbookConsensus(game: Game, weights = bookWeights()): VenueEvent | null {
  const keyOf = (name: string) => (isDrawLabel(name) ? DRAW_KEY : canonicalTeam(name));
  const keys = [canonicalTeam(game.home_team), DRAW_KEY, canonicalTeam(game.away_team)];
  const labels: Record<string, string> = {
    [keys[0]]: game.home_team,
    [DRAW_KEY]: 'Draw',
    [keys[2]]: game.away_team,
  };

  const fairSum: Record<string, number> = {};
  const rawSum: Record<string, number> = {};
  const bestProb: Record<string, number> = {}; // lowest implied prob = best price to back
  let weightTotal = 0;
  let overroundSum = 0;

  for (const book of game.bookmakers) {
    const h2h = book.markets.find((m) => m.key === 'h2h');
    if (!h2h || h2h.outcomes.length !== 3) continue;
    const byKey = new Map(h2h.outcomes.map((o) => [keyOf(o.name), impliedProbability(o.price)]));
    if (!keys.every((k) => byKey.has(k))) continue;

    const raw = keys.map((k) => byKey.get(k)!);
    const fair = devigMultiplicative(raw);
    const w = weights[book.key] ?? 1;
    weightTotal += w;
    overroundSum += w * (raw.reduce((a, b) => a + b, 0) - 1);
    keys.forEach((k, i) => {
      fairSum[k] = (fairSum[k] ?? 0) + w * fair[i];
      rawSum[k] = (rawSum[k] ?? 0) + w * raw[i];
      bestProb[k] = Math.min(bestProb[k] ?? 1, raw[i]);
    });
  }
  if (weightTotal === 0) return null;

  const outcomes: VenueOutcome[] = keys.map((k) => ({
    key: k,
    label: labels[k],
    marketId: `${game.id}:${labels[k]}`,
    rawProbability: rawSum[k] / weightTotal,
    fairProbability: fairSum[k] / weightTotal,
    // Backing at the best available book price — the line-shopping price.
    ask: bestProb[k],
  }));

  return {
    venue: 'sportsbooks',
    source: sportsbookSource(),
    eventId: game.id,
    title: `${game.home_team} vs ${game.away_team}`,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    commenceTime: game.commence_time,
    outcomes,
    overround: overroundSum / weightTotal,
  };
}
