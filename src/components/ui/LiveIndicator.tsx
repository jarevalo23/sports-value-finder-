'use client';

import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { useOddsStore } from '@/store/oddsStore';

interface LiveIndicatorProps {
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function LiveIndicator({ onRefresh, isLoading }: LiveIndicatorProps) {
  const { lastUpdated, autoRefresh } = useOddsStore();

  const formattedTime = lastUpdated
    ? format(new Date(lastUpdated), 'h:mm:ss a')
    : '--:--:--';

  return (
    <div className="flex items-center gap-4">
      {/* Live Status */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className="live-indicator" />
          {autoRefresh && (
            <motion.div
              className="absolute inset-0 rounded-full bg-emerald-500"
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
        <span className="text-sm font-medium text-emerald-400">
          {autoRefresh ? 'LIVE' : 'PAUSED'}
        </span>
      </div>

      {/* Last Update Time */}
      <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
        <span>Last update:</span>
        <span className="font-mono-nums text-[var(--text-secondary)]">{formattedTime}</span>
      </div>

      {/* Refresh Button */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
            hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]
            transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  );
}
