'use client';

import { useOddsStore } from '@/store/oddsStore';

export function EdgeSlider() {
  const { minEdge, setMinEdge, showHotOnly, setShowHotOnly } = useOddsStore();

  return (
    <div className="flex items-center gap-6">
      {/* Edge Slider */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
          Min Edge
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="25"
            step="1"
            value={minEdge}
            onChange={(e) => setMinEdge(Number(e.target.value))}
            className="w-32 h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[var(--accent-cyan)]
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-all
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,212,255,0.5)]
            "
          />
          <span className="text-sm font-mono-nums text-[var(--accent-cyan)] min-w-[3ch]">
            {minEdge}%
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[var(--border-subtle)]" />

      {/* Hot Only Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="text-sm text-[var(--text-secondary)]">Hot Only</span>
        <div className="relative">
          <input
            type="checkbox"
            checked={showHotOnly}
            onChange={(e) => setShowHotOnly(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[var(--bg-tertiary)] rounded-full peer
            peer-checked:bg-amber-500/30
            transition-colors duration-200
          " />
          <div className="absolute left-1 top-1 w-4 h-4 bg-[var(--text-muted)] rounded-full
            peer-checked:translate-x-5
            peer-checked:bg-amber-400
            transition-all duration-200
            peer-checked:shadow-[0_0_10px_rgba(245,158,11,0.5)]
          " />
        </div>
      </label>
    </div>
  );
}
