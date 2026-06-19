import { NextRequest, NextResponse } from 'next/server';
import {
  fetchKalshiMarkets,
  normalizeKalshiGames,
  getHighestBets,
  getMostProbableEvents,
  getDemoMarkets,
} from '@/services/kalshiApi';
import { VolumeMetric } from '@/types/kalshi';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_METRICS: VolumeMetric[] = ['volume', 'volume24h', 'openInterest', 'notionalUsd'];

/**
 * GET /api/kalshi
 *
 * Query params:
 *   metric = volume | volume24h | openInterest | notionalUsd  (default: volume)
 *   limit  = number of highest-bet rows to return             (default: 20)
 *
 * Returns:
 *   games            — normalized win/tie/lose markets per game
 *   highestBets      — outcomes ranked by where the most money is placed
 *   mostProbable     — the likeliest outcome per game, ranked across games
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const metricParam = (searchParams.get('metric') || 'volume') as VolumeMetric;
    const metric = VALID_METRICS.includes(metricParam) ? metricParam : 'volume';
    const limit = Number(searchParams.get('limit')) || 20;

    let markets;
    try {
      markets = await fetchKalshiMarkets();
    } catch {
      // Network/credential failure — fall back to demo data like the odds API.
      markets = getDemoMarkets();
    }

    const games = normalizeKalshiGames(markets);

    return NextResponse.json({
      data: {
        games,
        highestBets: getHighestBets(games, metric, limit),
        mostProbable: getMostProbableEvents(games),
      },
      metric,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Kalshi API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch Kalshi data' }, { status: 500 });
  }
}
