import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchKalshiEvents,
  normalizeKalshiEvents,
  getHighestBets,
  getMostProbableEvents,
  kalshiSource,
} from '@/services/kalshiApi';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  metric: z.enum(['volume', 'volume24h', 'openInterest', 'notionalUsd']).default('volume'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/kalshi?metric=volume|volume24h|openInterest|notionalUsd&limit=20
 *
 * Returns:
 *   games        — normalized win/tie/lose markets per game
 *   highestBets  — outcomes ranked by flow (popularity, NOT a value signal)
 *   mostProbable — the likeliest outcome per game (devigged)
 */
export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_request',
          message: 'Invalid query parameters',
          issues: parsed.error.issues.map((i) => ({ param: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 }
    );
  }
  const { metric, limit } = parsed.data;

  try {
    const games = normalizeKalshiEvents(await fetchKalshiEvents());
    return NextResponse.json(
      {
        data: {
          games,
          highestBets: getHighestBets(games, metric, limit),
          mostProbable: getMostProbableEvents(games),
        },
        meta: { metric, source: kalshiSource(), lastUpdated: new Date().toISOString() },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (error) {
    // Live mode failed: say so instead of silently serving demo data.
    console.error('[api/kalshi] failed:', error);
    return NextResponse.json(
      { error: { code: 'upstream_unavailable', message: 'Kalshi data is unavailable right now' } },
      { status: 502 }
    );
  }
}
