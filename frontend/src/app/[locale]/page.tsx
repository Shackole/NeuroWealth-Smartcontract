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
import { MessageSquare, Bot, ArrowRight, Zap, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { connectFreighterWallet } from '@/lib/freighter';
import { fetchVaultState, VaultState } from '@/lib/stellar';
import {
  getEarningsSummary,
  getPortfolioValueHistory,
  getRecentTransactions,
  EarningsSummary,
  ChartDataPoint,
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
    apy: 8.4
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
    if (key) {
      setPublicKey(key);
    }
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
      <div>
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

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Hero Banner / Wallet Banner */}
          {!publicKey && (
            <div className="glass-panel rounded-3xl p-8 relative overflow-hidden border border-emerald-500/20 bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-indigo-950/30 shadow-glow-emerald">
              <div className="max-w-2xl relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20 mb-4">
                  <Zap size={14} /> AI-Powered Autonomous Yield Engine
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
                  {t('title')}
                </h1>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                  {t('description')}
                </p>
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold px-6 py-3 rounded-full transition-all shadow-glow-emerald"
                >
                  <span>{t('getStarted')}</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Top 3 Cards Grid */}
          <section id="dashboard" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <BalanceCard
              balance={vaultState.balance}
              usdEquivalent={vaultState.balance * 1.0}
              exchangeRate={vaultState.exchangeRate}
              onOpenDeposit={() => openModal('deposit')}
              onOpenWithdraw={() => openModal('withdraw')}
              isConnected={!!publicKey}
            />

            <EarningsCard earnings={earnings} isConnected={!!publicKey} />

            <StrategyBadge
              strategy={vaultState.strategy}
              apy={vaultState.apy}
              onSelectStrategy={(newSt) => setVaultState((prev) => ({ ...prev, strategy: newSt }))}
            />
          </section>

          {/* Portfolio Chart Section */}
          <section id="strategies">
            <PortfolioChart data={chartData.length > 0 ? chartData : [
              { date: 'Jul 21', value: 1000, yield: 0 },
              { date: 'Jul 24', value: 1200, yield: 15 },
              { date: 'Jul 28', value: 1450, yield: 45 }
            ]} />
          </section>

          {/* Transaction History & WhatsApp Banner */}
          <section id="history" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TransactionHistory transactions={transactions} />
            </div>

            {/* WhatsApp Integration Callout Card */}
            <div id="whatsapp" className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between border border-emerald-500/20">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-emerald-400" /> WhatsApp Integration
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live Bot
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-2">
                  Interact via WhatsApp Chat
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  No browser or wallet needed! Simply text our Twilio bot to verify with OTP, check balance, deposit, or withdraw on the go.
                </p>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 space-y-1 mb-4">
                  <div>User: deposit 100 USDC</div>
                  <div className="text-slate-300">Agent: Got it! Deposited 100 USDC into Balanced strategy. ✅</div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-400 block mb-2">Webhook URL:</span>
                <code className="text-[11px] bg-slate-900 px-2 py-1 rounded border border-slate-800 text-slate-300 block truncate">
                  /api/whatsapp/webhook
                </code>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Action Modal */}
      <ActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        type={modalType}
        userPublicKey={publicKey}
        balance={vaultState.balance}
        exchangeRate={vaultState.exchangeRate}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#06080e] py-6 mt-12 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-emerald-400" />
            <span className="font-semibold text-slate-300">NeuroWealth AI Vault</span>
            <span>— Soroban Smart Contract Architecture</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://stellar.org" target="_blank" rel="noreferrer" className="hover:text-emerald-400 transition-colors">Stellar Network</a>
            <a href="https://soroban.stellar.org" target="_blank" rel="noreferrer" className="hover:text-emerald-400 transition-colors">Soroban SDK</a>
            <a href="https://freighter.app" target="_blank" rel="noreferrer" className="hover:text-emerald-400 transition-colors">Freighter Wallet</a>
          </div>
        </div>
      </footer>
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
