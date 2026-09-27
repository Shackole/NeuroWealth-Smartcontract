'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { BalanceCard } from '@/components/BalanceCard';
import { EarningsCard } from '@/components/EarningsCard';
import { PortfolioChart } from '@/components/PortfolioChart';
import { TransactionHistory } from '@/components/TransactionHistory';
import { ActionModal } from '@/components/ActionModal';

export default function DashboardViewPage() {
  const [publicKey, setPublicKey] = useState<string | null>('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  const [modalType, setModalType] = useState<'deposit' | 'withdraw'>('deposit');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const vaultState = {
    balance: 100.25,
    strategy: 'Balanced',
    exchangeRate: 1.042,
    apy: 8.4,
  };

  const earnings = {
    today: 0.23,
    week: 1.61,
    month: 6.95,
  };

  const chartData = [
    { date: 'Day 1', value: 95.0 },
    { date: 'Day 2', value: 97.2 },
    { date: 'Day 3', value: 100.25 },
  ];

  const transactions = [
    {
      id: 'tx-1',
      type: 'deposit' as const,
      amount: 50.0,
      timestamp: new Date().toISOString(),
      status: 'confirmed' as const,
      txHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    },
    {
      id: 'tx-2',
      type: 'yield' as const,
      amount: 0.25,
      timestamp: new Date().toISOString(),
      status: 'confirmed' as const,
    },
  ];

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <BalanceCard
              balance={vaultState.balance}
              strategy={vaultState.strategy}
              exchangeRate={vaultState.exchangeRate}
              onDeposit={() => {
                setModalType('deposit');
                setIsModalOpen(true);
              }}
              onWithdraw={() => {
                setModalType('withdraw');
                setIsModalOpen(true);
              }}
            />
            <EarningsCard earnings={earnings} apy={vaultState.apy} />
          </div>
        </section>

        <section aria-labelledby="chart-heading" className="space-y-4">
          <h2 id="chart-heading" className="text-xl font-bold text-white">Portfolio Performance</h2>
          <PortfolioChart data={chartData} />
        </section>

        <section aria-labelledby="history-heading" className="space-y-4">
          <h2 id="history-heading" className="text-xl font-bold text-white">Recent Transactions</h2>
          <TransactionHistory transactions={transactions} />
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
          currentBalance={vaultState.balance}
        />
      )}
    </div>
  );
}
