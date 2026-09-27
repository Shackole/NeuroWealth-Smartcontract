'use client';

import React from 'react';
import { BalanceCard } from './BalanceCard';
import { EarningsCard } from './EarningsCard';
import { StrategyBadge } from './StrategyBadge';
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
  onSelectStrategy
}) => {
  return (
    <section
      role="region"
      aria-label="Portfolio Dashboard"
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Portfolio Overview
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time balance, earnings, and yield metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`}
            aria-hidden="true"
          />
          <span className="text-xs font-mono text-slate-400" aria-label={`Status: ${isConnected ? 'Connected' : 'Disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
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
    </section>
  );
};
