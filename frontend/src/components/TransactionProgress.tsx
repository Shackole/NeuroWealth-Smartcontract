'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface TransactionStep {
  /** Unique identifier for the step */
  id: string;
  /** Short label shown next to the icon */
  label: string;
  /** Optional longer description shown below the label */
  subText?: string;
  /** Current status of this step */
  status: StepStatus;
  /** Error message — only used when status === 'error' */
  errorMessage?: string;
  /** Stellar Explorer link — only shown when status === 'done' and a hash is available */
  explorerUrl?: string;
}

interface TransactionProgressProps {
  /** Ordered list of steps */
  steps: TransactionStep[];
  /** Called when user clicks Retry on an errored step */
  onRetry?: () => void;
  /** Title shown above the stepper */
  title?: string;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <CheckCircle2
        size={20}
        className="text-emerald-400 flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'active') {
    return (
      <Loader2
        size={20}
        className="text-emerald-400 animate-spin flex-shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'error') {
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
  if (step.status === 'done') return `${ordinal}: completed`;
  if (step.status === 'active') return `${ordinal}: in progress`;
  if (step.status === 'error') return `${ordinal}: failed — ${step.errorMessage ?? 'unknown error'}`;
  return `${ordinal}: waiting`;
}

/**
 * TransactionProgress
 *
 * Reusable step-by-step ledger confirmation tracker.
 * Supports four statuses: pending | active | done | error.
 * Accessible: each step has aria-current="step" when active, role="listitem",
 * and a descriptive aria-label summarising its current state.
 *
 * Usage:
 *   const steps: TransactionStep[] = [
 *     { id: 'sign',    label: 'Signing with Freighter',      status: 'done' },
 *     { id: 'submit',  label: 'Submitting to Stellar',       status: 'active' },
 *     { id: 'confirm', label: 'Waiting for confirmation',    status: 'pending' },
 *     { id: 'done',    label: 'Confirmed ✓',                 status: 'pending' },
 *   ];
 *   <TransactionProgress steps={steps} onRetry={handleRetry} />
 */
export const TransactionProgress: React.FC<TransactionProgressProps> = ({
  steps,
  onRetry,
  title = 'Transaction Progress',
}) => {
  const activeIndex = steps.findIndex((s) => s.status === 'active');
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <div
      role="region"
      aria-label={title}
      aria-live="polite"
      aria-atomic="false"
      className="w-full"
    >
      {title && (
        <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      )}

      <ol
        role="list"
        aria-label="Transaction steps"
        className="relative space-y-0"
      >
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isActive = step.status === 'active';
          const isDone = step.status === 'done';
          const isError = step.status === 'error';

          return (
            <li
              key={step.id}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              aria-label={stepAriaLabel(step, index)}
              className="relative flex gap-3"
            >
              {/* Vertical connector line */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[9px] top-6 w-0.5 h-full -mb-1 ${
                    isDone ? 'bg-emerald-500/60' : 'bg-slate-700'
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
                        : isActive
                        ? 'text-white'
                        : isError
                        ? 'text-red-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Explorer link on completion */}
                  {isDone && step.explorerUrl && (
                    <a
                      href={step.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View on Stellar Explorer (opens in new tab)"
                      className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                      Explorer
                    </a>
                  )}
                </div>

                {/* Sub-text */}
                {step.subText && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {step.subText}
                  </p>
                )}

                {/* Active pulse indicator */}
                {isActive && (
                  <p className="text-xs text-emerald-400/70 mt-1 animate-pulse">
                    Processing…
                  </p>
                )}

                {/* Error message + retry */}
                {isError && (
                  <div className="mt-1.5 space-y-1.5">
                    {step.errorMessage && (
                      <p className="text-xs text-red-400" role="alert">
                        {step.errorMessage}
                      </p>
                    )}
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        aria-label="Retry failed transaction step"
                      >
                        <RefreshCw size={12} aria-hidden="true" />
                        Retry
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
          : activeIndex !== -1
          ? `Step ${activeIndex + 1} in progress: ${steps[activeIndex].label}`
          : steps.every((s) => s.status === 'done')
          ? 'Transaction confirmed successfully.'
          : ''}
      </span>
    </div>
  );
};
