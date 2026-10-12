// Fixed-window per-client rate limiter for routes that spend money (LLM calls,
// metered upstream quotas). In-memory, so it's per server instance — put a
// shared store (e.g. Redis) behind the same interface for multi-instance use.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  check(clientId: string, now: number = Date.now()): RateLimitResult {
    const w = this.windows.get(clientId);
    if (!w || now - w.start >= this.windowMs) {
      if (this.windows.size > 10_000) this.windows.clear(); // bound memory
      this.windows.set(clientId, { start: now, count: 1 });
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }
    if (w.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((w.start + this.windowMs - now) / 1000) };
    }
    w.count++;
    return { allowed: true, remaining: this.limit - w.count, retryAfterSeconds: 0 };
  }
}

export function clientIdFrom(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'anonymous';
}
