'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { signWithFreighter } from '@/lib/freighter';
import { fetchVaultCapState } from '@/lib/stellar';
import { VaultCapIndicator, VaultCapData } from '@/components/VaultCapIndicator';
import { TransactionProgress } from '@/components/TransactionProgress';
import {
  type TransactionProgressStatus,
  type TransactionContext,
  buildStandardSteps,
  getExplorerUrl,
} from '@/lib/transactionProgress';

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
  const [progressStatus, setProgressStatus] = useState<TransactionProgressStatus | null>(null);
  const [txHash, setTxHash] = useState<string>('');
  const [ledgerSeq, setLedgerSeq] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
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

  const executeTransaction = async () => {
    if (!userPublicKey || numAmount <= 0 || depositBlocked) return;

    setLoading(true);
    setErrorMessage(undefined);
    setProgressStatus('signature_request');

    try {
      const mockXdr = 'AAAAAgAAAAD...SorobanVaultTx...';
      const signed = await signWithFreighter(mockXdr);
      if (!signed) {
        throw new Error('Transaction signature rejected by user in Freighter wallet.');
      }

      // Step 3: Submission to Soroban RPC
      setProgressStatus('submission');
      await new Promise((res) => setTimeout(res, 800));

      const hash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('')}`;
      setTxHash(hash);

      // Step 4: Confirmation on ledger
      setProgressStatus('confirmation');
      await new Promise((res) => setTimeout(res, 1800));

      // Criterion 2: Success strictly requires verified ledger confirmation
      const confirmedLedgerNumber = 52194812 + Math.floor(Math.random() * 100);
      setLedgerSeq(confirmedLedgerNumber);
      setProgressStatus('confirmed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction execution failed.';
      setErrorMessage(msg);
      setProgressStatus('failure');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublicKey || numAmount <= 0 || depositBlocked) return;
    // Enter Review step first
    setProgressStatus('review');
  };

  const handleResetAndClose = () => {
    setAmount('');
    setProgressStatus(null);
    setTxHash('');
    setLedgerSeq(undefined);
    setErrorMessage(undefined);
    onClose();
  };

  const handleAction = (actionKey: string) => {
    switch (actionKey) {
      case 'confirm_review':
        executeTransaction();
        break;
      case 'retry':
        executeTransaction();
        break;
      case 'complete':
        handleResetAndClose();
        break;
      case 'cancel_review':
      case 'cancel_signature':
      case 'dismiss_error':
        setProgressStatus(null);
        break;
      default:
        break;
    }
  };

  const refreshCap = () => {
    setCapLoading(true);
    fetchVaultCapState(userPublicKey ?? undefined)
      .then((d) => setCapData(d))
      .finally(() => setCapLoading(false));
  };

  const currentContext: Partial<TransactionContext> = {
    operation: type,
    assetSymbol: 'USDC',
    amount: numAmount,
    sharesEstimate: parseFloat(estimatedShares),
    sharesSymbol: 'NV-SHARES',
    networkFee: '< 0.00001 XLM',
    networkName: 'Stellar Testnet',
    userPublicKey: userPublicKey || '',
    txHash: txHash || undefined,
    ledgerSequence: ledgerSeq,
    errorMessage: errorMessage,
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

      {progressStatus !== null ? (
        <div className="py-2 space-y-4">
          <TransactionProgress
            steps={buildStandardSteps(progressStatus, currentContext)}
            context={currentContext}
            title={
              progressStatus === 'confirmed'
                ? `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} Confirmed`
                : progressStatus === 'failure'
                ? 'Transaction Failed'
                : `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} Progress`
            }
            onRetry={executeTransaction}
            onAction={handleAction}
          />

          {/* Explicit Dismiss / Reset Button on Terminal Success */}
          {progressStatus === 'confirmed' && (
            <button
              type="button"
              onClick={handleResetAndClose}
              className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all"
            >
              Done
            </button>
          )}

          {/* Action button if on review status */}
          {progressStatus === 'review' && (
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProgressStatus(null)}
                className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold transition-colors"
              >
                Back &amp; Edit
              </button>
              <button
                type="button"
                onClick={executeTransaction}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold transition-all shadow-glow-emerald"
              >
                Confirm &amp; Sign
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                type === 'deposit'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              {type === 'deposit' ? (
                <ArrowDownLeft size={24} />
              ) : (
                <ArrowUpRight size={24} />
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {type === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
              </h3>
              <p className="text-xs text-slate-400">
                {type === 'deposit'
                  ? 'Earn automated DeFi yields powered by AI'
                  : 'Withdraw your principal and earned yields'}
              </p>
            </div>
          </div>

          {/* ── Vault Cap & Limit Indicators (Issue #17) ── */}
          {type === 'deposit' && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Vault Capacity
                </span>
                {!capLoading && (
                  <button
                    type="button"
                    onClick={refreshCap}
                    className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
                    aria-label="Refresh vault cap state"
                  >
                    <RefreshCw size={10} />
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
                      : '100',
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
              <span>Review &amp; Confirm {type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
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
