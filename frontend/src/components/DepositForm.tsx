'use client';

/**
 * DepositForm.tsx
 *
 * Full deposit flow component:
 *   1. Amount input with Zod validation (min 1 USDC, max 10,000 USDC)
 *   2. Max button that prefills the user's USDC wallet balance
 *   3. Strategy selector defaulting to Balanced
 *   4. Transaction preview modal (calls preview_deposit_to_shares RPC)
 *   5. Signing progress with spinner
 *   6. Success state with Stellar explorer link
 *   7. Failure state with human-readable error messages
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  X,
  ArrowDownLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Flame,
  ExternalLink,
  Info,
  type LucideIcon,
} from 'lucide-react';

import {
  depositSchema,
  type DepositFormValues,
  STRATEGY_OPTIONS,
  type Strategy,
} from '@/lib/depositSchema';
import {
  fetchUsdcWalletBalance,
  previewDepositToShares,
  executeDeposit,
  humanizeError,
  explorerUrl,
  fromRawUnits,
} from '@/lib/vaultHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DepositFormProps {
  isOpen: boolean;
  onClose: () => void;
  userPublicKey: string;
  /** Called on successful deposit so the parent can refresh balances */
  onDepositSuccess?: () => void;
}

// ─── Strategy meta ────────────────────────────────────────────────────────────

const STRATEGY_META: Record<
  Strategy,
  { icon: LucideIcon; color: string; bg: string; border: string; label: string; desc: string; apy: string }
> = {
  Conservative: {
    icon: ShieldCheck,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    label: 'Conservative',
    desc: 'Blend stablecoin lending',
    apy: '3–6%',
  },
  Balanced: {
    icon: Zap,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    label: 'Balanced',
    desc: 'Lending + DEX liquidity mix',
    apy: '6–10%',
  },
  Growth: {
    icon: Flame,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    label: 'Growth',
    desc: 'Multi-protocol DEX deployment',
    apy: '10–15%',
  },
};

// ─── Preview Modal ────────────────────────────────────────────────────────────

interface PreviewModalProps {
  amount: number;
  strategy: Strategy;
  estimatedShares: number | null;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSigning: boolean;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  amount,
  strategy,
  estimatedShares,
  isLoading,
  onConfirm,
  onCancel,
  isSigning,
}) => {
  const meta = STRATEGY_META[strategy];
  const Icon: LucideIcon = meta.icon;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between mb-5">
          <h3 id="preview-modal-title" className="text-base font-bold text-white">
            Transaction Preview
          </h3>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Cancel preview"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary rows */}
        <div className="space-y-3 mb-5 text-sm font-mono">
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-slate-400">Depositing</span>
            <span className="font-semibold text-white">{amount.toLocaleString()} USDC</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-slate-400">Strategy</span>
            <span className={`flex items-center gap-1.5 font-semibold ${meta.color}`}>
              <Icon size={13} />
              {meta.label}
              <span className="text-slate-400 font-normal">({meta.apy} APY)</span>
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-800 pt-3">
            <span className="text-slate-400 flex items-center gap-1">
              Estimated Shares
              <Info size={12} className="text-slate-500" aria-label="Calculated via preview_deposit_to_shares RPC" />
            </span>
            {isLoading ? (
              <span className="flex items-center gap-1.5 text-slate-400">
                <Loader2 size={13} className="animate-spin" />
                Calculating…
              </span>
            ) : estimatedShares !== null ? (
              <span className="text-emerald-400 font-semibold">
                {estimatedShares.toFixed(4)} NV-SHARES
              </span>
            ) : (
              <span className="text-slate-500 text-xs italic">Preview unavailable</span>
            )}
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-slate-400">Network Fee</span>
            <span className="text-slate-400">&lt; 0.00001 XLM</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 mb-5 leading-relaxed">
          Two transactions will be signed: (1) set your strategy preference, (2) deposit USDC.
          Both require approval in your Freighter wallet.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSigning}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSigning}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm transition-all shadow-glow-emerald disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSigning ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Signing…
              </>
            ) : (
              'Confirm & Sign'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Success State ────────────────────────────────────────────────────────────

interface SuccessStateProps {
  depositHash: string;
  strategyHash?: string;
  amount: number;
  strategy: Strategy;
  onClose: () => void;
}

const SuccessState: React.FC<SuccessStateProps> = ({
  depositHash,
  amount,
  strategy,
  onClose,
}) => {
  const meta = STRATEGY_META[strategy];
  const Icon: LucideIcon = meta.icon;

  return (
    <div className="text-center py-4" role="status" aria-live="polite">
      <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
        <CheckCircle2 size={36} aria-hidden="true" />
      </div>

      <h3 className="text-xl font-bold text-white mb-1">Deposit Successful!</h3>
      <p className="text-sm text-slate-400 mb-4">
        {amount.toLocaleString()} USDC deposited into the{' '}
        <span className={`font-semibold ${meta.color}`}>
          <Icon size={12} className="inline -mt-0.5 mr-0.5" />
          {meta.label}
        </span>{' '}
        strategy
      </p>

      {/* Transaction link */}
      <a
        href={explorerUrl(depositHash)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20 mb-2 transition-colors font-mono"
        aria-label="View deposit transaction on Stellar Expert explorer"
      >
        <ExternalLink size={12} aria-hidden="true" />
        View on Stellar Explorer
        <span className="text-slate-500 ml-1">
          {depositHash.slice(0, 8)}…{depositHash.slice(-6)}
        </span>
      </a>

      <p className="text-xs text-emerald-400 bg-emerald-500/10 py-2 px-3 rounded-lg border border-emerald-500/20 mb-6 mt-3">
        Confirmed on Stellar Testnet · ~3–5 second finality
      </p>

      <button
        onClick={onClose}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all"
      >
        Done
      </button>
    </div>
  );
};

// ─── Error State ──────────────────────────────────────────────────────────────

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, onClose }) => (
  <div className="text-center py-4" role="alert" aria-live="assertive">
    <div className="h-16 w-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
      <AlertTriangle size={36} aria-hidden="true" />
    </div>
    <h3 className="text-xl font-bold text-white mb-2">Transaction Failed</h3>
    <p className="text-sm text-slate-300 bg-slate-900/80 rounded-xl border border-slate-700 p-3 mb-6 text-left leading-relaxed">
      {message}
    </p>
    <div className="flex gap-3">
      <button
        onClick={onClose}
        className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors font-medium"
      >
        Close
      </button>
      <button
        onClick={onRetry}
        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold transition-all"
      >
        Try Again
      </button>
    </div>
  </div>
);

// ─── Signing Progress ─────────────────────────────────────────────────────────

const SIGNING_STEPS = [
  'Fetching account state…',
  'Simulating strategy transaction…',
  'Awaiting Freighter approval (1/2)…',
  'Broadcasting strategy update…',
  'Simulating deposit transaction…',
  'Awaiting Freighter approval (2/2)…',
  'Broadcasting deposit…',
  'Confirming on-chain…',
];

interface SigningProgressProps {
  step: number;
}

const SigningProgress: React.FC<SigningProgressProps> = ({ step }) => (
  <div className="py-6 text-center" aria-live="polite" aria-label="Transaction in progress">
    <div className="h-16 w-16 flex items-center justify-center mx-auto mb-5 relative">
      <div className="absolute inset-0 rounded-full bg-emerald-500/10 border border-emerald-500/30 animate-pulse" />
      <Loader2 size={32} className="text-emerald-400 animate-spin" aria-hidden="true" />
    </div>
    <h3 className="text-lg font-bold text-white mb-2">Processing Transaction</h3>
    <p className="text-sm text-slate-400 mb-6">
      {SIGNING_STEPS[Math.min(step, SIGNING_STEPS.length - 1)]}
    </p>
    {/* Progress bar */}
    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
        style={{ width: `${((step + 1) / SIGNING_STEPS.length) * 100}%` }}
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={SIGNING_STEPS.length}
      />
    </div>
    <p className="text-xs text-slate-500 mt-3">
      Do not close this window. Stellar confirms in ~3–5 seconds.
    </p>
  </div>
);

// ─── Main DepositForm ─────────────────────────────────────────────────────────

type FormView = 'form' | 'signing' | 'success' | 'error';

export const DepositForm: React.FC<DepositFormProps> = ({
  isOpen,
  onClose,
  userPublicKey,
  onDepositSuccess,
}) => {
  // Form
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: '', strategy: 'Balanced' },
    mode: 'onChange',
  });

  const watchedAmount = watch('amount');
  const watchedStrategy = watch('strategy');

  // UI state
  const [view, setView] = useState<FormView>('form');
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [estimatedShares, setEstimatedShares] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [signingStep, setSigningStep] = useState<number>(0);
  const [depositResult, setDepositResult] = useState<{ depositHash: string; strategyHash?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // ── Load USDC balance when modal opens ───────────────────────────────────
  useEffect(() => {
    if (!isOpen || !userPublicKey) return;
    let cancelled = false;

    setBalanceLoading(true);
    fetchUsdcWalletBalance(userPublicKey)
      .then((bal) => {
        if (!cancelled) setUsdcBalance(bal);
      })
      .catch(() => {
        if (!cancelled) setUsdcBalance(0);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, userPublicKey]);

  // ── Fetch preview shares when amount changes ─────────────────────────────
  const fetchPreview = useCallback(
    async (amount: string) => {
      const num = parseFloat(amount);
      if (!num || num <= 0 || !userPublicKey) {
        setEstimatedShares(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const shares = await previewDepositToShares(userPublicKey, num);
        setEstimatedShares(shares);
      } catch {
        setEstimatedShares(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [userPublicKey],
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchPreview(watchedAmount), 600);
    return () => clearTimeout(timer);
  }, [watchedAmount, fetchPreview]);

  // ── Max button ────────────────────────────────────────────────────────────
  const handleMax = () => {
    const maxAllowed = Math.min(usdcBalance, 10_000);
    setValue('amount', maxAllowed > 0 ? maxAllowed.toFixed(2) : '', {
      shouldValidate: true,
    });
  };

  // ── Open preview ──────────────────────────────────────────────────────────
  const onSubmit = () => {
    setShowPreview(true);
  };

  // ── Execute deposit ───────────────────────────────────────────────────────
  const handleConfirmDeposit = async () => {
    setShowPreview(false);
    setView('signing');
    setSigningStep(0);

    const amount = parseFloat(watchedAmount);
    const strategy = watchedStrategy;

    try {
      // Simulate progress steps during signing
      const progressInterval = setInterval(() => {
        setSigningStep((s) => Math.min(s + 1, SIGNING_STEPS.length - 2));
      }, 2500);

      const result = await executeDeposit(userPublicKey, amount, strategy);

      clearInterval(progressInterval);
      setSigningStep(SIGNING_STEPS.length - 1);

      // Brief pause so the last step message is visible
      await new Promise((r) => setTimeout(r, 400));

      setDepositResult(result);
      setView('success');
      onDepositSuccess?.();
    } catch (err) {
      setErrorMessage(humanizeError(err));
      setView('error');
    }
  };

  // ── Reset and close ───────────────────────────────────────────────────────
  const handleClose = () => {
    reset();
    setView('form');
    setShowPreview(false);
    setEstimatedShares(null);
    setDepositResult(null);
    setErrorMessage('');
    setSigningStep(0);
    onClose();
  };

  const handleRetry = () => {
    setView('form');
    setErrorMessage('');
    setSigningStep(0);
  };

  if (!isOpen) return null;

  const numAmount = parseFloat(watchedAmount) || 0;
  const strategyMeta = STRATEGY_META[watchedStrategy];
  const StrategyIcon = strategyMeta.icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        onClick={view === 'form' ? handleClose : undefined}
        aria-hidden={view !== 'form'}
      >
        <div
          className="glass-panel w-full max-w-md rounded-2xl p-6 relative border border-slate-700 shadow-2xl animate-in fade-in zoom-in duration-200"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deposit-modal-title"
        >
          {/* Close button — visible except during signing */}
          {view !== 'signing' && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close deposit form"
            >
              <X size={20} />
            </button>
          )}

          {/* ── Form view ─────────────────────────────────────────────────── */}
          {view === 'form' && (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ArrowDownLeft size={22} aria-hidden="true" />
                </div>
                <div>
                  <h3 id="deposit-modal-title" className="text-lg font-bold text-white">
                    Deposit USDC
                  </h3>
                  <p className="text-xs text-slate-400">Mint vault shares on Soroban</p>
                </div>
              </div>

              {/* Amount input */}
              <div className="mb-4">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5 font-medium">
                  <label htmlFor="deposit-amount" className="font-semibold text-slate-300">
                    Amount (USDC)
                  </label>
                  <span className="flex items-center gap-1">
                    {balanceLoading ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <>
                        Wallet:{' '}
                        <button
                          type="button"
                          onClick={handleMax}
                          className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
                          aria-label={`Set maximum amount: ${usdcBalance.toFixed(2)} USDC`}
                        >
                          {usdcBalance.toFixed(2)} USDC
                        </button>
                      </>
                    )}
                  </span>
                </div>

                <div className="relative">
                  <input
                    id="deposit-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    max="10000"
                    placeholder="0.00"
                    className={`w-full bg-slate-900 border rounded-xl py-3 px-4 pr-20 text-white font-mono text-lg focus:outline-none transition-colors ${
                      errors.amount
                        ? 'border-red-500 focus:border-red-400'
                        : 'border-slate-700 focus:border-emerald-500'
                    }`}
                    aria-describedby={errors.amount ? 'amount-error' : undefined}
                    aria-invalid={!!errors.amount}
                    {...register('amount')}
                  />
                  <button
                    type="button"
                    onClick={handleMax}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors border border-emerald-500/20"
                    aria-label="Fill maximum USDC balance"
                  >
                    MAX
                  </button>
                </div>

                {errors.amount && (
                  <p
                    id="amount-error"
                    className="mt-1.5 text-xs text-red-400 flex items-center gap-1"
                    role="alert"
                  >
                    <AlertTriangle size={12} aria-hidden="true" />
                    {errors.amount.message}
                  </p>
                )}
              </div>

              {/* Strategy selector */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Strategy
                </label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Investment strategy">
                  <Controller
                    name="strategy"
                    control={control}
                    render={({ field }) =>
                      (STRATEGY_OPTIONS as readonly Strategy[]).map((st) => {
                        const meta = STRATEGY_META[st];
                        const Icon = meta.icon;
                        const isSelected = field.value === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => field.onChange(st)}
                            className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border transition-all text-center ${
                              isSelected
                                ? `${meta.bg} ${meta.border} ${meta.color} shadow-sm`
                                : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                            }`}
                          >
                            <Icon size={16} aria-hidden="true" />
                            <span className="text-xs font-semibold">{meta.label}</span>
                            <span className="text-[10px] opacity-70">{meta.apy} APY</span>
                          </button>
                        );
                      }) as unknown as React.ReactElement
                    }
                  />
                </div>
                {/* Strategy description */}
                <p className={`mt-2 text-xs ${strategyMeta.color} flex items-center gap-1.5`}>
                  <StrategyIcon size={12} aria-hidden="true" />
                  {strategyMeta.desc}
                </p>
              </div>

              {/* Preview info */}
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-2 mb-5 font-mono text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Estimated Shares</span>
                  <span className="text-emerald-400">
                    {previewLoading ? (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Loader2 size={11} className="animate-spin" />
                        Loading…
                      </span>
                    ) : estimatedShares !== null && numAmount > 0 ? (
                      `${estimatedShares.toFixed(4)} NV-SHARES`
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Network Fee</span>
                  <span className="text-slate-400">&lt; 0.00001 XLM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transactions</span>
                  <span className="text-slate-300">2 (strategy + deposit)</span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!isValid || numAmount <= 0}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-glow-emerald disabled:opacity-40 disabled:cursor-not-allowed"
                aria-disabled={!isValid || numAmount <= 0}
              >
                <ArrowDownLeft size={18} aria-hidden="true" />
                Preview Deposit
                {numAmount > 0 && isValid && (
                  <span className="text-slate-800 font-normal text-sm">
                    ({numAmount.toLocaleString()} USDC)
                  </span>
                )}
              </button>
            </form>
          )}

          {/* ── Signing progress ──────────────────────────────────────────── */}
          {view === 'signing' && <SigningProgress step={signingStep} />}

          {/* ── Success state ─────────────────────────────────────────────── */}
          {view === 'success' && depositResult && (
            <SuccessState
              depositHash={depositResult.depositHash}
              strategyHash={depositResult.strategyHash}
              amount={numAmount}
              strategy={watchedStrategy}
              onClose={handleClose}
            />
          )}

          {/* ── Error state ───────────────────────────────────────────────── */}
          {view === 'error' && (
            <ErrorState
              message={errorMessage}
              onRetry={handleRetry}
              onClose={handleClose}
            />
          )}
        </div>
      </div>

      {/* Preview modal (layered on top of the main modal) */}
      {showPreview && (
        <PreviewModal
          amount={numAmount}
          strategy={watchedStrategy}
          estimatedShares={estimatedShares}
          isLoading={previewLoading}
          onConfirm={handleConfirmDeposit}
          onCancel={() => setShowPreview(false)}
          isSigning={view === 'signing'}
        />
      )}
    </>
  );
};
