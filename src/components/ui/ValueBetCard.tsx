'use client';

import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Flame, TrendingUp, Clock, ExternalLink } from 'lucide-react';
import { ValueBet } from '@/types/odds';
import {
  formatAmericanOdds,
  formatProbability,
  formatEdge,
  formatPoint,
  getMarketDisplayName,
} from '@/utils/oddsCalculations';

interface ValueBetCardProps {
  bet: ValueBet;
  index?: number;
}

export function ValueBetCard({ bet, index = 0 }: ValueBetCardProps) {
  const gameTime = format(new Date(bet.commenceTime), 'MMM d, h:mm a');
  const isSpread = bet.market === 'spreads';
  const isTotal = bet.market === 'totals';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={`
        relative overflow-hidden rounded-xl border backdrop-blur-sm
        transition-all duration-300 hover:translate-y-[-2px]
        ${bet.isHot
          ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent pulse-hot'
          : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent hover:border-emerald-500/40'
        }
      `}
    >
      {/* Hot Badge */}
      {bet.isHot && (
        <div className="absolute top-0 right-0">
          <div className="badge-hot flex items-center gap-1 rounded-bl-lg rounded-tr-xl px-3 py-1.5">
            <Flame className="w-3.5 h-3.5" />
            <span>HOT</span>
          </div>
        </div>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge-sport">{bet.sportTitle}</span>
              <span className="text-[var(--text-muted)] text-xs">{getMarketDisplayName(bet.market)}</span>
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {bet.awayTeam} @ {bet.homeTeam}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-[var(--text-muted)] text-sm">
              <Clock className="w-3.5 h-3.5" />
              <span>{gameTime}</span>
            </div>
          </div>
        </div>

        {/* Selection & Odds */}
        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-0.5">Selection</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {bet.selection}
                {(isSpread || isTotal) && bet.point !== undefined && (
                  <span className="ml-2 text-[var(--accent-cyan)]">
                    {formatPoint(bet.point, bet.market)}
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--text-secondary)] mb-0.5">Bookmaker</p>
              <p className="text-base font-medium text-[var(--text-primary)]">
                {bet.bookmakerTitle}
              </p>
            </div>
          </div>

          {/* Odds Comparison */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--border-subtle)]">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Baseline Odds</p>
              <p className="text-xl font-mono-nums text-[var(--text-secondary)]">
                {formatAmericanOdds(bet.baselineOdds)}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {formatProbability(bet.baselineImpliedProbability)} implied
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Available Odds</p>
              <p className={`text-xl font-mono-nums ${bet.isHot ? 'text-amber-400' : 'text-emerald-400'}`}>
                {formatAmericanOdds(bet.odds)}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {formatProbability(bet.impliedProbability)} implied
              </p>
            </div>
          </div>
        </div>

        {/* Edge & EV */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Edge</p>
              <div className="flex items-center gap-1.5">
                <TrendingUp className={`w-4 h-4 ${bet.isHot ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span className={`text-xl font-bold font-mono-nums ${bet.isHot ? 'edge-hot' : 'text-emerald-400'}`}>
                  {formatEdge(bet.edgePercentage)}
                </span>
              </div>
            </div>
            <div className="w-px h-10 bg-[var(--border-subtle)]" />
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Expected Value</p>
              <span className={`text-lg font-semibold font-mono-nums ${bet.expectedValue > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {bet.expectedValue > 0 ? '+' : ''}{bet.expectedValue.toFixed(2)}%
              </span>
            </div>
          </div>

          <button
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
              transition-all duration-200
              ${bet.isHot
                ? 'bg-amber-500 text-[var(--bg-primary)] hover:bg-amber-400'
                : 'bg-emerald-500 text-[var(--bg-primary)] hover:bg-emerald-400'
              }
            `}
          >
            <span>View Bet</span>
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom accent line */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 h-0.5
          ${bet.isHot
            ? 'bg-gradient-to-r from-transparent via-amber-500 to-transparent'
            : 'bg-gradient-to-r from-transparent via-emerald-500 to-transparent'
          }
        `}
      />
    </motion.div>
  );
}
