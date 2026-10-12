// Match the same real-world match across Kalshi, Polymarket and sportsbooks.
//
// Two events match when both teams line up (either home/away order, via
// canonical names + fuzzy fallback) and their kickoffs are within a window.
// Outcome keys are then re-aligned to one canonical set so "Man City" on
// Kalshi, "Manchester City FC" on Polymarket and "Manchester City" at the
// books all compare as the same outcome.

import type { MatchedEvent, Venue, VenueEvent } from '@/types/market';
import { DRAW_KEY } from '@/types/market';
import { canonicalTeam, teamSimilarity } from '@/lib/teams';

const MIN_TEAM_SIMILARITY = 0.6;
// Kalshi kickoff is approximated from expiry, so allow a generous window.
const MAX_KICKOFF_GAP_HOURS = 36;

const VENUE_PRIORITY: Venue[] = ['kalshi', 'polymarket', 'sportsbooks'];
const KICKOFF_PRIORITY: Venue[] = ['sportsbooks', 'polymarket', 'kalshi'];

/** 0 (no match) to ~1 (same teams, same kickoff). */
export function matchScore(a: VenueEvent, b: VenueEvent): number {
  const straight = Math.min(teamSimilarity(a.homeTeam, b.homeTeam), teamSimilarity(a.awayTeam, b.awayTeam));
  const swapped = Math.min(teamSimilarity(a.homeTeam, b.awayTeam), teamSimilarity(a.awayTeam, b.homeTeam));
  const teams = Math.max(straight, swapped);
  if (teams < MIN_TEAM_SIMILARITY) return 0;
  const gapHours = Math.abs(Date.parse(a.commenceTime) - Date.parse(b.commenceTime)) / 3600_000;
  if (!(gapHours <= MAX_KICKOFF_GAP_HOURS)) return 0;
  return teams - gapHours / (MAX_KICKOFF_GAP_HOURS * 10);
}

/**
 * Re-key an event's outcomes onto the anchor's canonical keys.
 */
function alignOutcomes(event: VenueEvent, anchorKeys: string[]): VenueEvent {
  const outcomes = event.outcomes.map((o) => {
    if (o.key === DRAW_KEY || anchorKeys.includes(o.key)) return o;
    let best = o.key;
    let bestSim = 0;
    for (const k of anchorKeys) {
      if (k === DRAW_KEY) continue;
      const sim = teamSimilarity(o.key, k);
      if (sim > bestSim) {
        best = k;
        bestSim = sim;
      }
    }
    return bestSim >= MIN_TEAM_SIMILARITY ? { ...o, key: best } : o;
  });
  return { ...event, outcomes };
}

export interface MatchResult {
  matched: MatchedEvent[];
  /** Events that only one venue lists — reported, never guessed. */
  unmatched: VenueEvent[];
}

export function matchEvents(eventsByVenue: Partial<Record<Venue, VenueEvent[]>>): MatchResult {
  const used = new Set<VenueEvent>();
  const matched: MatchedEvent[] = [];

  for (const anchorVenue of VENUE_PRIORITY) {
    for (const anchor of eventsByVenue[anchorVenue] ?? []) {
      if (used.has(anchor)) continue;
      used.add(anchor);
      const group: Partial<Record<Venue, VenueEvent>> = { [anchorVenue]: anchor };

      for (const venue of VENUE_PRIORITY) {
        if (venue === anchorVenue) continue;
        let best: VenueEvent | null = null;
        let bestScore = 0;
        for (const candidate of eventsByVenue[venue] ?? []) {
          if (used.has(candidate)) continue;
          const score = matchScore(anchor, candidate);
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        if (best) {
          used.add(best);
          group[venue] = best;
        }
      }
      matched.push(buildMatchedEvent(anchor, group));
    }
  }

  const unmatched = matched.filter((m) => Object.keys(m.venues).length === 1).map((m) => Object.values(m.venues)[0]!);
  return { matched: matched.filter((m) => Object.keys(m.venues).length > 1), unmatched };
}

function buildMatchedEvent(anchor: VenueEvent, group: Partial<Record<Venue, VenueEvent>>): MatchedEvent {
  const outcomeKeys = [canonicalTeam(anchor.homeTeam), DRAW_KEY, canonicalTeam(anchor.awayTeam)];
  const venues: Partial<Record<Venue, VenueEvent>> = {};
  for (const [venue, event] of Object.entries(group) as Array<[Venue, VenueEvent]>) {
    venues[venue] = alignOutcomes(event, outcomeKeys);
  }

  const outcomeLabels: Record<string, string> = {};
  for (const key of outcomeKeys) {
    for (const venue of VENUE_PRIORITY) {
      const label = venues[venue]?.outcomes.find((o) => o.key === key)?.label;
      if (label) {
        outcomeLabels[key] = key === DRAW_KEY ? 'Draw' : label;
        break;
      }
    }
  }

  const kickoffVenue = KICKOFF_PRIORITY.find((v) => venues[v]);
  return {
    matchId: Object.entries(venues)
      .map(([v, e]) => `${v}:${e!.eventId}`)
      .sort()
      .join('|'),
    title: anchor.title,
    commenceTime: venues[kickoffVenue!]!.commenceTime,
    outcomeKeys,
    outcomeLabels,
    venues,
  };
}
