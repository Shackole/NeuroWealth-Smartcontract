'use client';

import React, { useState } from 'react';
import { ArrowDownLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { depositToVault } from '@/lib/contract';

export interface DepositFormProps {
  userPublicKey: string | null;
  balance?: number;
  exchangeRate?: number;
  onSuccess?: (txHash: string) => void;
}

export const DepositForm: React.FC<DepositFormProps> = ({
  userPublicKey,
  balance = 1000,
  exchangeRate = 1.042,
  onSuccess
}) => {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<string | null>(null);

  const numAmount = parseFloat(amount);
  const isPositive = !isNaN(numAmount) && numAmount > 0;
  const isValid = isPositive && !!userPublicKey;

  const estimatedShares = isPositive ? (numAmount / exchangeRate).toFixed(4) : '0.0000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError(null);

    try {
      const res = await depositToVault(userPublicKey!, numAmount);
      if (res.success && res.txHash) {
        setSuccessTx(res.txHash);
        if (onSuccess) {
          onSuccess(res.txHash);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 text-slate-100"
      role="form"
      aria-label="Deposit Form"
      aria-busy={loading}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-9 w-9 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center">
          <ArrowDownLeft size={20} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Deposit USDC</h3>
          <p className="text-xs text-slate-400">Mint shares in the NeuroWealth vault</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1 font-medium">
          <label htmlFor="deposit-amount-input">Amount (USDC)</label>
          <span>Available: {balance.toFixed(2)} USDC</span>
        </div>
        <div className="relative">
          <input
            id="deposit-amount-input"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Deposit Amount"
            aria-invalid={amount !== '' && !isPositive}
            aria-describedby={error ? 'deposit-error' : undefined}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-3 text-white font-mono text-base focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setAmount('100')}
            aria-label="Set deposit amount to 100"
            className="absolute right-2.5 top-2.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded"
          >
            DEFAULT
          </button>
        </div>
      </div>

      {/* Preview Section */}
      <div
        className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5 font-mono text-slate-300"
        role="region"
        aria-label="Deposit Preview"
      >
        <div className="flex justify-between">
          <span className="text-slate-400">Exchange Rate:</span>
          <span>{exchangeRate.toFixed(4)} USDC / Share</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Estimated Shares:</span>
          <span className="text-emerald-400">{estimatedShares} NV-SHARES</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Network Fee:</span>
          <span className="text-slate-400">&lt; 0.00001 XLM</span>
        </div>
      </div>

      {error && (
        <div id="deposit-error" role="alert" className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
          {error}
        </div>
      )}

      {successTx && (
        <div role="status" className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
          <CheckCircle2 size={16} />
          <span>Deposit Successful! Tx: {successTx.slice(0, 10)}...</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!isValid || loading}
        aria-label="Confirm Deposit"
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            <span>Processing Deposit...</span>
          </>
        ) : (
          <span>Confirm Deposit</span>
        )}
      </button>
    </form>
  );
};
