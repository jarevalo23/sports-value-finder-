'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Zap } from 'lucide-react';
import { useOddsStore } from '@/store/oddsStore';
import { BASELINE_BOOKMAKERS, BOOKMAKER_DISPLAY_NAMES } from '@/types/odds';

export function Header() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[var(--bg-primary)]" />
                </div>
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 opacity-30 blur-lg" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
                  ValueEdge
                </h1>
                <p className="hidden sm:block text-xs text-[var(--text-muted)]">Sports Betting Intelligence</p>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-4">
              <nav className="flex items-center gap-1 whitespace-nowrap text-sm">
                <Link href="/" className="rounded-lg px-2 sm:px-3 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]">
                  Value bets
                </Link>
                <Link href="/plays" className="rounded-lg px-2 sm:px-3 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]">
                  Big plays
                </Link>
              </nav>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-muted)]">Demo Mode</span>
                <div className="w-2 h-2 rounded-full bg-amber-500" />
              </div>

              <button
                onClick={() => setShowSettings(true)}
                aria-label="Settings"
                className="p-2 sm:p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]
                  text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                  hover:border-[var(--border-accent)] transition-all duration-200"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    baselineBookmakers,
    setBaselineBookmakers,
    valueThreshold,
    setValueThreshold,
    hotThreshold,
    setHotThreshold,
    autoRefresh,
    setAutoRefresh,
    refreshInterval,
    setRefreshInterval,
  } = useOddsStore();

  const allBookmakers = Object.entries(BOOKMAKER_DISPLAY_NAMES);

  const toggleBookmaker = (key: string) => {
    if (baselineBookmakers.includes(key)) {
      setBaselineBookmakers(baselineBookmakers.filter((b) => b !== key));
    } else {
      setBaselineBookmakers([...baselineBookmakers, key]);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
          w-full max-w-lg max-h-[85vh] overflow-hidden
          rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-secondary)]
          shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h2>
            <p className="text-sm text-[var(--text-muted)]">Configure your value finder</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]
              hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Baseline Bookmakers */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Baseline Bookmakers
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Select the major bookmakers to use as the baseline for calculating value
            </p>
            <div className="grid grid-cols-2 gap-2">
              {BASELINE_BOOKMAKERS.map((key) => (
                <label
                  key={key}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                    ${baselineBookmakers.includes(key)
                      ? 'bg-cyan-500/10 border border-cyan-500/30'
                      : 'bg-[var(--bg-tertiary)] border border-transparent hover:border-[var(--border-normal)]'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={baselineBookmakers.includes(key)}
                    onChange={() => toggleBookmaker(key)}
                    className="sr-only"
                  />
                  <div
                    className={`
                      w-4 h-4 rounded border-2 flex items-center justify-center
                      ${baselineBookmakers.includes(key)
                        ? 'border-cyan-500 bg-cyan-500'
                        : 'border-[var(--text-muted)]'
                      }
                    `}
                  >
                    {baselineBookmakers.includes(key) && (
                      <svg className="w-2.5 h-2.5 text-[var(--bg-primary)]" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-[var(--text-primary)]">
                    {BOOKMAKER_DISPLAY_NAMES[key]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Thresholds */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Thresholds
            </h3>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-[var(--text-secondary)]">Value Threshold</label>
                <span className="text-sm font-mono-nums text-[var(--accent-cyan)]">{valueThreshold}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={valueThreshold}
                onChange={(e) => setValueThreshold(Number(e.target.value))}
                className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-[var(--accent-cyan)]
                  [&::-webkit-slider-thumb]:cursor-pointer
                "
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Minimum edge to display as a value bet
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-[var(--text-secondary)]">Hot Threshold</label>
                <span className="text-sm font-mono-nums text-amber-400">{hotThreshold}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="30"
                value={hotThreshold}
                onChange={(e) => setHotThreshold(Number(e.target.value))}
                className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-amber-400
                  [&::-webkit-slider-thumb]:cursor-pointer
                "
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Edge threshold to mark a bet as "hot"
              </p>
            </div>
          </div>

          {/* Auto Refresh */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Auto Refresh
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <span className="text-sm text-[var(--text-secondary)]">Enable auto refresh</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[var(--bg-elevated)] rounded-full peer
                    peer-checked:bg-emerald-500/30 transition-colors duration-200" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-[var(--text-muted)] rounded-full
                    peer-checked:translate-x-5 peer-checked:bg-emerald-400 transition-all duration-200" />
                </div>
              </label>

              {autoRefresh && (
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm text-[var(--text-secondary)]">Refresh Interval</label>
                    <span className="text-sm font-mono-nums text-[var(--text-primary)]">
                      {refreshInterval / 1000}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="30000"
                    max="300000"
                    step="30000"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-emerald-400
                      [&::-webkit-slider-thumb]:cursor-pointer
                    "
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
          <button
            onClick={onClose}
            className="w-full btn-primary"
          >
            Save Settings
          </button>
        </div>
      </motion.div>
    </>
  );
}
