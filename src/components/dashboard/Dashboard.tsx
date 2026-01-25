'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Flame,
  Target,
  BarChart3,
  Sparkles,
  AlertCircle,
  LayoutGrid,
  Table,
  BarChart2,
} from 'lucide-react';
import { useOddsStore } from '@/store/oddsStore';
import { useOddsData } from '@/hooks/useOddsData';
import { StatCard } from '@/components/ui/StatCard';
import { ValueBetCard } from '@/components/ui/ValueBetCard';
import { SportFilter } from '@/components/ui/SportFilter';
import { MarketFilter } from '@/components/ui/MarketFilter';
import { EdgeSlider } from '@/components/ui/EdgeSlider';
import { LiveIndicator } from '@/components/ui/LiveIndicator';
import { LoadingSkeleton, StatCardSkeleton } from '@/components/ui/LoadingSkeleton';
import { OddsTable } from '@/components/odds/OddsTable';
import { EdgeDistributionChart } from '@/components/dashboard/EdgeDistributionChart';

type ViewMode = 'cards' | 'table';

export function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showChart, setShowChart] = useState(true);
  const { refetch, isLoading } = useOddsData();
  const { getFilteredValueBets, getDashboardStats, error } = useOddsStore();

  const valueBets = getFilteredValueBets();
  const stats = getDashboardStats();

  return (
    <div className="min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 grid-pattern opacity-50" />
      <div className="noise-overlay" />

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Top Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-2xl font-bold text-[var(--text-primary)] mb-1"
            >
              Value Opportunities
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-[var(--text-muted)]"
            >
              Real-time edge detection across multiple bookmakers
            </motion.p>
          </div>

          <LiveIndicator onRefresh={refetch} isLoading={isLoading} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading && valueBets.length === 0 ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard
                title="Total Opportunities"
                value={stats.totalOpportunities}
                subtitle="Across all markets"
                icon={Target}
                accent="cyan"
                delay={0}
              />
              <StatCard
                title="Hot Opportunities"
                value={stats.hotOpportunities}
                subtitle=">15% edge"
                icon={Flame}
                accent="amber"
                delay={0.1}
              />
              <StatCard
                title="Average Edge"
                value={`${stats.averageEdge.toFixed(1)}%`}
                subtitle="Current opportunities"
                icon={BarChart3}
                accent="emerald"
                delay={0.2}
              />
              <StatCard
                title="Best Edge"
                value={`${stats.bestEdge.toFixed(1)}%`}
                subtitle="Top opportunity"
                icon={Sparkles}
                accent="purple"
                delay={0.3}
              />
            </>
          )}
        </div>

        {/* Chart */}
        {showChart && valueBets.length > 0 && (
          <div className="mb-8">
            <EdgeDistributionChart bets={valueBets} />
          </div>
        )}

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 mb-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            {/* Sport Filters */}
            <div className="flex-1">
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Sports
              </h3>
              <SportFilter />
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px h-16 bg-[var(--border-subtle)]" />

            {/* Market & Edge Filters */}
            <div className="flex flex-col sm:flex-row gap-6">
              <div>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  Market Type
                </h3>
                <MarketFilter />
              </div>

              <div>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  Filters
                </h3>
                <EdgeSlider />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400">{error}</p>
          </motion.div>
        )}

        {/* Value Bets List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Value Bets
              {valueBets.length > 0 && (
                <span className="ml-2 text-[var(--text-muted)] font-normal">
                  ({valueBets.length})
                </span>
              )}
            </h3>

            <div className="flex items-center gap-4">
              {/* Chart Toggle */}
              <button
                onClick={() => setShowChart(!showChart)}
                className={`p-2 rounded-lg transition-all ${
                  showChart
                    ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                title="Toggle chart"
              >
                <BarChart2 className="w-4 h-4" />
              </button>

              {/* View Mode Toggle */}
              <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'cards'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'table'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                  title="Table view"
                >
                  <Table className="w-4 h-4" />
                </button>
              </div>

              {valueBets.length > 0 && (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm text-[var(--text-muted)]">Sorted by edge</span>
                  <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
              )}
            </div>
          </div>

          {isLoading && valueBets.length === 0 ? (
            <LoadingSkeleton />
          ) : valueBets.length === 0 ? (
            <EmptyState />
          ) : viewMode === 'cards' ? (
            <div className="grid gap-4">
              {valueBets.map((bet, index) => (
                <ValueBetCard key={bet.id} bet={bet} index={index} />
              ))}
            </div>
          ) : (
            <OddsTable bets={valueBets} />
          )}
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-16 pt-8 border-t border-[var(--border-subtle)]"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-[var(--text-muted)]">
              <p>
                Data provided by{' '}
                <a
                  href="https://the-odds-api.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-cyan)] hover:underline"
                >
                  The Odds API
                </a>
              </p>
            </div>
            <div className="text-sm text-[var(--text-muted)]">
              <p>For educational purposes only. Please gamble responsibly.</p>
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16"
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] mb-6">
        <Target className="w-8 h-8 text-[var(--text-muted)]" />
      </div>
      <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        No Value Bets Found
      </h3>
      <p className="text-[var(--text-muted)] max-w-md mx-auto mb-6">
        No betting opportunities match your current filters. Try adjusting the minimum edge,
        selecting different sports, or expanding market types.
      </p>
      <div className="flex items-center justify-center gap-4">
        <div className="px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <span className="text-sm text-[var(--text-secondary)]">
            Tip: Lower the minimum edge to see more opportunities
          </span>
        </div>
      </div>
    </motion.div>
  );
}
