import { NextRequest, NextResponse } from 'next/server';
import { fetchOdds, fetchSports, getDemoOdds } from '@/services/oddsApi';
import { Game } from '@/types/odds';

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const API_KEY = process.env.ODDS_API_KEY || 'demo';
const USE_DEMO_FALLBACK = true; // Always fall back to demo data if API fails

// In-memory cache for rate limiting
const cache: {
  data: Game[];
  timestamp: number;
  sports: string[];
} = {
  data: [],
  timestamp: 0,
  sports: [],
};

const CACHE_DURATION = 60000; // 1 minute cache

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sports = searchParams.get('sports')?.split(',') || ['basketball_nba'];
    const markets = searchParams.get('markets')?.split(',') || ['h2h', 'spreads', 'totals'];

    // Check cache
    const now = Date.now();
    const sportsKey = sports.sort().join(',');
    const cacheValid =
      cache.timestamp > now - CACHE_DURATION &&
      cache.sports.sort().join(',') === sportsKey;

    if (cacheValid && cache.data.length > 0) {
      return NextResponse.json({
        data: cache.data,
        cached: true,
        lastUpdated: new Date(cache.timestamp).toISOString(),
      });
    }

    // Fetch fresh data - always use demo data for reliable portfolio display
    let allGames: Game[] = [];

    // Use demo data directly for reliable portfolio display
    // (Live API quota may be exhausted)
    for (const sport of sports) {
      const demoGames = getDemoOdds(sport);
      allGames.push(...demoGames);
    }

    // Update cache
    cache.data = allGames;
    cache.timestamp = now;
    cache.sports = sports;

    return NextResponse.json({
      data: allGames,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch odds data' },
      { status: 500 }
    );
  }
}

// GET sports endpoint
export async function OPTIONS() {
  try {
    const sports = await fetchSports({ apiKey: API_KEY });
    return NextResponse.json({ data: sports });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sports' },
      { status: 500 }
    );
  }
}
