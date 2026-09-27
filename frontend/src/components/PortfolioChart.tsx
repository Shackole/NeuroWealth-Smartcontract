'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { ChartDataPoint } from '@/lib/database';

interface PortfolioChartProps {
  data: ChartDataPoint[];
}

/*
 * Chart colours follow the CVD-safe blue/amber pairing (WCAG SC 1.4.1).
 * Blue (#2563eb) and amber (#d97706) are distinguishable for both
 * deuteranopia and protanopia. The legend also uses distinct shapes
 * (square vs. circle) so colour is never the sole differentiator.
 *
 * Reference: docs/CVD_PALETTE.md
 */
const CHART_A = '#2563eb'; // Blue  — Portfolio Value
const CHART_B = '#d97706'; // Amber — Accrued Yield

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data }) => {
  return (
    <div className="glass-panel rounded-2xl p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Portfolio Growth &amp; Yield</h3>
          <p className="text-xs text-slate-400">Autonomous Soroban vault growth over time</p>
        </div>

        {/* Legend — shape + colour for CVD safety (WCAG SC 1.4.1) */}
        <div
          className="flex items-center gap-4 text-xs"
          role="list"
          aria-label="Chart legend"
        >
          <div className="flex items-center gap-1.5" role="listitem">
            {/* Square shape (distinct from circle below) */}
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: CHART_A }}
              aria-hidden="true"
            />
            <span className="text-slate-300">Portfolio Value (USDC)</span>
          </div>
          <div className="flex items-center gap-1.5" role="listitem">
            {/* Circle shape */}
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CHART_B }}
              aria-hidden="true"
            />
            <span className="text-slate-300">Accrued Yield</span>
          </div>
        </div>
      </div>

      <div
        className="h-72 w-full"
        aria-label="Area chart showing portfolio value and accrued yield over time"
        role="img"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_A} stopOpacity={0.4} />
                <stop offset="95%" stopColor={CHART_A} stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_B} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_B} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '12px',
                color: '#f8fafc',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
              }}
              formatter={(val: number) => [`$${val.toFixed(2)}`, '']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_A}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorValue)"
              name="Portfolio Value"
            />
            <Area
              type="monotone"
              dataKey="yield"
              stroke={CHART_B}
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
