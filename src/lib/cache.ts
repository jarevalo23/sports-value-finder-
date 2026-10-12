// Small TTL cache with single-flight de-duplication.
//
// Keys must include every parameter that changes the result (the old odds
// route keyed only on sports and served wrong-market data). Concurrent callers
// for the same key share one in-flight promise instead of stampeding upstream.
//
// This is per server instance; on serverless each cold start begins empty, so
// it reduces — but does not guarantee — upstream quota usage.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private entries = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries: number = 200) {}

  async getOrLoad(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries) {
      // Map preserves insertion order: drop the oldest entry.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }
}

/**
 * Build a stable cache key from a params object (sorted keys, sorted arrays).
 */
export function cacheKey(prefix: string, params: Record<string, unknown>): string {
  const parts = Object.keys(params)
    .sort()
    .map((k) => {
      const v = params[k];
      const norm = Array.isArray(v) ? [...v].map(String).sort().join(',') : String(v);
      return `${k}=${norm}`;
    });
  return `${prefix}?${parts.join('&')}`;
}
