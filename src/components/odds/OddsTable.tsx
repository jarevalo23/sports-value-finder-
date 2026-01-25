'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { ValueBet } from '@/types/odds';
import {
  formatAmericanOdds,
  formatProbability,
  formatEdge,
  formatPoint,
  getMarketDisplayName,
} from '@/utils/oddsCalculations';

interface OddsTableProps {
  bets: ValueBet[];
}

type SortField = 'edge' | 'odds' | 'time' | 'sport';
type SortDirection = 'asc' | 'desc';

export function OddsTable({ bets }: OddsTableProps) {
  const [sortField, setSortField] = useState<SortField>('edge');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const sortedBets = [...bets].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'edge':
        comparison = a.edgePercentage - b.edgePercentage;
        break;
      case 'odds':
        comparison = a.odds - b.odds;
        break;
      case 'time':
        comparison = new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
        break;
      case 'sport':
        comparison = a.sportTitle.localeCompare(b.sportTitle);
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
    >
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-12"></th>
              <th>
                <SortButton field="sport">Sport</SortButton>
              </th>
              <th>Game</th>
              <th>
                <SortButton field="time">Time</SortButton>
              </th>
              <th>Market</th>
              <th>Selection</th>
              <th>Bookmaker</th>
              <th className="text-right">
                <SortButton field="odds">Odds</SortButton>
              </th>
              <th className="text-right">Baseline</th>
              <th className="text-right">
                <SortButton field="edge">Edge</SortButton>
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {sortedBets.map((bet, index) => (
                <motion.tr
                  key={bet.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => setExpandedRow(expandedRow === bet.id ? null : bet.id)}
                  className={`cursor-pointer ${
                    bet.isHot ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="text-center">
                    {bet.isHot && (
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </td>
                  <td>
                    <span className="badge-sport">{bet.sportTitle}</span>
                  </td>
                  <td className="font-medium text-[var(--text-primary)]">
                    <div className="max-w-[200px]">
                      <p className="truncate">{bet.awayTeam}</p>
                      <p className="truncate text-[var(--text-muted)]">@ {bet.homeTeam}</p>
                    </div>
                  </td>
                  <td className="text-[var(--text-secondary)] font-mono-nums text-sm">
                    {format(new Date(bet.commenceTime), 'MMM d, h:mm a')}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {getMarketDisplayName(bet.market)}
                  </td>
                  <td className="font-medium text-[var(--text-primary)]">
                    {bet.selection}
                    {bet.point !== undefined && (
                      <span className="ml-1 text-[var(--accent-cyan)]">
                        {formatPoint(bet.point, bet.market)}
                      </span>
                    )}
                  </td>
                  <td className="text-[var(--text-secondary)]">{bet.bookmakerTitle}</td>
                  <td className={`text-right font-mono-nums font-semibold ${
                    bet.isHot ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {formatAmericanOdds(bet.odds)}
                  </td>
                  <td className="text-right font-mono-nums text-[var(--text-muted)]">
                    {formatAmericanOdds(bet.baselineOdds)}
                  </td>
                  <td className={`text-right font-mono-nums font-bold ${
                    bet.isHot ? 'edge-hot' : 'text-emerald-400'
                  }`}>
                    {formatEdge(bet.edgePercentage)}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {sortedBets.length === 0 && (
        <div className="p-8 text-center text-[var(--text-muted)]">
          No value bets found matching your criteria
        </div>
      )}
    </div>
  );
}
