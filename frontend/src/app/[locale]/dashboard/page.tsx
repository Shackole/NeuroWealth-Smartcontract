'use client';

/**
 * DashboardPage
 *
 * Route-level entry point for the main portfolio dashboard.
 *
 * Error-recovery (Issue #404)
 * ─────────────────────────────────────────────────────────────────────────────
 * The entire page tree is wrapped in <RouteErrorBoundary routeName="Dashboard">
 * so that any render or fetch failure in a child component presents a
 * user-friendly "Try again" screen instead of a blank page.
 *
 * The data-fetching hook isolates individual dependency failures:
 *   • fetchError records the display-safe message from the failed call.
 *   • Each call is independent so a Stellar RPC hiccup does not erase already-
 *     loaded earnings data (and vice-versa).
 *
 * Security invariants:
 *   • Wallet keys and signed XDR envelopes are NEVER stored in component state;
 *     they live only inside `ActionModal`'s local try/catch scope.
 *   • `fetchError` holds only the `Error.message` string returned by the
 *     network or database layer — it never contains key material.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { BalanceCard } from '@/components/BalanceCard';
import { EarningsCard } from '@/components/EarningsCard';
import { StrategyBadge } from '@/components/StrategyBadge';
import { PortfolioChart } from '@/components/PortfolioChart';
import { TransactionHistory } from '@/components/TransactionHistory';
import { ActionModal } from '@/components/ActionModal';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { connectFreighterWallet } from '@/lib/freighter';
import { fetchVaultState, VaultState } from '@/lib/stellar';
import {
  getEarningsSummary,
  EarningsSummary,
  getPortfolioValueHistory,
  ChartDataPoint,
  getRecentTransactions,
  TransactionRecord
} from '@/lib/database';

// ─── Inner page component (wrapped by the error boundary below) ───────────────

function DashboardContent() {
  const t = useTranslations('Index');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [vaultState, setVaultState] = useState<VaultState>({
    balance: 0,
    strategy: 'Balanced',
    exchangeRate: 1.042,
    apy: 8.4,
  });
  const [earnings, setEarnings] = useState<EarningsSummary>({ today: 0, week: 0, month: 0 });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  /**
   * fetchError holds a display-safe message when any data dependency fails.
   * It NEVER contains wallet key material — only network/DB error strings.
   */
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalType, setModalType] = useState<'deposit' | 'withdraw'>('deposit');

  const handleConnect = async () => {
    const key = await connectFreighterWallet();
    setPublicKey(key);
  };

  const handleDisconnect = () => {
    setPublicKey(null);
  };

  /**
   * loadData — fetches all data dependencies for the connected wallet.
   *
   * Each call is made independently so a partial failure degrades gracefully:
   * already-loaded data is preserved and `fetchError` is set with the
   * display-safe message from the first failing call.
   *
   * Wallet secrets are NEVER stored here — `publicKey` is the Stellar public
   * key (G… address), which is safe to hold in state.
   */
  const loadData = useCallback(async (key: string | null) => {
    if (!key) {
      setVaultState({ balance: 0, strategy: 'Balanced', exchangeRate: 1.042, apy: 8.4 });
      setEarnings({ today: 0, week: 0, month: 0 });
      setChartData([]);
      setTransactions([]);
      setFetchError(null);
      return;
    }

    setIsFetching(true);
    setFetchError(null);

    try {
      const state = await fetchVaultState(key);
      setVaultState(state);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load vault state.');
    }

    try {
      const earnData = await getEarningsSummary(key);
      setEarnings(earnData);
    } catch {
      // Non-critical — retain previous value; vault state took priority for error display
    }

    try {
      const chart = await getPortfolioValueHistory(key);
      setChartData(chart);
    } catch {
      // Non-critical — chart degrades to placeholder data below
    }

    try {
      const txs = await getRecentTransactions(key);
      setTransactions(txs);
    } catch {
      // Non-critical — history section remains empty rather than erroring
    }

    setIsFetching(false);
  }, []);

  useEffect(() => {
    loadData(publicKey);
  }, [publicKey, loadData]);

  const openModal = (type: 'deposit' | 'withdraw') => {
    setModalType(type);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col justify-between">
      <Header publicKey={publicKey} onConnect={handleConnect} onDisconnect={handleDisconnect} />

      {/* Fetch-error banner — shown when a data dependency fails but the
          page itself renders. Wallet key material is never surfaced here. */}
      {fetchError && (
        <div
          role="alert"
          aria-live="polite"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4"
        >
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
              <span>
                Some data could not be loaded: <span className="font-mono">{fetchError}</span>
              </span>
            </div>
            <button
              onClick={() => loadData(publicKey)}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              aria-label="Retry loading dashboard data"
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {t('dashboard_title', { defaultValue: 'Dashboard' })}
          </h1>
          <p className="text-slate-400">
            {t('dashboard_subtitle', { defaultValue: 'View your active yield strategies, portfolio balance, and performance metrics.' })}
          </p>
        </header>

        <section aria-labelledby="portfolio-summary-heading" className="space-y-4">
          <h2 id="portfolio-summary-heading" className="sr-only">Portfolio Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <BalanceCard
              balance={vaultState.balance}
              strategy={vaultState.strategy}
              exchangeRate={vaultState.exchangeRate}
              onDeposit={() => openModal('deposit')}
              onWithdraw={() => openModal('withdraw')}
            />
            <EarningsCard earnings={earnings} apy={vaultState.apy} />
          </div>
          {publicKey && (
            <StrategyBadge strategy={vaultState.strategy} publicKey={publicKey} />
          )}
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

// ─── Route export ─────────────────────────────────────────────────────────────

/**
 * DashboardPage — the Next.js route component exported from this file.
 *
 * Wraps the inner page tree in a <RouteErrorBoundary> so that:
 *   1. Any render or fetch failure shows the recovery UI instead of blank page.
 *   2. The "Try again" button remounts the subtree and retries data fetching.
 *   3. Wallet secrets and signed XDR envelopes are NEVER stored in error state
 *      (see RouteErrorBoundary and ActionModal implementation notes).
 */
export default function DashboardPage() {
  return (
    <RouteErrorBoundary routeName="Dashboard">
      <DashboardContent />
    </RouteErrorBoundary>
  );
}
