'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { signWithFreighter } from '@/lib/freighter';
import { fetchVaultCapState } from '@/lib/stellar';
import { VaultCapIndicator, VaultCapData } from '@/components/VaultCapIndicator';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdraw';
  userPublicKey: string | null;
  balance: number;
  exchangeRate: number;
  /**
   * When true, renders the form inline without its own backdrop/overlay.
   * Used when the parent (e.g. BottomSheet) already provides the overlay.
   */
  embedded?: boolean;
}

export const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  type,
  userPublicKey,
  balance,
  exchangeRate,
  embedded = false,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [txSuccess, setTxSuccess] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [capData, setCapData] = useState<VaultCapData | null>(null);
  const [capLoading, setCapLoading] = useState<boolean>(false);

  // Refresh cap data each time the deposit modal is opened
  useEffect(() => {
    if (isOpen && type === 'deposit') {
      setCapLoading(true);
      fetchVaultCapState(userPublicKey ?? undefined)
        .then((data) => setCapData(data))
        .finally(() => setCapLoading(false));
    }
  }, [isOpen, type, userPublicKey]);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const estimatedShares = (numAmount / exchangeRate).toFixed(4);

  // Deposit is disabled if TVL cap is reached or user personal cap is reached
  const tvlFull = capData ? capData.totalDeposits >= capData.tvlCap : false;
  const userFull = capData ? capData.userDeposits >= capData.userDepositCap : false;
  const depositBlocked = type === 'deposit' && (tvlFull || userFull);

  // Cap remaining for this user
  const userRemaining = capData
    ? Math.max(capData.userDepositCap - capData.userDeposits, 0)
    : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublicKey || numAmount <= 0 || depositBlocked) return;

    setLoading(true);
    setTxSuccess(false);

    try {
      const mockXdr = 'AAAAAgAAAAD...SorobanVaultTx...';
      await signWithFreighter(mockXdr);
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
    onClose();
  };

  const refreshCap = () => {
    setCapLoading(true);
    fetchVaultCapState(userPublicKey ?? undefined)
      .then((d) => setCapData(d))
      .finally(() => setCapLoading(false));
  };

  // ── Inner form content ────────────────────────────────────────────────────
  const inner = (
    <>
      {!embedded && (
        <button
          onClick={handleResetAndClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>
      )}

      {txSuccess ? (
        <div className="text-center py-6">
          <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
            <CheckCircle2 size={36} />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {type === 'deposit' ? 'Deposit Successful!' : 'Withdrawal Successful!'}
          </h3>
          <p className="text-sm text-slate-400 mb-4 font-mono">
            Transaction Hash: {txHash.substring(0, 12)}...{txHash.substring(txHash.length - 8)}
          </p>
          <p className="text-xs text-emerald-400 bg-emerald-500/10 py-2 px-3 rounded-lg border border-emerald-500/20 mb-6">
            Confirmed in ~3.8 seconds on Stellar Devnet
          </p>
          <button
            onClick={handleResetAndClose}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
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
              <h3 className="text-lg font-bold text-white capitalize">{type} USDC</h3>
              <p className="text-xs text-slate-400">
                {type === 'deposit'
                  ? 'Mint shares in Soroban vault'
                  : 'Burn shares & withdraw USDC'}
              </p>
            </div>
          </div>

          {/* Vault Cap Indicators — deposit only */}
          {type === 'deposit' && (
            <div className="mb-5 bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                <span className="font-semibold uppercase tracking-wider">Vault Capacity</span>
                {capLoading ? (
                  <RefreshCw size={12} className="animate-spin text-slate-500" />
                ) : (
                  <button
                    type="button"
                    onClick={refreshCap}
                    className="flex items-center gap-1 hover:text-emerald-400 transition-colors"
                    aria-label="Refresh cap data"
                  >
                    <RefreshCw size={11} />
                    Refresh
                  </button>
                )}
              </div>
              {capLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 size={13} className="animate-spin" />
                  Loading vault capacity...
                </div>
              ) : capData ? (
                <VaultCapIndicator capData={capData} />
              ) : null}
            </div>
          )}

          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
              <span>Amount (USDC)</span>
              <span>
                {type === 'deposit' && userRemaining !== undefined
                  ? `Cap remaining: ${userRemaining.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`
                  : `Available: ${balance.toFixed(2)} USDC`}
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="1"
                max={
                  type === 'withdraw'
                    ? balance
                    : userRemaining !== undefined
                    ? userRemaining
                    : 10000
                }
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={depositBlocked}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                required
              />
              <button
                type="button"
                onClick={() =>
                  setAmount(
                    type === 'withdraw'
                      ? balance.toString()
                      : userRemaining !== undefined
                      ? String(Math.min(userRemaining, 100))
                      : '100'
                  )
                }
                disabled={depositBlocked}
                className="absolute right-3 top-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              >
                MAX
              </button>
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-2 mb-6 font-mono text-slate-300">
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

          <button
            type="submit"
            disabled={loading || numAmount <= 0 || depositBlocked}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-glow-emerald disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Signing with Freighter...</span>
              </>
            ) : depositBlocked ? (
              <span>Deposits Unavailable</span>
            ) : (
              <span>Confirm {type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
            )}
          </button>
        </form>
      )}
    </>
  );

  // ── Embedded mode: just render the form (BottomSheet provides the shell) ──
  if (embedded) {
    return <div className="pb-2">{inner}</div>;
  }

  // ── Modal mode: full-screen overlay ───────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={type === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
    >
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 relative border border-slate-700 shadow-2xl animate-in fade-in zoom-in duration-200">
        {inner}
      </div>
    </div>
  );
};
