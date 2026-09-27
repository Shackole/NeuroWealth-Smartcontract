'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ChartDataPoint } from '@/lib/database';
import { useTheme } from './ThemeProvider';

interface PortfolioChartProps {
  data: ChartDataPoint[];
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Theme-aware colour tokens
  const tokens = {
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#64748b' : '#94a3b8',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#f8fafc' : '#0f172a',
  };

  return (
    <div className="glass-panel rounded-2xl p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Portfolio Growth &amp; Yield
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Autonomous Soroban vault growth over time
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-slate-600 dark:text-slate-300">Portfolio Value (USDC)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" aria-hidden="true" />
            <span className="text-slate-600 dark:text-slate-300">Accrued Yield</span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full" role="img" aria-label="Portfolio value and yield chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={isDark ? 0.4 : 0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={isDark ? 0.3 : 0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={tokens.grid}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke={tokens.axis}
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke={tokens.axis}
              fontSize={12}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tokens.tooltipBg,
                borderColor: tokens.tooltipBorder,
                borderRadius: '12px',
                color: tokens.tooltipText,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
              }}
              formatter={(val: number) => [`$${val.toFixed(2)}`, '']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorValue)"
              name="Portfolio Value"
            />
            <Area
              type="monotone"
              dataKey="yield"
              stroke="#6366f1"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorYield)"
              name="Yield Earned"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
