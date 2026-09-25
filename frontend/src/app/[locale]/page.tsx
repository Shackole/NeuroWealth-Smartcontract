'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { BalanceCard } from '@/components/BalanceCard';
import { EarningsCard } from '@/components/EarningsCard';
import { StrategyBadge } from '@/components/StrategyBadge';
import { PortfolioChart } from '@/components/PortfolioChart';
import { TransactionHistory } from '@/components/TransactionHistory';
import { ActionModal } from '@/components/ActionModal';
import {
  BalanceCardSkeleton,
  EarningsCardSkeleton,
  StrategyCardSkeleton,
  ChartSkeleton,
} from '@/components/SkeletonCard';
import { PortfolioError } from '@/components/PortfolioError';
import { MessageSquare, Bot, ArrowRight, ShieldCheck, Zap, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { connectFreighterWallet } from '@/lib/freighter';
import { usePortfolio } from '@/lib/usePortfolio';

/** Fallback chart data shown when no real data is available yet */
const PLACEHOLDER_CHART = [
  { date: 'Jul 21', value: 1000, yield: 0 },
  { date: 'Jul 24', value: 1200, yield: 15 },
  { date: 'Jul 28', value: 1450, yield: 45 },
];

export default function DashboardPage() {
  const t = useTranslations('Index');

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [modalType, setModalType] = useState<'deposit' | 'withdraw'>('deposit');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // SWR-powered portfolio data — auto-refreshes every 30 s
  const { data, isLoading, error, refresh } = usePortfolio(publicKey);
  const { vaultState, earnings, chartData, transactions } = data;

  const handleConnect = async () => {
    const key = await connectFreighterWallet();
    if (key) setPublicKey(key);
  };

  const handleDisconnect = () => setPublicKey(null);

  const openModal = (type: 'deposit' | 'withdraw') => {
    setModalType(type);
    setIsModalOpen(true);
  };

  /** After a successful deposit/withdraw, immediately re-fetch portfolio. */
  const handleTransactionComplete = () => {
    refresh();
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col justify-between">
      <div>
        <Header
          publicKey={publicKey}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />

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

          {/* Auto-refresh indicator */}
          {publicKey && (
            <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
              <RefreshCw
                size={12}
                className={isLoading ? 'animate-spin text-emerald-400' : ''}
                aria-hidden="true"
              />
              <span>
                {isLoading ? 'Refreshing…' : 'Auto-refreshes every 30 s'}
              </span>
              <button
                onClick={() => refresh()}
                className="underline underline-offset-2 hover:text-emerald-400 transition-colors"
                aria-label="Manually refresh portfolio data"
              >
                Refresh now
              </button>
            </div>
          )}

          {/* Top 3 Cards Grid */}
          <section id="dashboard" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {error ? (
              <PortfolioError message={error.message} onRetry={refresh} />
            ) : isLoading && !data.vaultState.balance ? (
              <>
                <BalanceCardSkeleton />
                <EarningsCardSkeleton />
                <StrategyCardSkeleton />
              </>
            ) : (
              <>
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
                  onSelectStrategy={(newSt) =>
                    // Optimistic update via mutate is handled by refresh
                    console.log('Strategy changed:', newSt)
                  }
                />
              </>
            )}
          </section>

          {/* Portfolio Chart Section */}
          <section id="strategies">
            {isLoading && chartData.length === 0 ? (
              <ChartSkeleton />
            ) : (
              <PortfolioChart
                data={chartData.length > 0 ? chartData : PLACEHOLDER_CHART}
              />
            )}
          </section>

          {/* Transaction History & WhatsApp Banner */}
          <section id="history" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TransactionHistory transactions={transactions} />
            </div>

            {/* WhatsApp Integration Callout Card */}
            <div
              id="whatsapp"
              className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between border border-emerald-500/20"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-emerald-400" />
                    WhatsApp Integration
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live Bot
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Interact via WhatsApp Chat
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  No browser or wallet needed! Simply text our Twilio bot to verify
                  with OTP, check balance, deposit, or withdraw on the go.
                </p>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 space-y-1 mb-4">
                  <div>User: deposit 100 USDC</div>
                  <div className="text-slate-300">
                    Agent: Got it! Deposited 100 USDC into Balanced strategy. ✅
                  </div>
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
        onClose={handleTransactionComplete}
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
            <a
              href="https://stellar.org"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              Stellar Network
            </a>
            <a
              href="https://soroban.stellar.org"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              Soroban SDK
            </a>
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              Freighter Wallet
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
