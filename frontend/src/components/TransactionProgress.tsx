'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  FileText,
  Key,
  Send,
} from 'lucide-react';
import type {
  TransactionProgressStatus,
  TransactionContext,
  TransactionAction,
} from '@/lib/transactionProgress';

export type StepStatus =
  | 'pending'
  | 'active'
  | 'done'
  | 'error'
  | TransactionProgressStatus;

export interface TransactionStep {
  /** Unique identifier for the step */
  id: string;
  /** Short label shown next to the icon */
  label: string;
  /** Optional longer description shown below the label */
  subText?: string;
  /** Current status of this step */
  status: StepStatus;
  /** Error message — only used when status === 'error' or 'failure' */
  errorMessage?: string;
  /** Stellar Explorer link — shown when confirmed or when tracking delayed status */
  explorerUrl?: string;
  /** Confirmed ledger sequence number (for ledger confirmation verification) */
  ledgerSequence?: number;
  /** Primary next action for this step */
  nextAction?: Partial<TransactionAction> | { label: string; onClick?: () => void; ariaLabel?: string; disabled?: boolean; actionKey?: string };
  /** Recovery action for this step */
  recoveryAction?: Partial<TransactionAction> | { label: string; onClick?: () => void; ariaLabel?: string; href?: string; actionKey?: string };
}

export interface TransactionProgressProps {
  /** Ordered list of steps */
  steps: TransactionStep[];
  /** Called when user clicks Retry on an errored step */
  onRetry?: () => void;
  /** Title shown above the stepper */
  title?: string;
  /** Optional transaction context providing explicit units, network, and auth */
  context?: Partial<TransactionContext>;
  /** Callback for step actions */
  onAction?: (actionKey: string, stepId: string) => void;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done' || status === 'confirmed') {
    return (
      <CheckCircle2
        size={20}
        className="text-emerald-400 flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'review') {
    return (
      <FileText
        size={20}
        className="text-indigo-400 flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'signature_request') {
    return (
      <Key
        size={20}
        className="text-indigo-400 animate-pulse flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'submission') {
    return (
      <Send
        size={20}
        className="text-sky-400 flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'active' || status === 'confirmation') {
    return (
      <Loader2
        size={20}
        className="text-emerald-400 animate-spin flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'delayed') {
    return (
      <Clock
        size={20}
        className="text-amber-400 animate-pulse flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'error' || status === 'failure') {
    return (
      <XCircle
        size={20}
        className="text-red-400 flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  // pending
  return (
    <Clock
      size={20}
      className="text-slate-500 flex-shrink-0"
      aria-hidden="true"
    />
  );
}

function stepAriaLabel(step: TransactionStep, index: number): string {
  const ordinal = `Step ${index + 1} of ${step.label}`;
  if (step.status === 'done' || step.status === 'confirmed') {
    return `${ordinal}: confirmed on ledger${step.ledgerSequence ? ` sequence ${step.ledgerSequence}` : ''}`;
  }
  if (step.status === 'delayed') {
    return `${ordinal}: confirmation delayed. Transaction has not failed. Do not resubmit.`;
  }
  if (step.status === 'active' || step.status === 'confirmation' || step.status === 'submission' || step.status === 'signature_request') {
    return `${ordinal}: in progress`;
  }
  if (step.status === 'review') {
    return `${ordinal}: review pending confirmation`;
  }
  if (step.status === 'error' || step.status === 'failure') {
    return `${ordinal}: failed — ${step.errorMessage ?? 'unknown error'}`;
  }
  return `${ordinal}: waiting`;
}

/**
 * TransactionProgress
 *
 * Reusable step-by-step ledger confirmation tracker with coherent vocabulary.
 * Supports: review | signature_request | submission | confirmation | delayed | confirmed | failure
 *
 * Guarantees:
 *   1. Every status has a clear next action and recovery action.
 *   2. Success means verified ledger confirmation with sequence and hash.
 *   3. Delayed confirmation is distinguishable from failure (amber warning vs red error).
 *   4. Monetary units, network identity, and authorization requirements are explicit.
 */
export const TransactionProgress: React.FC<TransactionProgressProps> = ({
  steps,
  onRetry,
  title = 'Transaction Progress',
  context,
  onAction,
}) => {
  const activeIndex = steps.findIndex(
    (s) =>
      s.status === 'active' ||
      s.status === 'review' ||
      s.status === 'signature_request' ||
      s.status === 'submission' ||
      s.status === 'confirmation' ||
      s.status === 'delayed',
  );
  const hasError = steps.some((s) => s.status === 'error' || s.status === 'failure');
  const isDelayed = steps.some((s) => s.status === 'delayed');
  const isConfirmed = steps.every(
    (s) => s.status === 'done' || s.status === 'confirmed',
  );

  return (
    <div
      role="region"
      aria-label={title}
      aria-live="polite"
      aria-atomic="false"
      className="w-full"
    >
      {/* Header bar with optional explicit network badge */}
      <div className="flex items-center justify-between mb-4">
        {title && (
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        )}
        {context?.networkName && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {context.networkName}
          </span>
        )}
      </div>

      {/* Explicit Context Banner (Monetary Units & Authorization) */}
      {context && (context.amount !== undefined || context.userPublicKey) && (
        <div className="mb-4 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono space-y-1">
          {context.amount !== undefined && (
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Operation / Amount:</span>
              <span className="font-semibold text-white">
                {context.operation ? context.operation.toUpperCase() : 'TX'}: {context.amount.toLocaleString()} {context.assetSymbol || 'USDC'}
                {context.sharesEstimate !== undefined && ` (~${context.sharesEstimate.toFixed(4)} ${context.sharesSymbol || 'NV-SHARES'})`}
              </span>
            </div>
          )}
          {context.networkFee && (
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Network Fee:</span>
              <span className="text-slate-400">{context.networkFee}</span>
            </div>
          )}
          {context.userPublicKey && (
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Authorized Signer:</span>
              <span className="text-indigo-400">
                {context.userPublicKey.slice(0, 6)}…{context.userPublicKey.slice(-6)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Ordered Step List */}
      <ol
        role="list"
        aria-label="Transaction steps"
        className="relative space-y-0"
      >
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isDone = step.status === 'done' || step.status === 'confirmed';
          const isStepDelayed = step.status === 'delayed';
          const isStepError = step.status === 'error' || step.status === 'failure';
          const isActive =
            step.status === 'active' ||
            step.status === 'review' ||
            step.status === 'signature_request' ||
            step.status === 'submission' ||
            step.status === 'confirmation';

          return (
            <li
              key={step.id}
              role="listitem"
              aria-current={isActive || isStepDelayed ? 'step' : undefined}
              aria-label={stepAriaLabel(step, index)}
              className="relative flex gap-3"
            >
              {/* Vertical connector line */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[9px] top-6 w-0.5 h-full -mb-1 ${
                    isDone
                      ? 'bg-emerald-500/60'
                      : isStepDelayed
                      ? 'bg-amber-500/50'
                      : isStepError
                      ? 'bg-red-500/50'
                      : 'bg-slate-700'
                  }`}
                />
              )}

              {/* Step icon */}
              <span className="relative z-10 mt-0.5">
                <StepIcon status={step.status} />
              </span>

              {/* Step content */}
              <div className="pb-5 min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`text-sm font-medium leading-tight ${
                      isDone
                        ? 'text-emerald-400'
                        : isStepDelayed
                        ? 'text-amber-400'
                        : isStepError
                        ? 'text-red-400'
                        : isActive
                        ? 'text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Explorer link on ledger confirmation */}
                  {isDone && step.explorerUrl && (
                    <a
                      href={step.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View on Stellar Explorer (opens in new tab)"
                      className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded font-mono"
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                      Explorer
                    </a>
                  )}
                </div>

                {/* Sub-text */}
                {step.subText && (
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {step.subText}
                  </p>
                )}

                {/* Ledger sequence confirmation verification note */}
                {isDone && (step.ledgerSequence || context?.ledgerSequence) && (
                  <p className="text-[11px] font-mono text-emerald-500 mt-1">
                    Confirmed in Stellar Ledger #{step.ledgerSequence || context?.ledgerSequence}
                  </p>
                )}

                {/* Active pulse indicator */}
                {isActive && (
                  <p className="text-xs text-emerald-400/80 mt-1 animate-pulse">
                    {step.status === 'signature_request'
                      ? 'Waiting for Freighter signature…'
                      : step.status === 'submission'
                      ? 'Broadcasting envelope XDR…'
                      : step.status === 'confirmation'
                      ? 'Awaiting ledger close (~3–5s)…'
                      : 'Processing…'}
                  </p>
                )}

                {/* DELAYED CONFIRMATION (Criterion 3: Clearly distinguishable from failure) */}
                {isStepDelayed && (
                  <div
                    className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5"
                    role="alert"
                    aria-live="assertive"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                      <AlertCircle size={14} aria-hidden="true" />
                      Confirmation Delayed — Transaction has NOT failed
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      Stellar ledger consensus is taking longer than usual. Your transaction was broadcast and is pending finality.
                      <strong className="text-amber-300 font-semibold block mt-0.5">
                        Please do not re-submit to prevent duplicate operations.
                      </strong>
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {step.explorerUrl && (
                        <a
                          href={step.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline"
                        >
                          <ExternalLink size={11} aria-hidden="true" />
                          Check status on Stellar Explorer
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Step Actions: Next Action & Recovery Action (Criterion 1) */}
                {(step.nextAction || step.recoveryAction) && (
                  <div className="mt-2.5 flex items-center gap-2">
                    {step.nextAction && (
                      <button
                        type="button"
                        onClick={() => {
                          if (step.nextAction && 'onClick' in step.nextAction && step.nextAction.onClick) {
                            step.nextAction.onClick();
                          } else if (step.nextAction?.actionKey && onAction) {
                            onAction(step.nextAction.actionKey, step.id);
                          }
                        }}
                        disabled={step.nextAction.disabled}
                        aria-label={step.nextAction.ariaLabel || step.nextAction.label}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        {step.nextAction.label}
                      </button>
                    )}

                    {step.recoveryAction && (
                      <>
                        {step.recoveryAction.href ? (
                          <a
                            href={step.recoveryAction.href}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={step.recoveryAction.ariaLabel || step.recoveryAction.label}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          >
                            <ExternalLink size={12} aria-hidden="true" />
                            {step.recoveryAction.label}
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (step.recoveryAction && 'onClick' in step.recoveryAction && step.recoveryAction.onClick) {
                                step.recoveryAction.onClick();
                              } else if (step.recoveryAction?.actionKey && onAction) {
                                onAction(step.recoveryAction.actionKey, step.id);
                              }
                            }}
                            aria-label={step.recoveryAction.ariaLabel || step.recoveryAction.label}
                            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          >
                            {step.recoveryAction.label}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Error message + retry */}
                {isStepError && (
                  <div className="mt-1.5 space-y-1.5">
                    {step.errorMessage && (
                      <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20" role="alert">
                        {step.errorMessage}
                      </p>
                    )}
                    {(onRetry || step.nextAction) && (
                      <button
                        type="button"
                        onClick={onRetry || (() => onAction?.('retry', step.id))}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        aria-label="Retry failed transaction step"
                      >
                        <RefreshCw size={12} aria-hidden="true" />
                        Retry Transaction
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Overall status summary for screen readers */}
      <span className="sr-only" aria-live="assertive">
        {hasError
          ? 'Transaction failed. Please retry.'
          : isDelayed
          ? 'Transaction confirmation is delayed. Network consensus pending. Please do not re-submit.'
          : activeIndex !== -1
          ? `Step ${activeIndex + 1} in progress: ${steps[activeIndex].label}`
          : isConfirmed
          ? `Transaction confirmed on ledger successfully.`
          : ''}
      </span>
    </div>
  );
};
