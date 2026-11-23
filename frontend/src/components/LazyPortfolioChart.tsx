'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { PortfolioChartProps } from './PortfolioChart';

function ChartPlaceholder({ loading = false }: { loading?: boolean }) {
  return (
    <div className="glass-panel flex h-[34rem] items-center justify-center rounded-2xl sm:h-[30rem]">
      {loading && <span role="status" className="text-sm text-slate-400">Loading chart…</span>}
    </div>
  );
}

const PortfolioChart = dynamic(
  () => import('./PortfolioChart').then((module) => module.PortfolioChart),
  { ssr: false, loading: () => <ChartPlaceholder loading /> },
);

export type LazyPortfolioChartProps = PortfolioChartProps;

export function LazyPortfolioChart(props: LazyPortfolioChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="min-h-[34rem] sm:min-h-[30rem]">
      {shouldLoad ? <PortfolioChart {...props} /> : <ChartPlaceholder />}
    </div>
  );
}
