// Big-play pipeline: load venues -> match events -> pull trades -> detect big
// plays -> signals -> hypotheses -> explanation.
//
// Venue failures are isolated: a venue that errors is dropped from the
// comparison and reported in `warnings`. It is never replaced with demo data,
// because mixing demo prices into live comparisons would fabricate signals.

import type { DataSource, MatchedEvent, Trade, Venue, VenueEvent } from '@/types/market';
import type { AnalyzedPlay, FollowNowQuote, VenueComparisonRow } from './types';
import { computeSignals } from './signals';
import { scoreHypotheses } from './hypotheses';
import { explainPlay, rulesExplanation } from './explainer';
import { matchEvents } from '@/services/eventMatcher';
import {
  fetchKalshiEvents,
  fetchKalshiTrades,
  kalshiGameToVenueEvent,
  kalshiSource,
  normalizeKalshiEvents,
  KALSHI_FEE_COEFFICIENT,
} from '@/services/kalshiApi';
import {
  fetchPolymarketEvents,
  fetchPolymarketTrades,
  polymarketEventToVenueEvent,
  polymarketSource,
  POLYMARKET_FEE_COEFFICIENT,
} from '@/services/polymarketApi';
import { fetchSoccerGames, sportsbookConsensus, sportsbookSource } from '@/services/sportsbookConsensus';
import { TtlCache, cacheKey } from '@/lib/cache';
import { mapLimit } from '@/lib/http';
import { contractEvPerDollar } from '@/utils/oddsCalculations';

export interface BigPlayOptions {
  minNotionalUsd: number;
  limit: number;
  /** How many of the top plays get an LLM explanation (the rest use rules). */
  explain: number;
  lookbackHours: number;
}

export interface BigPlayResult {
  plays: AnalyzedPlay[];
  meta: {
    sources: Record<Venue, DataSource | 'unavailable'>;
    matchedEvents: number;
    unmatchedEvents: string[];
    warnings: string[];
    generatedAt: string;
  };
}

const FEES: Record<Trade['venue'], number> = {
  kalshi: KALSHI_FEE_COEFFICIENT,
  polymarket: POLYMARKET_FEE_COEFFICIENT,
};

const SOCCER_SPORT_KEYS = (process.env.SOCCER_SPORT_KEYS || 'soccer_fifa_world_cup,soccer_epl')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const venueCache = new TtlCache<VenueEvent[]>(20);
const tradeCache = new TtlCache<Trade[]>(500);
const VENUE_TTL = 30_000;
const TRADE_TTL = 30_000;

async function loadVenues() {
  const loaders: Record<Venue, () => Promise<VenueEvent[]>> = {
    kalshi: async () => normalizeKalshiEvents(await fetchKalshiEvents()).map(kalshiGameToVenueEvent),
    polymarket: async () =>
      (await fetchPolymarketEvents()).map(polymarketEventToVenueEvent).filter((e): e is VenueEvent => e != null),
    sportsbooks: async () =>
      (await fetchSoccerGames(SOCCER_SPORT_KEYS)).map((g) => sportsbookConsensus(g)).filter((e): e is VenueEvent => e != null),
  };
  const sources: Record<Venue, DataSource> = {
    kalshi: kalshiSource(),
    polymarket: polymarketSource(),
    sportsbooks: sportsbookSource(),
  };

  const venues = Object.keys(loaders) as Venue[];
  const settled = await Promise.allSettled(
    venues.map((v) =>
      venueCache.getOrLoad(cacheKey(`venue:${v}`, { source: sources[v], sports: SOCCER_SPORT_KEYS }), VENUE_TTL, loaders[v])
    )
  );

  const events: Partial<Record<Venue, VenueEvent[]>> = {};
  const status = {} as Record<Venue, DataSource | 'unavailable'>;
  const warnings: string[] = [];
  settled.forEach((r, i) => {
    const v = venues[i];
    if (r.status === 'fulfilled') {
      events[v] = r.value;
      status[v] = sources[v];
    } else {
      status[v] = 'unavailable';
      warnings.push(`${v} unavailable: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  return { events, status, warnings };
}

async function loadTrades(event: MatchedEvent, warnings: string[]): Promise<Trade[]> {
  const jobs: Array<{ venue: Trade['venue']; marketId: string; key: string; eventId: string }> = [];
  for (const venue of ['kalshi', 'polymarket'] as const) {
    const ve = event.venues[venue];
    if (!ve) continue;
    for (const o of ve.outcomes) jobs.push({ venue, marketId: o.marketId, key: o.key, eventId: ve.eventId });
  }

  const results = await mapLimit(jobs, 4, async (job) => {
    try {
      return await tradeCache.getOrLoad(`${job.venue}:${job.marketId}:${job.key}`, TRADE_TTL, () =>
        job.venue === 'kalshi'
          ? fetchKalshiTrades(job.marketId, job.key, job.eventId)
          : fetchPolymarketTrades(job.marketId, job.key, job.eventId)
      );
    } catch (err) {
      warnings.push(`${job.venue} trades unavailable for ${job.marketId}: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  });
  return results.flat();
}

function comparisonRows(event: MatchedEvent, outcomeKey: string): VenueComparisonRow[] {
  return (Object.entries(event.venues) as Array<[Venue, VenueEvent]>).flatMap(([venue, ve]) => {
    const o = ve.outcomes.find((x) => x.key === outcomeKey);
    if (!o) return [];
    return [{
      venue,
      source: ve.source,
      marketId: o.marketId,
      label: o.label,
      fairProbability: o.fairProbability,
      rawProbability: o.rawProbability,
      bid: o.bid,
      ask: o.ask,
      overround: ve.overround,
    }];
  });
}

/**
 * Cheapest way to take the same side right now on either exchange, and its
 * EV against the consensus of the *other* venues.
 */
function followNowQuote(play: Trade, event: MatchedEvent): FollowNowQuote | null {
  let best: FollowNowQuote | null = null;
  for (const venue of ['kalshi', 'polymarket'] as const) {
    const o = event.venues[venue]?.outcomes.find((x) => x.key === play.outcomeKey);
    if (!o) continue;
    const price = play.stance === 'for' ? o.ask ?? o.rawProbability : 1 - (o.bid ?? o.rawProbability);
    const mid = o.rawProbability;
    const cost = price + FEES[venue] * mid * (1 - mid);

    const others = (Object.keys(event.venues) as Venue[])
      .filter((v) => v !== venue)
      .map((v) => event.venues[v]!.outcomes.find((x) => x.key === play.outcomeKey)?.fairProbability)
      .filter((x): x is number => x != null);
    if (others.length === 0) continue;
    const consensus = others.reduce((a, b) => a + b, 0) / others.length;
    const fair = play.stance === 'for' ? consensus : 1 - consensus;
    const ev = contractEvPerDollar(fair, cost);

    if (!best || cost < best.cost) {
      const pct = (ev * 100).toFixed(1);
      best = {
        venue,
        cost,
        fairProbability: fair,
        evPerDollar: ev,
        display: `Same side now is cheapest on ${venue} at ${(cost * 100).toFixed(1)}¢ incl. fees vs ${(fair * 100).toFixed(1)}% consensus fair — ${ev >= 0 ? '+' : ''}${pct}% EV per $1.`,
      };
    }
  }
  return best;
}

export async function findBigPlays(opts: BigPlayOptions, now: number = Date.now()): Promise<BigPlayResult> {
  const { events, status, warnings } = await loadVenues();
  const { matched, unmatched } = matchEvents(events);

  const sinceMs = now - opts.lookbackHours * 3600_000;
  const candidates: AnalyzedPlay[] = [];

  const perEvent = await mapLimit(matched, 3, async (event) => ({ event, trades: await loadTrades(event, warnings) }));
  for (const { event, trades } of perEvent) {
    for (const play of trades) {
      if (play.notionalUsd < opts.minNotionalUsd || Date.parse(play.timestamp) < sinceMs) continue;
      const signals = computeSignals({ play, event, trades, now, feeCoefficients: FEES });
      candidates.push({
        id: `${play.venue}:${play.tradeId}`,
        trade: play,
        outcomeLabel: event.outcomeLabels[play.outcomeKey] ?? play.outcomeKey,
        event: { matchId: event.matchId, title: event.title, commenceTime: event.commenceTime },
        comparison: comparisonRows(event, play.outcomeKey),
        signals,
        hypotheses: scoreHypotheses(signals, play),
        followNow: followNowQuote(play, event),
      });
    }
  }

  const plays = candidates.sort((a, b) => b.trade.notionalUsd - a.trade.notionalUsd).slice(0, opts.limit);

  // Every play gets an explanation; only the top N spend LLM tokens.
  await mapLimit(plays, 2, async (play, i) => {
    play.explanation = i < opts.explain ? await explainPlay(play) : rulesExplanation(play);
  });

  return {
    plays,
    meta: {
      sources: status,
      matchedEvents: matched.length,
      unmatchedEvents: unmatched.map((e) => `${e.venue}: ${e.title}`),
      warnings,
      generatedAt: new Date(now).toISOString(),
    },
  };
}
