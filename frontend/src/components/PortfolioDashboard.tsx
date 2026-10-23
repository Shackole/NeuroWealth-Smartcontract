'use client';

import React, { useMemo } from 'react';
import { BalanceCard } from './BalanceCard';
import { EarningsCard } from './EarningsCard';
import { StrategyBadge } from './StrategyBadge';
import { PortfolioChart } from './PortfolioChart';
import { ChartDataPoint, EarningsSummary } from '@/lib/database';

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
  /** Optional historical earnings (USDC) and APY (%) series for chart and accessible table */
  chartData?: ChartDataPoint[];
  /** Indicates that the historical chart series is unavailable (e.g., RPC/indexer outage) */
  seriesUnavailable?: boolean;
  /** Explanation displayed in summary and table when seriesUnavailable is true */
  seriesUnavailableReason?: string;
  /** Explicit Stellar network identity (default: 'Stellar Testnet') */
  networkName?: string;
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
  chartData,
  seriesUnavailable = false,
  seriesUnavailableReason,
  networkName = 'Stellar Testnet',
}) => {
  const effectiveChartData = useMemo<ChartDataPoint[]>(() => {
    if (chartData !== undefined) {
      return chartData;
    }

    const hasEarnings =
      earnings.today !== 0 || earnings.week !== 0 || earnings.month !== 0;

    if (!isConnected && !hasEarnings) {
      return [];
    }

    const baseThirtyDaysAgo = Math.max(0, Number((balance - earnings.month).toFixed(2)));
    const baseSevenDaysAgo = Math.max(0, Number((balance - earnings.week).toFixed(2)));
    const currentVal = Number(balance.toFixed(2));

    return [
      {
        date: '30d Window Start (UTC)',
        value: baseThirtyDaysAgo,
        yield: Number(Math.max(0, earnings.month - earnings.week).toFixed(2)),
        apy,
      },
      {
        date: '7d Window Start (UTC)',
        value: baseSevenDaysAgo,
        yield: Number(earnings.week.toFixed(2)),
        apy,
      },
      {
        date: 'Current Snapshot (UTC)',
        value: currentVal,
        yield: Number(earnings.month.toFixed(2)),
        apy,
      },
    ];
  }, [chartData, isConnected, balance, earnings, apy]);

  return (
    <section
      role="region"
      aria-label="Portfolio Dashboard"
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Portfolio Overview
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time balance (USDC), earnings (USDC), and yield metrics (% APY) on{' '}
            <span className="font-semibold text-slate-300">{networkName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300"
            data-testid="network-identity-badge"
          >
            {networkName}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`}
              aria-hidden="true"
            />
            <span
              className="text-xs font-mono text-slate-400"
              aria-label={`Status: ${isConnected ? 'Connected' : 'Disconnected'}`}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
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

      <PortfolioChart
        data={effectiveChartData}
        defaultApy={apy}
        isUnavailable={seriesUnavailable}
        unavailableReason={seriesUnavailableReason}
        network={networkName}
        isConnected={isConnected}
      />
    </section>
  );
};
