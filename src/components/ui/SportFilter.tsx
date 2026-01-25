'use client';

import { motion } from 'framer-motion';
import { SUPPORTED_SPORTS, SupportedSport } from '@/types/odds';
import { useOddsStore } from '@/store/oddsStore';

export function SportFilter() {
  const { selectedSports, toggleSport } = useOddsStore();

  return (
    <div className="flex flex-wrap gap-2">
      {SUPPORTED_SPORTS.map((sport, index) => {
        const isSelected = selectedSports.includes(sport.key as SupportedSport);

        return (
          <motion.button
            key={sport.key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            onClick={() => toggleSport(sport.key as SupportedSport)}
            className={`
              relative flex items-center gap-2 px-4 py-2 rounded-lg
              font-medium text-sm transition-all duration-200
              ${isSelected
                ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-transparent hover:border-[var(--border-normal)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            <span className="text-base">{sport.icon}</span>
            <span>{sport.title}</span>
            {isSelected && (
              <motion.div
                layoutId="sport-indicator"
                className="absolute inset-0 rounded-lg border-2 border-[var(--accent-cyan)]/50"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
