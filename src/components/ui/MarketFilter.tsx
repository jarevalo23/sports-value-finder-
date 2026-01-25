'use client';

import { motion } from 'framer-motion';
import { MarketType } from '@/types/odds';
import { useOddsStore } from '@/store/oddsStore';
import { getMarketDisplayName } from '@/utils/oddsCalculations';

const MARKETS: MarketType[] = ['h2h', 'spreads', 'totals'];

export function MarketFilter() {
  const { selectedMarkets, toggleMarket } = useOddsStore();

  return (
    <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
      {MARKETS.map((market) => {
        const isSelected = selectedMarkets.includes(market);

        return (
          <button
            key={market}
            onClick={() => toggleMarket(market)}
            className={`
              relative px-4 py-2 rounded-md font-medium text-sm
              transition-all duration-200
              ${isSelected
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }
            `}
          >
            {isSelected && (
              <motion.div
                layoutId="market-bg"
                className="absolute inset-0 bg-[var(--bg-elevated)] rounded-md"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative z-10">{getMarketDisplayName(market)}</span>
          </button>
        );
      })}
    </div>
  );
}
