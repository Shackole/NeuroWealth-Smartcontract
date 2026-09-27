'use client';

import React, { useState } from 'react';
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { signWithFreighter } from '@/lib/freighter';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdraw';
  userPublicKey: string | null;
  balance: number;
  exchangeRate: number;
  strategy?: string;
}

/**
 * ActionModal - pre-signing confirmation modal (Issue #105)
 *
 * Flow:
 *   1. User fills in amount
 *   2. Modal shows full transaction summary + risk disclosure
 *   3. User must tick the acknowledgement checkbox
 *   4. Only after confirmation is Freighter popup opened
 */
export const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  type,
  userPublicKey,
  balance,
  exchangeRate,
  strategy = 'Balanced',
}) => {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [txSuccess, setTxSuccess] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  // Risk disclosure acknowledgement - Confirm button stays disabled until ticked
  const [riskAcknowledged, setRiskAcknowledged] = useState<boolean>(false);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  // Amounts are stored in stroops (7 decimals). Display value = stroops / 10_000_000
  const displayAmount = numAmount.toFixed(2);
  const estimatedShares = exchangeRate > 0 ? (numAmount / exchangeRate).toFixed(4) : '0.0000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublicKey || numAmount <= 0 || !riskAcknowledged) return;

    setLoading(true);
    setTxSuccess(false);

    try {
      // Build mock Soroban vault XDR, then open Freighter ONLY after user confirmed
      const mockXdr = 'AAAAAgAAAAD...SorobanVaultTx...';
      await signWithFreighter(mockXdr);

      // Simulate on-chain ledger confirmation (~3-5s on Stellar)
      await new Promise((res) => setTimeout(res, 2000));

      const hash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;
      setTxHash(hash);
      setTxSuccess(true);
    } catch (err) {
      console.error('Transaction execution failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setAmount('');
    setTxSuccess(false);
    setTxHash('');
    setRiskAcknowledged(false);
    onClose();
  };

  const isConfirmEnabled = numAmount > 0 && riskAcknowledged && !loading;

  return (
    /*
     * Overlay: full-screen on all sizes.
     * On mobile (< sm) the panel slides up from the bottom as a bottom sheet.
     * On sm+ it is centred as a dialog.
     */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${type === 'deposit' ? 'Deposit' : 'Withdraw'} confirmation`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md"
    >
      <div className="glass-panel w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 relative border border-slate-700 shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleResetAndClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <X size={20} />
        </button>

        {/* SUCCESS STATE */}
        {txSuccess ? (
          <div className="text-center py-6">
            <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {type === 'deposit' ? 'Deposit Successful!' : 'Withdrawal Successful!'}
            </h3>
            <p className="text-sm text-slate-400 mb-4 font-mono">
              Transaction Hash:{' '}
              {txHash.substring(0, 12)}...{txHash.substring(txHash.length - 8)}
            </p>
            <p className="text-xs text-emerald-400 bg-emerald-500/10 py-2 px-3 rounded-lg border border-emerald-500/20 mb-6">
              Confirmed in ~3.8 seconds on Stellar
            </p>
            <button
              onClick={handleResetAndClose}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          /* FORM + DISCLOSURE STATE */
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
              {type === 'deposit' ? (
                <div className="h-10 w-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
                  <ArrowDownLeft size={22} />
                </div>
              ) : (
                <div className="h-10 w-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                  <ArrowUpRight size={22} />
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-white capitalize">
                  {type} USDC
                </h3>
                <p className="text-xs text-slate-400">
                  {type === 'deposit'
                    ? 'Mint shares in Soroban vault'
                    : 'Burn shares & withdraw USDC'}
                </p>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
                <span>Amount (USDC)</span>
                <span>Available: {balance.toFixed(2)} USDC</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={type === 'withdraw' ? balance : 10000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  aria-label="Amount in USDC"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() =>
                    setAmount(type === 'withdraw' ? balance.toString() : '100')
                  }
                  className="absolute right-3 top-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Transaction Summary */}
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-2 mb-4 font-mono text-slate-300">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-sans font-semibold mb-1">
                Transaction Details
              </p>
              <div className="flex justify-between">
                <span className="text-slate-400">Action:</span>
                <span className="capitalize font-semibold text-white">{type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount:</span>
                <span className="text-white">{displayAmount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Strategy:</span>
                <span className="text-white">{strategy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">
                  {type === 'deposit' ? 'Shares to mint:' : 'Shares to burn:'}
                </span>
                <span className="text-emerald-400">{estimatedShares} NV-SHARES</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Exchange Rate:</span>
                <span>{exchangeRate.toFixed(4)} USDC / Share</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Network Fee:</span>
                <span className="text-slate-400">&lt; 0.00001 XLM</span>
              </div>
            </div>

            {/* Risk Disclosure */}
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 mb-4">
              <div className="flex items-start gap-2 mb-2">
                <ShieldAlert size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs font-semibold text-amber-300">Risk Disclosure</p>
              </div>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                Funds will be managed autonomously by the NeuroWealth AI agent
                across Stellar DeFi protocols. Smart contract interactions carry
                inherent risks including protocol bugs and market volatility.{' '}
                <strong className="text-amber-300">You can withdraw anytime</strong>{' '}
                with no lock-up period.
              </p>
            </div>

            {/* Acknowledgement checkbox - required before Confirm */}
            <label className="flex items-start gap-3 mb-5 cursor-pointer group">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(e) => setRiskAcknowledged(e.target.checked)}
                aria-label="I understand the risks and wish to proceed"
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-slate-300 group-hover:text-white transition-colors leading-relaxed">
                I understand the risks, and I wish to proceed with this {type}.
              </span>
            </label>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isConfirmEnabled}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-glow-emerald disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Signing with Freighter...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} />
                    <span>I understand, proceed</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
