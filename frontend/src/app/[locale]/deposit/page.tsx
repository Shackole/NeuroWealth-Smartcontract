'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { Zap, ShieldCheck, ArrowRight } from 'lucide-react';

export default function DepositPage() {
  const [amount, setAmount] = useState<string>('50');
  const [strategy, setStrategy] = useState<'conservative' | 'balanced' | 'growth'>('balanced');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const estimatedShares = (parseFloat(amount || '0') * 0.9596).toFixed(4);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSuccess(true);
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col justify-between">
      <Header
        publicKey="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
        onConnect={() => {}}
        onDisconnect={() => {}}
      />

      <main id="main-content" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-1">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20 mb-3">
            <Zap size={14} aria-hidden="true" /> Autonomous Yield Allocation
          </div>
          <h1 className="text-3xl font-extrabold text-white">Deposit USDC</h1>
          <p className="text-slate-400 text-sm mt-1">
            Deposit funds into the NeuroWealth smart contract vault to start earning automated DeFi yield.
          </p>
        </header>

        {isSuccess ? (
          <section aria-live="polite" className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <ShieldCheck size={28} aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-white">Deposit Confirmed!</h2>
            <p className="text-slate-300 text-sm">
              Successfully deposited {amount} USDC into the {strategy} yield strategy.
            </p>
            <button
              type="button"
              onClick={() => setIsSuccess(false)}
              className="mt-4 px-6 py-2.5 bg-emerald-500 text-black font-semibold rounded-xl hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              Make Another Deposit
            </button>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
            <div className="space-y-2">
              <label htmlFor="deposit-amount" className="block text-sm font-semibold text-slate-200">
                Deposit Amount (USDC)
              </label>
              <div className="relative">
                <input
                  id="deposit-amount"
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 text-lg"
                  aria-describedby="amount-hint"
                />
                <span className="absolute right-4 top-3.5 text-slate-400 font-semibold text-sm">USDC</span>
              </div>
              <p id="amount-hint" className="text-xs text-slate-400">
                Minimum deposit: 1 USDC. 1 USDC = 10,000,000 stroops.
              </p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-200">Select Yield Strategy</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'conservative', label: 'Conservative', apy: '6.2% APY' },
                  { id: 'balanced', label: 'Balanced', apy: '8.4% APY' },
                  { id: 'growth', label: 'Growth', apy: '12.8% APY' },
                ].map((s) => (
                  <label
                    key={s.id}
                    className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-colors ${
                      strategy === s.id
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{s.label}</span>
                      <input
                        type="radio"
                        name="strategy"
                        value={s.id}
                        checked={strategy === s.id}
                        onChange={() => setStrategy(s.id as any)}
                        className="text-emerald-500 focus:ring-emerald-500 h-4 w-4"
                      />
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">{s.apy}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Estimated Vault Shares:</span>
                <span className="text-white font-mono font-medium">{estimatedShares} NV-SHARES</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Network Fee:</span>
                <span className="text-emerald-400 font-mono font-medium">~0.00001 XLM</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 text-black font-bold text-base hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 flex items-center justify-center gap-2"
            >
              <span>Confirm Deposit</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        )}
      </main>

      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} NeuroWealth Protocol. WCAG 2.1 AA Compliant.</p>
      </footer>
    </div>
  );
}
