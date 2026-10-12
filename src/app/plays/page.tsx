'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Header } from '@/components/ui/Header';
import { BigPlayCard } from '@/components/plays/BigPlayCard';
import type { AnalyzedPlay } from '@/reasoning/types';

interface PlaysResponse {
  data: AnalyzedPlay[];
  meta: {
    sources: Record<string, string>;
    matchedEvents: number;
    unmatchedEvents: string[];
    warnings: string[];
    generatedAt: string;
  };
}

const THRESHOLDS = [5_000, 10_000, 25_000, 50_000];

export default function PlaysPage() {
  const [minNotional, setMinNotional] = useState(10_000);
  const [result, setResult] = useState<PlaysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plays?minNotional=${minNotional}&limit=10&explain=3`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plays');
    } finally {
      setLoading(false);
    }
  }, [minNotional]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Header />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Big plays</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Large Kalshi &amp; Polymarket trades, compared across venues, with the most likely reason each was made.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]" htmlFor="min-notional">
              Min size
            </label>
            <select
              id="min-notional"
              value={minNotional}
              onChange={(e) => setMinNotional(Number(e.target.value))}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {THRESHOLDS.map((t) => (
                <option key={t} value={t}>
                  ${t.toLocaleString()}+
                </option>
              ))}
            </select>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {result && (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(result.meta.sources).map(([venue, source]) => (
              <span
                key={venue}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-secondary)]"
              >
                {venue}: <span className="font-medium text-[var(--text-primary)]">{source}</span>
              </span>
            ))}
            <span className="px-2 py-1 text-[var(--text-muted)]">{result.meta.matchedEvents} matches compared</span>
          </div>
        )}

        {result?.meta.warnings.map((w) => (
          <p key={w} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {w}
          </p>
        ))}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        )}

        {loading && !result && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-[var(--bg-secondary)]" />
            ))}
          </div>
        )}

        {result && result.data.length === 0 && !loading && (
          <p className="text-sm text-[var(--text-muted)]">No trades above ${minNotional.toLocaleString()} in the last 24 hours.</p>
        )}

        <div className="space-y-4">
          {result?.data.map((play, i) => <BigPlayCard key={play.id} play={play} index={i} />)}
        </div>
      </div>
    </main>
  );
}
