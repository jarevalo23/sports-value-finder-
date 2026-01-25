'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  accent?: 'cyan' | 'emerald' | 'amber' | 'purple';
  delay?: number;
}

const accentColors = {
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    text: 'text-cyan-400',
    glow: 'shadow-[0_0_20px_rgba(0,212,255,0.15)]',
    iconBg: 'bg-cyan-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
    iconBg: 'bg-emerald-500/20',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]',
    iconBg: 'bg-amber-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    iconBg: 'bg-purple-500/20',
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  accent = 'cyan',
  delay = 0,
}: StatCardProps) {
  const colors = accentColors[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`
        relative overflow-hidden rounded-xl border ${colors.border} ${colors.bg}
        p-6 backdrop-blur-sm transition-all duration-300
        hover:${colors.glow} hover:border-opacity-40
      `}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />

      {/* Content */}
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
            <motion.p
              key={value}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`text-3xl font-bold font-mono-nums ${colors.text}`}
            >
              {value}
            </motion.p>
            {subtitle && (
              <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
            )}
          </div>

          <div className={`p-3 rounded-lg ${colors.iconBg}`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
        </div>

        {/* Trend indicator */}
        {trend && trendValue && (
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`
                text-xs font-medium px-2 py-0.5 rounded-full
                ${trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' : ''}
                ${trend === 'down' ? 'bg-red-500/20 text-red-400' : ''}
                ${trend === 'neutral' ? 'bg-slate-500/20 text-slate-400' : ''}
              `}
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          </div>
        )}
      </div>

      {/* Decorative corner accent */}
      <div
        className={`
          absolute -right-8 -bottom-8 w-32 h-32 rounded-full
          ${colors.bg} blur-3xl opacity-50
        `}
      />
    </motion.div>
  );
}
