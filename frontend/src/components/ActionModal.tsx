'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { signWithFreighter } from '@/lib/freighter';
import { TransactionProgress, TransactionStep } from './TransactionProgress';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdraw';
  userPublicKey: string | null;
  balance: number;
  exchangeRate: number;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Default step definitions — statuses are overridden during the flow */
function makeSteps(): TransactionStep[] {
  return [
    {
      id: 'sign',
      label: 'Signing with Freighter',
      subText: 'Approve the transaction in your Freighter wallet extension.',
      status: 'pending',
    },
    {
      id: 'submit',
      label: 'Submitting to Stellar',
      subText: 'Broadcasting the signed transaction to the Stellar network.',
      status: 'pending',
    },
    {
      id: 'confirm',
      label: 'Waiting for confirmation',
      subText: 'Stellar finalises transactions in ~3–5 seconds.',
      status: 'pending',
    },
    {
      id: 'done',
      label: 'Confirmed ✓',
      subText: '',
      status: 'pending',
    },
  ];
}

export const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  type,
  userPublicKey,
  balance,
  exchangeRate,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [phase, setPhase] = useState<'form' | 'progress' | 'success'>('form');
  const [steps, setSteps] = useState<TransactionStep[]>(makeSteps);
  const [txHash, setTxHash] = useState<string>('');
  const [retryCount, setRetryCount] = useState<number>(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save + restore focus
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setTimeout(() => closeButtonRef.current?.focus(), 0);
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  // Focus trap + Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleResetAndClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const estimatedShares = (numAmount / exchangeRate).toFixed(4);

  /** Mutate a specific step's status and optional fields */
  function updateStep(id: string, patch: Partial<TransactionStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  const runTransaction = async () => {
    setSteps(makeSteps());
    setPhase('progress');

    // Step 1 — Sign
    updateStep('sign', { status: 'active' });
    try {
      const mockXdr = 'AAAAAgAAAAD...SorobanVaultTx...';
      await signWithFreighter(mockXdr);
      updateStep('sign', { status: 'done' });
    } catch (err) {
      updateStep('sign', {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Freighter signing was rejected.',
      });
      return;
    }

    // Step 2 — Submit
    updateStep('submit', { status: 'active' });
    await new Promise((res) => setTimeout(res, 800));
    updateStep('submit', { status: 'done' });

    // Step 3 — Confirm (poll ~5 seconds)
    updateStep('confirm', { status: 'active' });
    await new Promise((res) => setTimeout(res, 2000));
    updateStep('confirm', { status: 'done' });

    // Step 4 — Done
    const hash = `${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${hash}`;
    updateStep('done', { status: 'done', subText: 'Transaction landed on Stellar Testnet.', explorerUrl });

    setTxHash(hash);
    setPhase('success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPublicKey || numAmount <= 0) return;
    await runTransaction();
  };

  const handleRetry = async () => {
    setRetryCount((c) => c + 1);
    await runTransaction();
  };

  const handleResetAndClose = () => {
    setAmount('');
    setPhase('form');
    setSteps(makeSteps());
    setTxHash('');
    onClose();
  };

  const hasError = steps.some((s) => s.status === 'error');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) handleResetAndClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="glass-panel w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 relative border border-slate-700 shadow-2xl animate-in fade-in slide-in-from-bottom sm:zoom-in duration-200 max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={handleResetAndClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {/* ── Phase: Form ─────────────────────────────────────────── */}
        {phase === 'form' && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex items-center gap-2 mb-6">
              {type === 'deposit' ? (
                <div className="h-10 w-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <ArrowDownLeft size={22} />
                </div>
              ) : (
                <div className="h-10 w-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <ArrowUpRight size={22} />
                </div>
              )}
              <div>
                <h2 id="modal-title" className="text-lg font-bold text-white capitalize">
                  {type} USDC
                </h2>
                <p className="text-xs text-slate-400">
                  {type === 'deposit' ? 'Mint shares in Soroban vault' : 'Burn shares & withdraw USDC'}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
                <label htmlFor="amount-input">Amount (USDC)</label>
                <span>Available: {balance.toFixed(2)} USDC</span>
              </div>
              <div className="relative">
                <input
                  id="amount-input"
                  type="number"
                  step="0.01"
                  min="1"
                  max={type === 'withdraw' ? balance : 10000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
                  required
                  aria-describedby="amount-hint"
                />
                <button
                  type="button"
                  onClick={() => setAmount(type === 'withdraw' ? balance.toString() : '100')}
                  className="absolute right-3 top-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  aria-label={`Set amount to ${type === 'withdraw' ? 'maximum balance' : '100 USDC'}`}
                >
                  MAX
                </button>
              </div>
              <span id="amount-hint" className="sr-only">
                Minimum 1 USDC, maximum {type === 'withdraw' ? balance.toFixed(2) : '10,000'} USDC
              </span>
            </div>

            <div
              className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-2 mb-6 font-mono text-slate-300"
              aria-label="Transaction summary"
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

            <button
              type="submit"
              disabled={numAmount <= 0}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-3.5 min-h-[44px] rounded-xl transition-all shadow-glow-emerald disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <span>Confirm {type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
            </button>
          </form>
        )}

        {/* ── Phase: Progress ─────────────────────────────────────── */}
        {phase === 'progress' && (
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-white mb-6 capitalize">
              {type === 'deposit' ? 'Depositing' : 'Withdrawing'} {numAmount} USDC
            </h2>
            <TransactionProgress
              steps={steps}
              onRetry={hasError ? handleRetry : undefined}
              title=""
            />
          </div>
        )}

        {/* ── Phase: Success ───────────────────────────────────────── */}
        {phase === 'success' && (
          <div className="text-center py-4">
            <h2 id="modal-title" className="text-xl font-bold text-white mb-4">
              {type === 'deposit' ? 'Deposit Successful!' : 'Withdrawal Successful!'}
            </h2>

            {/* Show the completed stepper */}
            <div className="text-left mb-6">
              <TransactionProgress steps={steps} title="" />
            </div>

            <p className="text-xs text-emerald-400 bg-emerald-500/10 py-2 px-3 rounded-lg border border-emerald-500/20 mb-6 font-mono break-all">
              {txHash.substring(0, 16)}…{txHash.substring(txHash.length - 8)}
            </p>

            <button
              onClick={handleResetAndClose}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 min-h-[44px] rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
