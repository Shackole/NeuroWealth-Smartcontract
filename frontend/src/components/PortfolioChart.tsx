'use client';

import React, { useEffect, useState } from 'react';
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
  status?: 'ready' | 'loading' | 'error';
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data, status = 'ready' }) => {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const first = data[0];
  const latest = data[data.length - 1];

  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-6 relative min-w-0" aria-labelledby="portfolio-chart-title">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 id="portfolio-chart-title" className="text-lg font-bold text-white tracking-tight">Portfolio Growth & Yield</h3>
          <p className="text-xs text-slate-400">Portfolio value and accrued yield, both in USDC</p>
        </div>
        <div className="flex items-center gap-4 text-xs hidden sm:flex">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-300">Portfolio Value (USDC)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <span className="text-slate-300">Accrued Yield</span>
          </div>
        </div>
      </div>

      {status === 'loading' ? (
        <p className="flex h-48 items-center justify-center text-sm text-slate-400" role="status">
          Loading chart data…
        </p>
      ) : status === 'error' ? (
        <p className="flex h-48 items-center justify-center text-sm text-amber-300" role="status">
          Chart data is temporarily unavailable. The portfolio summary remains available.
        </p>
      ) : data.length === 0 ? (
        <p className="flex h-48 items-center justify-center rounded-xl border border-slate-800 text-sm text-slate-400" role="status">
          No chart data is available for this period.
        </p>
      ) : (
        <>
          {first && latest && (
            <p className="mb-3 text-xs text-slate-400" aria-live="polite">
              From {first.date} to {latest.date}. Latest portfolio value: {latest.value.toFixed(2)} USDC; accrued yield: {latest.yield.toFixed(2)} USDC.
            </p>
          )}
          <div className="h-48 sm:h-64 md:h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={['auto', 'auto']} width={48} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                  }}
                  formatter={(val: number) => [`${val.toFixed(2)} USDC`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                  name="Portfolio Value"
                  isAnimationActive={!reducedMotion}
                />
                <Area
                  type="monotone"
                  dataKey="yield"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorYield)"
                  name="Yield Earned"
                  isAnimationActive={!reducedMotion}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-4 border-t border-slate-800 pt-3">
            <summary className="flex min-h-11 cursor-pointer items-center rounded text-sm font-medium text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              View chart data table
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">Portfolio value and accrued yield by date, in USDC; APY in basis points when available.</caption>
                <thead>
                  <tr className="border-b border-slate-700 text-xs text-slate-400">
                    <th scope="col" className="py-2 pr-4">Date</th>
                    <th scope="col" className="py-2 pr-4">Portfolio value (USDC)</th>
                    <th scope="col" className="py-2 pr-4">Accrued yield (USDC)</th>
                    <th scope="col" className="py-2">APY (basis points)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((point) => (
                    <tr key={`${point.date}-${point.value}`} className="border-b border-slate-800/70">
                      <th scope="row" className="py-2 pr-4 font-medium text-slate-200">{point.date}</th>
                      <td className="py-2 pr-4 font-mono text-slate-200">{point.value.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono text-slate-200">{point.yield.toFixed(2)}</td>
                      <td className="py-2 font-mono text-slate-200">{point.apyBps ?? 'Unavailable'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
};
