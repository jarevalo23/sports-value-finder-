import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchOdds, fetchSports, getDemoOdds } from '@/services/oddsApi';
import { Game } from '@/types/odds';
import { TtlCache, cacheKey } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.ODDS_API_KEY || 'demo';
const CACHE_DURATION = 60_000; // 1 minute — protects the monthly request quota

const MARKETS = ['h2h', 'spreads', 'totals'] as const;
const QuerySchema = z.object({
  sports: z
    .string()
    .default('basketball_nba')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(10)),
  markets: z
    .string()
    .default(MARKETS.join(','))
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(MARKETS)).min(1)),
});

interface OddsPayload {
  data: Game[];
  source: 'live' | 'demo';
  warnings: string[];
  lastUpdated: string;
}

// Keyed on sports AND markets (the old cache ignored markets).
const cache = new TtlCache<OddsPayload>(50);

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
  const { sports, markets } = parsed.data;

  try {
    const payload = await cache.getOrLoad(cacheKey('odds', { sports, markets }), CACHE_DURATION, async () => {
      const warnings: string[] = [];
      const live: Game[] = [];

      if (API_KEY !== 'demo') {
        const results = await Promise.allSettled(
          sports.map((sport) =>
            fetchOdds(sport, { apiKey: API_KEY, markets: [...markets], regions: 'us', oddsFormat: 'american' })
          )
        );
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') live.push(...r.value);
          else warnings.push(`${sports[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        });
      }

      if (live.length > 0) {
        return { data: live, source: 'live' as const, warnings, lastUpdated: new Date().toISOString() };
      }

      // Demo fallback is explicit: the response says it's demo data and why.
      if (API_KEY !== 'demo') warnings.push('Live odds unavailable; serving demo data');
      return {
        data: sports.flatMap((s) => getDemoOdds(s)),
        source: 'demo' as const,
        warnings,
        lastUpdated: new Date().toISOString(),
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[api/odds] failed:', error);
    return NextResponse.json({ error: { code: 'internal_error', message: 'Failed to fetch odds data' } }, { status: 500 });
  }
}

// GET sports endpoint
export async function OPTIONS() {
  try {
    const sports = await fetchSports({ apiKey: API_KEY });
    return NextResponse.json({ data: sports });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch sports' }, { status: 500 });
  }
}
