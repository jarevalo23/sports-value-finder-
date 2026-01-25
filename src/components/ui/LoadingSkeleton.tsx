'use client';

import { motion } from 'framer-motion';

export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="h-5 w-12 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
              <div className="h-6 w-48 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              <div className="h-4 w-32 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            </div>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-lg p-4 mb-4">
            <div className="flex justify-between mb-3">
              <div className="space-y-1">
                <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-6 w-28 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse ml-auto" />
                <div className="h-6 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--border-subtle)]">
              <div className="space-y-1">
                <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-7 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-7 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex gap-4">
              <div className="space-y-1">
                <div className="h-3 w-10 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-6 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-6 w-14 rounded bg-[var(--bg-tertiary)] animate-pulse" />
              </div>
            </div>
            <div className="h-9 w-24 rounded-lg bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-8 w-16 rounded bg-[var(--bg-tertiary)] animate-pulse" />
          <div className="h-3 w-20 rounded bg-[var(--bg-tertiary)] animate-pulse" />
        </div>
        <div className="h-11 w-11 rounded-lg bg-[var(--bg-tertiary)] animate-pulse" />
      </div>
    </div>
  );
}
