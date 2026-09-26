'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { ArrowDownLeft, ShieldCheck, ArrowRight } from 'lucide-react';

export default function WithdrawPage() {
  const [amount, setAmount] = useState<string>('25');
  const [withdrawAll, setWithdrawAll] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const availableBalance = 100.25;

  const handleWithdrawAllToggle = () => {
    const nextState = !withdrawAll;
    setWithdrawAll(nextState);
    if (nextState) {
      setAmount(String(availableBalance));
    }
  };

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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/20 mb-3">
            <ArrowDownLeft size={14} aria-hidden="true" /> Instant Liquidity
          </div>
          <h1 className="text-3xl font-extrabold text-white">Withdraw USDC</h1>
          <p className="text-slate-400 text-sm mt-1">
            Burn vault shares and withdraw USDC principal and accrued yield back to your wallet.
          </p>
        </header>

        {isSuccess ? (
          <section aria-live="polite" className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <ShieldCheck size={28} aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-white">Withdrawal Processed!</h2>
            <p className="text-slate-300 text-sm">
              Successfully withdrew {amount} USDC directly to your Stellar wallet.
            </p>
            <button
              type="button"
              onClick={() => setIsSuccess(false)}
              className="mt-4 px-6 py-2.5 bg-emerald-500 text-black font-semibold rounded-xl hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              Make Another Withdrawal
            </button>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Available Vault Balance:</span>
              <span className="text-white font-mono font-bold">{availableBalance.toFixed(2)} USDC</span>
            </div>

            <div className="space-y-2">
              <label htmlFor="withdraw-amount" className="block text-sm font-semibold text-slate-200">
                Withdraw Amount (USDC)
              </label>
              <div className="relative">
                <input
                  id="withdraw-amount"
                  type="number"
                  min="0.01"
                  max={availableBalance}
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setWithdrawAll(false);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 text-lg"
                  aria-describedby="withdraw-hint"
                />
                <button
                  type="button"
                  onClick={handleWithdrawAllToggle}
                  className="absolute right-3 top-2.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold rounded-lg border border-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  MAX
                </button>
              </div>
              <p id="withdraw-hint" className="text-xs text-slate-400">
                USDC will be transferred to your connected Freighter wallet upon transaction confirmation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Shares Burned:</span>
                <span className="text-white font-mono font-medium">
                  {(parseFloat(amount || '0') * 0.9596).toFixed(4)} NV-SHARES
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Protocol Fee:</span>
                <span className="text-emerald-400 font-mono font-medium">0.00% (No exit fee)</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 text-black font-bold text-base hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 flex items-center justify-center gap-2"
            >
              <span>Confirm Withdrawal</span>
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
