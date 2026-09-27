'use client';

import React, { useState } from 'react';
import { ArrowUpRight, Loader2, CheckCircle2 } from 'lucide-react';
import { withdrawFromVault, withdrawAllFromVault } from '@/lib/contract';

export interface WithdrawFormProps {
  userPublicKey: string | null;
  balance?: number;
  exchangeRate?: number;
  onSuccess?: (txHash: string) => void;
}

export const WithdrawForm: React.FC<WithdrawFormProps> = ({
  userPublicKey,
  balance = 1000,
  exchangeRate = 1.042,
  onSuccess
}) => {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionType, setActionType] = useState<'withdraw' | 'withdraw_all' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<string | null>(null);

  const numAmount = parseFloat(amount);
  const isPositive = !isNaN(numAmount) && numAmount > 0;
  const isWithinBalance = isPositive && numAmount <= balance;
  const canWithdrawPartial = isWithinBalance && !!userPublicKey;
  const canWithdrawAll = balance > 0 && !!userPublicKey;

  const estimatedSharesBurned = isPositive ? (numAmount / exchangeRate).toFixed(4) : '0.0000';

  const handleWithdrawPartial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWithdrawPartial) return;

    setLoading(true);
    setActionType('withdraw');
    setError(null);

    try {
      const res = await withdrawFromVault(userPublicKey!, numAmount);
      if (res.success && res.txHash) {
        setSuccessTx(res.txHash);
        if (onSuccess) onSuccess(res.txHash);
      }
    } catch (err: any) {
      setError(err?.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  const handleWithdrawAll = async () => {
    if (!canWithdrawAll) return;

    setLoading(true);
    setActionType('withdraw_all');
    setError(null);

    try {
      const res = await withdrawAllFromVault(userPublicKey!);
      if (res.success && res.txHash) {
        setSuccessTx(res.txHash);
        if (onSuccess) onSuccess(res.txHash);
      }
    } catch (err: any) {
      setError(err?.message || 'Withdraw All failed');
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  return (
    <form
      onSubmit={handleWithdrawPartial}
      className="space-y-4 text-slate-100"
      role="form"
      aria-label="Withdraw Form"
      aria-busy={loading}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-9 w-9 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center">
          <ArrowUpRight size={20} aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Withdraw USDC</h3>
          <p className="text-xs text-slate-400">Burn shares and withdraw USDC to wallet</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1 font-medium">
          <label htmlFor="withdraw-amount-input">Amount (USDC)</label>
          <span>Available: {balance.toFixed(2)} USDC</span>
        </div>
        <div className="relative">
          <input
            id="withdraw-amount-input"
            type="number"
            step="0.01"
            min="0.01"
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Withdraw Amount"
            aria-invalid={amount !== '' && !isWithinBalance}
            aria-describedby={error ? 'withdraw-error' : undefined}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 px-3 text-white font-mono text-base focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setAmount(balance.toString())}
            aria-label="Set maximum withdraw amount"
            className="absolute right-2.5 top-2.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Preview Section */}
      <div
        className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5 font-mono text-slate-300"
        role="region"
        aria-label="Withdraw Preview"
      >
        <div className="flex justify-between">
          <span className="text-slate-400">Exchange Rate:</span>
          <span>{exchangeRate.toFixed(4)} USDC / Share</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Estimated Shares Burned:</span>
          <span className="text-indigo-400">{estimatedSharesBurned} NV-SHARES</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Network Fee:</span>
          <span className="text-slate-400">&lt; 0.00001 XLM</span>
        </div>
      </div>

      {error && (
        <div id="withdraw-error" role="alert" className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
          {error}
        </div>
      )}

      {successTx && (
        <div role="status" className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
          <CheckCircle2 size={16} />
          <span>Withdrawal Successful! Tx: {successTx.slice(0, 10)}...</span>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleWithdrawAll}
          disabled={!canWithdrawAll || loading}
          aria-label="Withdraw All"
          className="flex-1 py-3 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading && actionType === 'withdraw_all' ? (
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          ) : null}
          <span>Withdraw All</span>
        </button>

        <button
          type="submit"
          disabled={!canWithdrawPartial || loading}
          aria-label="Confirm Withdraw"
          className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading && actionType === 'withdraw' ? (
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          ) : null}
          <span>Withdraw</span>
        </button>
      </div>
    </form>
  );
};
