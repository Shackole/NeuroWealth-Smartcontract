'use client';

import React, { useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { PortfolioDashboard } from '@/components/PortfolioDashboard';
import { PortfolioChart } from '@/components/PortfolioChart';
import { TransactionHistoryTable } from '@/components/TransactionHistoryTable';
import { ActionModal } from '@/components/ActionModal';
import { usePortfolio } from '@/lib/usePortfolio';
import { useAssetBreakdown } from '@/lib/useAssetBreakdown';

const USDC_SCALE = 10_000_000n;

function formatRawUsdc(amount: bigint): string {
  const whole = amount / USDC_SCALE;
  const fraction = (amount % USDC_SCALE).toString().padStart(7, '0');
  return `${whole}.${fraction}`;
}

export default function DashboardViewPage() {
  const [publicKey, setPublicKey] = useState<string | null>('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  const [modalType, setModalType] = useState<'deposit' | 'withdraw'>('deposit');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const { data, isLoading, isValidating, error, refresh } = usePortfolio(publicKey);
  const {
    raw: assetBalances,
    updatedAt: assetUpdatedAt,
    source: assetSource,
    hasData: hasAssetData,
    error: assetError,
    isValidating: assetsValidating,
    refresh: refreshAssets,
  } = useAssetBreakdown();

  const assets = useMemo(() => [
    {
      id: 'vault-idle-usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      rawAmount: formatRawUsdc(assetBalances.idle),
      protocol: 'Vault (idle)',
      estimatedValue: null,
      valuationSource: null,
      quoteUpdatedAt: null,
    },
    {
      id: 'vault-deployed-usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      rawAmount: formatRawUsdc(assetBalances.deployed),
      protocol: `Active strategy (${data.vaultState.strategy})`,
      estimatedValue: null,
      valuationSource: null,
      quoteUpdatedAt: null,
    },
  ], [assetBalances, data.vaultState.strategy]);

  const dataStatus = error || assetError
    ? 'error'
    : isValidating || assetsValidating
      ? 'refreshing'
      : 'online';
  const updatedAt = assetUpdatedAt || data.updatedAt || null;

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col justify-between">
      <Header
        publicKey={publicKey}
        onConnect={() => setPublicKey('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')}
        onDisconnect={() => setPublicKey(null)}
      />

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Dashboard</h1>
          <p className="text-slate-400">View your active yield strategies, portfolio balance, and performance metrics.</p>
        </header>

        <section aria-labelledby="portfolio-summary-heading" className="space-y-4">
          <h2 id="portfolio-summary-heading" className="sr-only">Portfolio Summary</h2>
          <PortfolioDashboard
            balance={data.vaultState.balance}
            exchangeRate={data.vaultState.exchangeRate}
            strategy={data.vaultState.strategy}
            apy={data.vaultState.apy}
            earnings={data.earnings}
            isConnected={Boolean(publicKey)}
            onOpenDeposit={() => {
              setModalType('deposit');
              setIsModalOpen(true);
            }}
            onOpenWithdraw={() => {
              setModalType('withdraw');
              setIsModalOpen(true);
            }}
            dataStatus={dataStatus}
            hasData={Boolean(data.updatedAt) || hasAssetData}
            updatedAt={updatedAt}
            onRefresh={() => {
              void refresh();
              void refreshAssets();
            }}
            assets={hasAssetData ? assets : undefined}
            totalEstimatedValue={null}
            totalValueSource={`${assetSource}; USDC quote unavailable, so no estimated total is shown`}
          />
        </section>

        <section aria-labelledby="chart-heading" className="space-y-4">
          <h2 id="chart-heading" className="text-xl font-bold text-white">Portfolio Performance</h2>
          <PortfolioChart
            data={data.chartData}
            status={error ? 'error' : isLoading ? 'loading' : 'ready'}
          />
        </section>

        <section aria-labelledby="history-heading" className="space-y-4">
          <h2 id="history-heading" className="text-xl font-bold text-white">Recent Transactions</h2>
          <TransactionHistoryTable publicKey={publicKey} />
        </section>
      </main>

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} NeuroWealth Protocol. WCAG 2.1 AA Compliant.</p>
      </footer>

      {isModalOpen && (
        <ActionModal
          isOpen={isModalOpen}
          type={modalType}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => setIsModalOpen(false)}
          publicKey={publicKey || ''}
          currentBalance={data.vaultState.balance}
        />
      )}
    </div>
  );
}
