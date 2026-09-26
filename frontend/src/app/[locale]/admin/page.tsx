'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { Shield, AlertTriangle, Lock, Unlock, Clock } from 'lucide-react';

export default function AdminPage() {
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [tvlCap, setTvlCap] = useState<string>('5000000');
  const [capFeedback, setCapFeedback] = useState<string | null>(null);

  const pendingTimelocks = [
    {
      id: 'tl-1',
      action: 'Upgrade Contract WASM',
      hash: '3f7a1b...8c9d2e',
      expiryLedger: 5432100,
      currentLedger: 5431800,
      timeRemaining: '~25 minutes',
    },
    {
      id: 'tl-2',
      action: 'Update Strategy Agent Key',
      hash: '9a0b1c...2d3e4f',
      expiryLedger: 5434500,
      currentLedger: 5431800,
      timeRemaining: '~3.75 hours',
    },
  ];

  const handleUpdateCap = (e: React.FormEvent) => {
    e.preventDefault();
    setCapFeedback(`TVL cap successfully scheduled for update to ${parseInt(tvlCap, 10).toLocaleString()} USDC.`);
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col justify-between">
      <Header
        publicKey="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
        onConnect={() => {}}
        onDisconnect={() => {}}
      />

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
            <Shield size={14} aria-hidden="true" /> Vault Owner & Guardian Controls
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Admin Management</h1>
          <p className="text-slate-400">
            Smart contract security parameters, circuit breaker toggles, and timelock governance queue.
          </p>
        </header>

        {/* Circuit Breaker Controls */}
        <section aria-labelledby="circuit-breaker-heading" className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 id="circuit-breaker-heading" className="text-xl font-bold text-white flex items-center gap-2">
                Circuit Breaker Status:
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isPaused ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                  {isPaused ? 'PAUSED (Deposits blocked)' : 'ACTIVE (Normal operations)'}
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Pausing halts all deposits and rebalances while withdrawals remain accessible.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors focus-visible:outline focus-visible:outline-2 ${
                isPaused
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 focus-visible:outline-emerald-400'
                  : 'bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-400'
              }`}
            >
              {isPaused ? <Unlock size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
              <span>{isPaused ? 'Resume Vault' : 'Pause Vault Emergency'}</span>
            </button>
          </div>
        </section>

        {/* TVL Cap Management */}
        <section aria-labelledby="tvl-cap-heading" className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 id="tvl-cap-heading" className="text-xl font-bold text-white">TVL Cap Management</h2>
          <form onSubmit={handleUpdateCap} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <label htmlFor="tvl-cap-input" className="block text-sm font-semibold text-slate-200">
                Maximum Total Value Locked (USDC)
              </label>
              <input
                id="tvl-cap-input"
                type="number"
                min="100000"
                step="1000"
                value={tvlCap}
                onChange={(e) => setTvlCap(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                aria-describedby="tvl-cap-hint"
              />
              <p id="tvl-cap-hint" className="text-xs text-slate-400">
                Decreases apply immediately; increases are subject to a 7-day timelock delay.
              </p>
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-xl border border-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              Update TVL Cap
            </button>
            {capFeedback && (
              <p role="status" className="text-sm font-medium text-emerald-400">{capFeedback}</p>
            )}
          </form>
        </section>

        {/* Pending Timelocks Table */}
        <section aria-labelledby="timelocks-heading" className="space-y-4">
          <h2 id="timelocks-heading" className="text-xl font-bold text-white flex items-center gap-2">
            <Clock size={20} className="text-indigo-400" aria-hidden="true" />
            <span>Pending Governance Timelocks</span>
          </h2>
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <caption className="sr-only">Active governance timelocks pending execution</caption>
              <thead className="bg-slate-900/80 text-slate-300 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">Action</th>
                  <th scope="col" className="px-6 py-4">Payload Hash</th>
                  <th scope="col" className="px-6 py-4">Target Ledger</th>
                  <th scope="col" className="px-6 py-4">Estimated Time Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {pendingTimelocks.map((tl) => (
                  <tr key={tl.id} className="hover:bg-slate-900/40">
                    <th scope="row" className="px-6 py-4 font-semibold text-white">{tl.action}</th>
                    <td className="px-6 py-4 font-mono text-slate-400">{tl.hash}</td>
                    <td className="px-6 py-4 font-mono">{tl.expiryLedger}</td>
                    <td className="px-6 py-4 text-amber-400 font-medium">{tl.timeRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} NeuroWealth Protocol. WCAG 2.1 AA Compliant.</p>
      </footer>
    </div>
  );
}
