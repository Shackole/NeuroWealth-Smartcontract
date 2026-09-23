'use client';

import React, { useState, useCallback } from 'react';
import {
  X,
  ArrowUpRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Banknote,
} from 'lucide-react';
import { signWithFreighter } from '@/lib/freighter';

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPublicKey: string | null;
  /** Current USDC balance (display value) */
  balance: number;
  /** Current exchange rate: USDC per share */
  exchangeRate: number;
  /** Whether the vault is currently paused */
  isPaused?: boolean;
  /** Called on success so the dashboard can refresh balance immediately (optimistic update) */
  onSuccess?: (newBalance: number) => void;
}

type Step = 'input' | 'preview' | 'processing' | 'success' | 'error';

export const WithdrawalModal: React.FC<WithdrawalModalProps> = ({
  isOpen,
  onClose,
  userPublicKey,
  balance,
  exchangeRate,
  isPaused = false,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>('input');
  const [amount, setAmount] = useState<string>('');
  const [isWithdrawAll, setIsWithdrawAll] = useState(false);
  const [previewShares, setPreviewShares] = useState<number>(0);
  const [txHash, setTxHash] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen) return null;

  const numAmount = isWithdrawAll ? balance : parseFloat(amount) || 0;

  // preview_withdraw: shares burned = amount / exchangeRate (ceiling division)
  // ERC-4626 convention: shares burned round UP to protect the vault
  const estimatedSharesToBurn =
    exchangeRate > 0 ? Math.ceil((numAmount / exchangeRate) * 1e7) / 1e7 : 0;

  const isValidAmount = numAmount > 0 && numAmount <= balance;

  const handleWithdrawAll = () => {
    setIsWithdrawAll(true);
    setAmount(balance.toFixed(7));
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsWithdrawAll(false);
    setAmount(e.target.value);
  };

  /** Step 1 → 2: compute share preview then show confirmation screen */
  const handlePreview = useCallback(async () => {
    if (!isValidAmount) return;
    // In production: call vault.preview_withdraw(amount_in_stroops) via RPC simulation
    setPreviewShares(estimatedSharesToBurn);
    setStep('preview');
  }, [isValidAmount, estimatedSharesToBurn]);

  /** Step 2 → 3 → success/error: sign and submit */
  const handleConfirm = useCallback(async () => {
    if (!userPublicKey) return;

    setStep('processing');
    setErrorMsg('');

    try {
      // Build Soroban XDR for either withdraw(user, amount) or withdraw_all(user)
      const fnName = isWithdrawAll ? 'withdraw_all' : 'withdraw';
      const mockXdr = `AAAAAgAAAAD...SorobanVault.${fnName}(${userPublicKey.slice(0, 8)}...)...`;

      const signed = await signWithFreighter(mockXdr);
      if (!signed) throw new Error('Transaction signing was rejected.');

      // Simulate Stellar ledger confirmation (~3-5 s)
      await new Promise<void>((res) => setTimeout(res, 2500));

      const hash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;
      setTxHash(hash);

      // Optimistic dashboard update: reflect new balance immediately
      const newBalance = Math.max(0, balance - numAmount);
      onSuccess?.(newBalance);

      setStep('success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed. Please try again.';
      console.error('Withdrawal failed:', err);
      setErrorMsg(message);
      setStep('error');
    }
  }, [userPublicKey, isWithdrawAll, numAmount, balance, onSuccess]);

  const handleClose = () => {
    setStep('input');
    setAmount('');
    setIsWithdrawAll(false);
    setPreviewShares(0);
    setTxHash('');
    setErrorMsg('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Withdrawal dialog"
    >
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 relative border border-slate-700 shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Close button — hidden during processing to prevent accidental close */}
        {step !== 'processing' && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            aria-label="Close withdrawal dialog"
          >
            <X size={20} />
          </button>
        )}

        {/* ── VAULT PAUSED BANNER ── */}
        {isPaused && step === 'input' && (
          <div className="mb-4 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm">
            <ShieldAlert size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-300">Vault is temporarily paused</p>
              <p className="text-amber-200/70 text-xs mt-0.5">
                Withdrawals are disabled while the vault is paused. Please check back shortly or
                use the emergency withdrawal function if available.
              </p>
            </div>
          </div>
        )}

        {/* ── INPUT STEP ── */}
        {step === 'input' && (
          <>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-10 w-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                <ArrowUpRight size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Withdraw USDC</h3>
                <p className="text-xs text-slate-400">Burn shares &amp; receive USDC</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
                <span>Amount (USDC)</span>
                <span>Available: {balance.toFixed(2)} USDC</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={balance}
                  value={isWithdrawAll ? balance.toFixed(7) : amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  disabled={isPaused}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 px-4 text-white font-mono text-lg focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Withdrawal amount in USDC"
                />
                <button
                  type="button"
                  onClick={handleWithdrawAll}
                  disabled={isPaused || balance <= 0}
                  className="absolute right-3 top-3 text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded transition-colors disabled:opacity-40"
                  aria-label="Withdraw all funds"
                >
                  Withdraw All
                </button>
              </div>
              {isWithdrawAll && (
                <p className="mt-1 text-xs text-indigo-400">
                  withdraw_all() will be called — burns all your shares at once.
                </p>
              )}
            </div>

            {/* Preview panel */}
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-2 mb-6 font-mono text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Exchange Rate:</span>
                <span>{exchangeRate.toFixed(4)} USDC / Share</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Est. Shares Burned:</span>
                <span className="text-indigo-400">
                  {numAmount > 0 ? estimatedSharesToBurn.toFixed(4) : '—'} NV-SHARES
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">You Receive:</span>
                <span className="text-emerald-400">
                  {numAmount > 0 ? numAmount.toFixed(2) : '—'} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Network Fee:</span>
                <span className="text-slate-400">&lt; 0.00001 XLM</span>
              </div>
            </div>

            <button
              onClick={handlePreview}
              disabled={isPaused || !isValidAmount}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Banknote size={18} />
              <span>Preview Withdrawal</span>
            </button>
          </>
        )}

        {/* ── PREVIEW / CONFIRM STEP ── */}
        {step === 'preview' && (
          <>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-10 w-10 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirm Withdrawal</h3>
                <p className="text-xs text-slate-400">Review before signing with Freighter</p>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 mb-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Withdrawal Type:</span>
                <span className="text-white font-semibold">
                  {isWithdrawAll ? 'Full (withdraw_all)' : 'Partial (withdraw)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">USDC to Receive:</span>
                <span className="text-emerald-400 font-semibold font-mono">
                  {numAmount.toFixed(6)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Shares to Burn:</span>
                <span className="text-indigo-400 font-semibold font-mono">
                  {previewShares.toFixed(6)} NV-SHARES
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Remaining Balance:</span>
                <span className="text-white font-mono">
                  {Math.max(0, balance - numAmount).toFixed(6)} USDC
                </span>
              </div>
              <hr className="border-slate-700" />
              <div className="flex justify-between">
                <span className="text-slate-400">Contract Function:</span>
                <span className="text-slate-300 font-mono text-xs">
                  {isWithdrawAll
                    ? 'withdraw_all(user)'
                    : `withdraw(user, ${Math.round(numAmount * 1e7)})`}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold transition-all shadow-lg"
              >
                Sign &amp; Withdraw
              </button>
            </div>
          </>
        )}

        {/* ── PROCESSING STEP ── */}
        {step === 'processing' && (
          <div className="text-center py-10">
            <div className="h-16 w-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/30 animate-pulse">
              <Loader2 size={32} className="text-indigo-400 animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Processing Withdrawal</h3>
            <p className="text-sm text-slate-400">
              Signing transaction and waiting for Stellar ledger confirmation…
            </p>
            <p className="text-xs text-indigo-400 mt-3">~3-5 seconds on Stellar Network</p>
          </div>
        )}

        {/* ── SUCCESS STEP ── */}
        {step === 'success' && (
          <div className="text-center py-6">
            <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Withdrawal Successful!</h3>
            <p className="text-sm text-slate-400 mb-1">
              <span className="text-emerald-400 font-semibold">{numAmount.toFixed(2)} USDC</span>{' '}
              sent to your wallet
            </p>
            <p className="text-xs text-slate-500 mb-1 font-mono">
              {txHash.substring(0, 14)}…{txHash.substring(txHash.length - 10)}
            </p>
            <p className="text-xs text-emerald-400 bg-emerald-500/10 py-2 px-3 rounded-lg border border-emerald-500/20 mb-6">
              Confirmed in ~3.8 seconds on Stellar Network
            </p>
            <button
              onClick={handleClose}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        )}

        {/* ── ERROR STEP ── */}
        {step === 'error' && (
          <div className="text-center py-6">
            <div className="h-16 w-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
              <AlertTriangle size={36} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Withdrawal Failed</h3>
            <p className="text-sm text-red-300 mb-6 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">
              {errorMsg}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
