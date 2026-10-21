'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { BalanceCard } from './BalanceCard';
import { EarningsCard } from './EarningsCard';
import { StrategyBadge } from './StrategyBadge';
import { AssetOverview, type PortfolioAsset } from './AssetOverview';
import { EarningsSummary } from '@/lib/database';

export interface PortfolioDashboardProps {
  balance: number;
  exchangeRate: number;
  strategy: 'Conservative' | 'Balanced' | 'Growth';
  apy: number;
  earnings: EarningsSummary;
  isConnected: boolean;
  onOpenDeposit?: () => void;
  onOpenWithdraw?: () => void;
  onSelectStrategy?: (strategy: 'Conservative' | 'Balanced' | 'Growth') => void;
  dataStatus?: 'online' | 'offline' | 'refreshing' | 'error';
  hasData?: boolean;
  updatedAt?: string | null;
  onRefresh?: () => void;
  assets?: PortfolioAsset[];
  totalEstimatedValue?: string | null;
  totalValueSource?: string | null;
}

export const PortfolioDashboard: React.FC<PortfolioDashboardProps> = ({
  balance,
  exchangeRate,
  strategy,
  apy,
  earnings,
  isConnected,
  onOpenDeposit,
  onOpenWithdraw,
  onSelectStrategy,
  dataStatus = 'online',
  hasData = true,
  updatedAt,
  onRefresh,
  assets,
  totalEstimatedValue,
  totalValueSource,
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : NaN;
  const freshnessUnknown = !Number.isFinite(updatedAtMs);
  const stale = freshnessUnknown || now - updatedAtMs > 60_000;
  const offline = dataStatus === 'offline' || dataStatus === 'error';
  const freshnessLabel = Number.isFinite(updatedAtMs)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(updatedAtMs)
    : 'Update time unavailable';

  return (
    <section
      role="region"
      aria-label="Portfolio Dashboard"
      className="space-y-6"
    >
      <span className="sr-only" aria-label={`Status: ${isConnected ? 'Connected' : 'Disconnected'}`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Portfolio Overview
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time balance, earnings, and yield metrics
          </p>
        </div>
        <div className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 ${offline || stale ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
          <div className="flex min-w-0 items-center gap-2">
            {offline ? <WifiOff size={15} className="shrink-0 text-amber-300" aria-hidden="true" /> : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dataStatus === 'refreshing' ? 'bg-blue-300' : 'bg-emerald-400'}`} aria-hidden="true" />}
            <span className="text-xs text-slate-200" role="status" aria-live="polite">
              {dataStatus === 'refreshing'
                ? 'Updating portfolio…'
                : offline
                  ? hasData ? 'Offline · showing last available data' : 'Portfolio data unavailable'
                  : freshnessUnknown
                    ? 'Data freshness unknown'
                    : stale
                      ? 'Data may be stale'
                      : 'Portfolio data current'}
            </span>
          </div>
          {Number.isFinite(updatedAtMs) ? (
            <time className="text-xs text-slate-400" dateTime={new Date(updatedAtMs).toISOString()}>
              Last updated {freshnessLabel}
            </time>
          ) : (
            <span className="text-xs text-slate-400">{freshnessLabel}</span>
          )}
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={dataStatus === 'refreshing'} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-emerald-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-50">
              <RefreshCw size={14} aria-hidden="true" className={dataStatus === 'refreshing' ? 'animate-spin' : undefined} />
              Retry update
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BalanceCard
          balance={balance}
          usdEquivalent={balance * 1.0}
          exchangeRate={exchangeRate}
          onOpenDeposit={onOpenDeposit || (() => {})}
          onOpenWithdraw={onOpenWithdraw || (() => {})}
          isConnected={isConnected}
        />

        <EarningsCard
          earnings={earnings}
          isConnected={isConnected}
        />

        <StrategyBadge
          strategy={strategy}
          apy={apy}
          onSelectStrategy={onSelectStrategy}
        />
      </div>
      {assets && (
        <AssetOverview assets={assets} totalEstimatedValue={totalEstimatedValue} totalValueSource={totalValueSource} />
      )}
    </section>
  );
};
