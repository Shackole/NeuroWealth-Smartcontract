'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { ChartDataPoint } from '@/lib/database';

// Lazy-load PortfolioChart so Recharts is NOT included in the initial JS bundle.
// This improves LCP and reduces TTI on first load.
const PortfolioChart = dynamic(
  () => import('./PortfolioChart').then((mod) => ({ default: mod.PortfolioChart })),
  {
    loading: () => (
      <div className="glass-panel rounded-2xl p-6 h-[22rem] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500/40 border-t-emerald-400 animate-spin" />
          <span className="text-sm">Loading chart...</span>
        </div>
      </div>
    ),
    ssr: false,
  }
);

interface LazyPortfolioChartProps {
  data: ChartDataPoint[];
}

export const LazyPortfolioChart: React.FC<LazyPortfolioChartProps> = ({ data }) => {
  return <PortfolioChart data={data} />;
};
