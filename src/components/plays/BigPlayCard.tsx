'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { AlertTriangle, Bot, Check, ChevronDown, Clock, ListChecks, Minus, Wallet } from 'lucide-react';
import type { AnalyzedPlay, CitedEvidence, Signal } from '@/reasoning/types';
import type { Venue } from '@/types/market';

const VENUE_NAMES: Record<Venue, string> = {
  kalshi: 'Kalshi',
  polymarket: 'Polymarket',
  sportsbooks: 'Sportsbooks (devigged)',
};

const pct = (p?: number) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`);

/** Thin horizontal meter: one hue, recessive track, rounded data end. */
function Meter({ value, max = 1, strong, title }: { value: number; max?: number; strong?: boolean; title: string }) {
  const width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
  return (
    <div className="relative h-2 w-full rounded-full bg-[var(--bg-elevated)]" title={title}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${strong ? 'bg-cyan-400' : 'bg-cyan-400/45'}`}
        style={{ width }}
      />
    </div>
  );
}

function EvidenceList({ items, kind, signals }: { items: CitedEvidence[]; kind: 'supports' | 'weakens'; signals: Signal[] }) {
  if (items.length === 0) return null;
  const Icon = kind === 'supports' ? Check : Minus;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {kind === 'supports' ? 'Evidence for' : 'Evidence against / caveats'}
      </p>
      <ul className="space-y-1.5">
        {items.map((e, i) => {
          const s = signals.find((x) => x.id === e.signal);
          return (
            <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${kind === 'supports' ? 'text-emerald-400' : 'text-red-400'}`}
                aria-label={kind}
              />
              <span>
                {e.why}
                {s && (
                  <span className="ml-1.5 break-words font-mono text-xs text-[var(--text-muted)]">
                    [{s.label}: {s.display}]
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BigPlayCard({ play, index = 0 }: { play: AnalyzedPlay; index?: number }) {
  const [showSignals, setShowSignals] = useState(false);
  const { trade, explanation: ex } = play;
  const side = trade.stance === 'for' ? `Backed ${play.outcomeLabel}` : `Against ${play.outcomeLabel}`;
  const topScore = play.hypotheses[0]?.score ?? 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
    >
      {/* Play header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-subtle)] p-5">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="rounded-md bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[var(--text-secondary)]">
              {VENUE_NAMES[trade.venue]}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(trade.timestamp), 'MMM d, h:mm a')} · kickoff {format(new Date(play.event.commenceTime), 'h:mm a')}
            </span>
            {trade.trader && (
              <span className="flex items-center gap-1 font-mono" title={trade.trader}>
                <Wallet className="h-3.5 w-3.5" />
                {trade.trader.slice(0, 6)}…{trade.trader.slice(-4)}
              </span>
            )}
          </div>
          <h3 className="truncate text-lg font-semibold text-[var(--text-primary)]">{play.event.title}</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {side} at <span className="font-mono">{pct(trade.probability)}</span> ·{' '}
            <span className="font-mono">{trade.size.toLocaleString()}</span> contracts
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold text-[var(--text-primary)]">
            ${trade.notionalUsd.toLocaleString()}
          </p>
          <p className="text-xs text-[var(--text-muted)]">cash committed</p>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Why */}
        <section className="min-w-0 space-y-4">
          {ex && (
            <>
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-medium text-cyan-300">
                    {play.hypotheses.find((h) => h.id === ex.primaryReason)?.label ?? ex.primaryReason}
                  </span>
                  <span className="text-[var(--text-muted)]">{ex.confidence} confidence</span>
                  <span
                    className="flex items-center gap-1 text-[var(--text-muted)]"
                    title={ex.fallbackReason ?? undefined}
                  >
                    {ex.source === 'claude' ? <Bot className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
                    {ex.source === 'claude' ? `Explained by ${ex.model ?? 'Claude'}` : 'Rule-based explanation'}
                  </span>
                </div>
                <h4 className="text-base font-semibold text-[var(--text-primary)]">{ex.headline}</h4>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{ex.narrative}</p>
                {ex.disagreesWithRules && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> The model’s reading differs from the rule scores — worth a closer look.
                  </p>
                )}
              </div>
              <EvidenceList items={ex.supportingEvidence} kind="supports" signals={play.signals} />
              <EvidenceList items={ex.counterEvidence} kind="weakens" signals={play.signals} />
              {ex.whatWouldChangeMyMind.length > 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-secondary)]">Would change this read: </span>
                  {ex.whatWouldChangeMyMind.join(' · ')}
                </p>
              )}
              <p className="rounded-lg bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Following it now: </span>
                {ex.followTakeaway}
              </p>
            </>
          )}
        </section>

        {/* Numbers */}
        <section className="min-w-0 space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {play.outcomeLabel} across venues
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="pb-1.5 font-normal">Venue</th>
                  <th className="pb-1.5 font-normal">Fair prob.</th>
                  <th className="hidden pb-1.5 text-right font-normal sm:table-cell">Bid / Ask</th>
                </tr>
              </thead>
              <tbody>
                {play.comparison.map((c) => (
                  <tr key={c.venue} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2 pr-2 text-[var(--text-secondary)]">
                      {VENUE_NAMES[c.venue]}
                      {c.venue === trade.venue && <span className="ml-1 text-xs text-[var(--text-muted)]">(play)</span>}
                      <div className="font-mono text-[11px] text-[var(--text-muted)] sm:hidden">
                        bid {pct(c.bid)} · ask {pct(c.ask)}
                      </div>
                    </td>
                    <td className="w-1/2 py-2 sm:w-[45%] sm:pr-3">
                      <div className="flex items-center gap-2">
                        <Meter
                          value={c.fairProbability}
                          strong={c.venue === trade.venue}
                          title={`${VENUE_NAMES[c.venue]}: ${pct(c.fairProbability)} fair, ${pct(c.overround)} margin`}
                        />
                        <span className="w-12 shrink-0 text-right font-mono text-xs text-[var(--text-primary)]">
                          {pct(c.fairProbability)}
                        </span>
                      </div>
                    </td>
                    <td className="hidden py-2 text-right font-mono text-xs text-[var(--text-secondary)] sm:table-cell">
                      {pct(c.bid)} / {pct(c.ask)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border-subtle)]">
                  <td className="py-2 text-[var(--text-muted)]">Fill</td>
                  <td colSpan={2} className="py-2 font-mono text-xs text-[var(--text-primary)]">
                    {pct(trade.probability)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Why — rule scores
            </p>
            <ul className="space-y-2">
              {play.hypotheses.map((h) => (
                <li key={h.id} className="grid grid-cols-[1fr_5rem_2.5rem] items-center gap-2 text-xs">
                  <span className={h.score === topScore && h.score > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
                    {h.label}
                  </span>
                  <Meter value={h.score} strong={h.score === topScore && h.score > 0} title={`${h.label}: ${h.score.toFixed(2)}`} />
                  <span className="text-right font-mono text-[var(--text-secondary)]">{h.score.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* All signals */}
      <button
        onClick={() => setShowSignals((v) => !v)}
        className="flex w-full items-center justify-between border-t border-[var(--border-subtle)] px-5 py-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-expanded={showSignals}
      >
        All {play.signals.length} signals
        <ChevronDown className={`h-4 w-4 transition-transform ${showSignals ? 'rotate-180' : ''}`} />
      </button>
      {showSignals && (
        <dl className="grid gap-x-6 gap-y-3 border-t border-[var(--border-subtle)] p-5 sm:grid-cols-2 lg:grid-cols-3">
          {play.signals.map((s) => (
            <div key={s.id} title={s.description}>
              <dt className="text-xs text-[var(--text-muted)]">{s.label}</dt>
              <dd className="font-mono text-sm text-[var(--text-primary)]">{s.display}</dd>
            </div>
          ))}
        </dl>
      )}
    </motion.article>
  );
}
