import React from 'react';
import type { Metadata } from 'next';
import { TrendingUp, Users, Layers, Activity, RefreshCw, ArrowLeft, Zap } from 'lucide-react';
import { fetchVaultStats } from '@/lib/stellar';
import { ExchangeRateChart } from '@/components/ExchangeRateChart';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Vault Stats | NeuroWealth',
  description:
    'Real-time NeuroWealth vault statistics: TVL, protocol breakdown, unique depositors, and exchange rate history.',
};

// ISR: regenerate this page on the server every 60 seconds
export const revalidate = 60;

// ── Stat card helper ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subValue,
  icon,
  accent,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  accent: 'emerald' | 'indigo' | 'amber' | 'slate';
}) {
  const accentMap = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    slate: 'bg-slate-700/30 text-slate-300 border-slate-700',
  };

  return (
    <div className="glass-panel rounded-2xl p-5 relative overflow-hidden border border-slate-800">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 border ${accentMap[accent]}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-white tracking-tight font-mono">{value}</p>
      {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
    </div>
  );
}

// ── Protocol badge ────────────────────────────────────────────────────────────

function ProtocolBadge({ protocol, apy }: { protocol: string; apy: number }) {
  const colorMap: Record<string, string> = {
    Blend: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    DEX: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    None: 'bg-slate-700/40 text-slate-400 border-slate-700',
  };
  const color = colorMap[protocol] ?? colorMap['None'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      {protocol === 'None' ? 'Idle (no protocol)' : `${protocol} Protocol`}
      {apy > 0 && <span className="ml-1 opacity-80">· {apy}% APY</span>}
    </span>
  );
}

// ── Asset breakdown bar ───────────────────────────────────────────────────────

function AssetBreakdownBar({
  idle,
  deployed,
}: {
  idle: number;
  deployed: number;
}) {
  const total = idle + deployed;
  const deployedPct = total > 0 ? (deployed / total) * 100 : 0;
  const idlePct = 100 - deployedPct;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">Asset Breakdown</h3>
        <span className="text-xs text-slate-400 font-mono">
          {total.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC total
        </span>
      </div>

      {/* Stacked bar */}
      <div className="h-4 w-full rounded-full overflow-hidden flex mb-3">
        <div
          className="bg-indigo-500 h-full transition-all duration-500"
          style={{ width: `${deployedPct}%` }}
          role="presentation"
        />
        <div
          className="bg-slate-600 h-full transition-all duration-500"
          style={{ width: `${idlePct}%` }}
          role="presentation"
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="text-slate-300">
            Deployed —{' '}
            <span className="font-mono font-semibold text-indigo-300">
              {deployed.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
            </span>{' '}
            <span className="text-slate-500">({deployedPct.toFixed(1)}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span className="text-slate-300">
            Idle —{' '}
            <span className="font-mono font-semibold text-slate-300">
              {idle.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Auto-refresh client wrapper ───────────────────────────────────────────────
// We use a simple <meta http-equiv="refresh"> trick in the layout; the ISR handles
// the server data. For the client-side countdown we inject a small script.

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function VaultStatsPage() {
  const stats = await fetchVaultStats();

  const fetchedTime = new Date(stats.fetchedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100">
      {/* Auto-refresh every 60 s */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="60" />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-[#06080e]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" />
              <span className="font-bold text-white text-sm">Vault Stats</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw size={11} />
            <span>Auto-refreshes every 60s</span>
            <span className="text-slate-700">·</span>
            <span>Last: {fetchedTime}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Page title */}
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            Vault Analytics
          </h1>
          <p className="text-slate-400 text-sm">
            Public, real-time metrics from the NeuroWealth Soroban vault — no wallet required.
          </p>
        </div>

        {/* Top stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Value Locked"
            value={`$${stats.tvl.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            subValue="USDC in vault"
            icon={<TrendingUp size={18} />}
            accent="emerald"
          />
          <StatCard
            label="Unique Depositors"
            value={stats.uniqueDepositors.toLocaleString()}
            subValue="Wallet addresses"
            icon={<Users size={18} />}
            accent="indigo"
          />
          <StatCard
            label="Current APY"
            value={`${stats.currentApy}%`}
            subValue={`via ${stats.currentProtocol}`}
            icon={<Activity size={18} />}
            accent="amber"
          />
          <StatCard
            label="Exchange Rate"
            value={stats.exchangeRate.toFixed(4)}
            subValue="USDC per NV-SHARE"
            icon={<Layers size={18} />}
            accent="slate"
          />
        </div>

        {/* Active protocol */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Active Protocol
            </p>
            <ProtocolBadge protocol={stats.currentProtocol} apy={stats.currentApy} />
          </div>
          <div className="text-xs text-slate-400 sm:text-right leading-relaxed max-w-xs">
            {stats.currentProtocol === 'Blend' && (
              <>Lending on Blend Protocol — steady stablecoin interest.</>
            )}
            {stats.currentProtocol === 'DEX' && (
              <>Providing liquidity on Stellar DEX — earns trading fees + yield.</>
            )}
            {stats.currentProtocol === 'None' && (
              <>Funds are idle. The AI agent will deploy to the best available protocol.</>
            )}
          </div>
        </div>

        {/* Asset breakdown */}
        <AssetBreakdownBar idle={stats.idleUsdc} deployed={stats.deployedUsdc} />

        {/* Exchange rate chart */}
        <div className="glass-panel rounded-2xl p-5 border border-slate-800">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Exchange Rate — Last 30 Days</h3>
              <p className="text-xs text-slate-400">
                NV-SHARE → USDC conversion rate. Rising rate = growing yield.
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
              +{(((stats.exchangeRate - 1) / 1) * 100).toFixed(2)}% 30d
            </span>
          </div>
          {stats.rateHistory.length > 0 ? (
            <ExchangeRateChart data={stats.rateHistory} />
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              No rate history available yet.
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-600 pb-6">
          Data sourced from NeuroWealth Soroban vault on Stellar Testnet · No wallet connection required ·
          Page auto-refreshes every 60 seconds
        </p>
      </main>
    </div>
  );
}
