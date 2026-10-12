// Shared HTTP client for every upstream market-data API.
//
// Every external call goes through fetchJson so the whole app gets the same
// guarantees: a hard timeout, bounded retries with jittered exponential backoff
// (honouring Retry-After), schema validation of the response body, and error
// messages that never leak API keys.

import { z } from 'zod';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 5000;

export class UpstreamError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = false
  ) {
    super(`[${source}] ${message}`);
    this.name = 'UpstreamError';
  }
}

export interface FetchJsonOptions<T> {
  /** Short upstream name used in errors and logs, e.g. "kalshi". */
  source: string;
  /** Zod schema the response body must satisfy. */
  schema: z.ZodType<T>;
  timeoutMs?: number;
  /** Retries after the first attempt. */
  retries?: number;
  init?: RequestInit;
  /** Injection points for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Strip credentials from a URL before it ends up in an error message or log.
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:api_?key|apiKey|token|key)=)[^&]+/gi, '$1***');
}

/**
 * Parse a Retry-After header (delta-seconds or HTTP date) into milliseconds.
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Full-jitter exponential backoff: random(0, base * 2^attempt), capped.
 */
export function backoffMs(attempt: number, baseMs: number = 300): number {
  return Math.min(MAX_BACKOFF_MS, Math.random() * baseMs * 2 ** attempt);
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions<T>): Promise<T> {
  const {
    source,
    schema,
    timeoutMs = 8000,
    retries = 2,
    init,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = opts;
  const safeUrl = redactUrl(url);
  let lastError: UpstreamError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError'
        ? `timed out after ${timeoutMs}ms`
        : `network error (${err instanceof Error ? err.message : String(err)})`;
      lastError = new UpstreamError(source, `${reason}: ${safeUrl}`, undefined, true);
      if (attempt < retries) await sleep(backoffMs(attempt));
      continue;
    }

    if (!response.ok) {
      const retryable = RETRYABLE_STATUS.has(response.status);
      lastError = new UpstreamError(
        source,
        `HTTP ${response.status} ${response.statusText}: ${safeUrl}`,
        response.status,
        retryable
      );
      if (!retryable || attempt === retries) break;
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      await sleep(Math.min(MAX_BACKOFF_MS, retryAfter ?? backoffMs(attempt)));
      continue;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new UpstreamError(source, `invalid JSON from ${safeUrl}`, response.status);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      // Schema drift is not retryable: the same payload will fail again.
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new UpstreamError(source, `unexpected response shape from ${safeUrl} — ${issues}`, response.status);
    }
    return parsed.data;
  }

  throw lastError ?? new UpstreamError(source, `request failed: ${safeUrl}`);
}

/**
 * Run async work over items with bounded concurrency (be polite to upstream
 * rate limits instead of firing everything at once).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
