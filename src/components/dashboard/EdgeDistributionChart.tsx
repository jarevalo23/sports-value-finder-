'use client';

import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { ValueBet } from '@/types/odds';

interface EdgeDistributionChartProps {
  bets: ValueBet[];
}

export function EdgeDistributionChart({ bets }: EdgeDistributionChartProps) {
  // Create distribution data
  const ranges = [
    { min: 5, max: 8, label: '5-8%' },
    { min: 8, max: 10, label: '8-10%' },
    { min: 10, max: 12, label: '10-12%' },
    { min: 12, max: 15, label: '12-15%' },
    { min: 15, max: 20, label: '15-20%' },
    { min: 20, max: 100, label: '20%+' },
  ];

  const distributionData = ranges.map((range) => ({
    range: range.label,
    count: bets.filter(
      (b) => b.edgePercentage >= range.min && b.edgePercentage < range.max
    ).length,
    isHot: range.min >= 15,
  }));

  // Create sport breakdown data
  const sportData = Object.entries(
    bets.reduce((acc, bet) => {
      acc[bet.sportTitle] = (acc[bet.sportTitle] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([sport, count]) => ({ sport, count }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-normal)] rounded-lg p-3 shadow-xl">
          <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
          <p className="text-sm text-[var(--accent-cyan)]">
            {payload[0].value} opportunities
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6"
    >
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6">
        Edge Distribution
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Edge Range Distribution */}
        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            By Edge Range
          </h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} barCategoryGap="20%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="range"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distributionData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isHot ? 'rgb(245, 158, 11)' : 'rgb(0, 212, 255)'}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sport Breakdown */}
        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            By Sport
          </h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sportData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  dataKey="sport"
                  type="category"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  fill="rgb(16, 185, 129)"
                  fillOpacity={0.8}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[var(--border-subtle)]">
        <div className="text-center">
          <p className="text-2xl font-bold font-mono-nums text-[var(--accent-cyan)]">
            {bets.length}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Total Opportunities</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold font-mono-nums text-amber-400">
            {bets.filter((b) => b.isHot).length}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Hot Bets</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold font-mono-nums text-emerald-400">
            {sportData.length}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Sports Covered</p>
        </div>
      </div>
    </motion.div>
  );
}
