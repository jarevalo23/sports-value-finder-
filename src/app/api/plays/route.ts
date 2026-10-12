import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findBigPlays } from '@/reasoning/pipeline';
import { RateLimiter, clientIdFrom } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/plays
 *
 * Finds big trades on Kalshi/Polymarket, compares them across venues
 * (other exchange + devigged sportsbook consensus) and explains why each was
 * likely made.
 *
 * Query params (validated):
 *   minNotional   min cash committed, USD            default 10000
 *   limit         max plays returned (1-50)          default 10
 *   explain       top plays explained by Claude (0-5) default 3; rest use rules
 *   lookbackHours how far back to scan (1-72)        default 24
 */
const QuerySchema = z.object({
  minNotional: z.coerce.number().min(0).max(10_000_000).default(10_000),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  explain: z.coerce.number().int().min(0).max(5).default(3),
  lookbackHours: z.coerce.number().min(1).max(72).default(24),
});

// LLM explanations cost money: cap requests that ask for them.
const explainLimiter = new RateLimiter(10, 60_000);

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', 'Invalid query parameters', {
      issues: parsed.error.issues.map((i) => ({ param: i.path.join('.'), message: i.message })),
    });
  }
  const query = parsed.data;

  const headers: Record<string, string> = { 'Cache-Control': 'private, max-age=15' };
  if (query.explain > 0) {
    const limit = explainLimiter.check(clientIdFrom(request.headers));
    headers['X-RateLimit-Remaining'] = String(limit.remaining);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: { code: 'rate_limited', message: 'Too many explanation requests; retry later or pass explain=0' } },
        { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }
  }

  try {
    const result = await findBigPlays({
      minNotionalUsd: query.minNotional,
      limit: query.limit,
      explain: query.explain,
      lookbackHours: query.lookbackHours,
    });
    return NextResponse.json({ data: result.plays, meta: result.meta }, { headers });
  } catch (error) {
    console.error('[api/plays] failed:', error);
    return errorResponse(500, 'internal_error', 'Failed to analyze plays');
  }
}
