'use client';

/**
 * RestoreFootprintModal
 *
 * Shown when the Soroban RPC simulation detects that one or more ledger entries
 * referenced by a transaction are archived. The user must approve a
 * restore-footprint transaction (which pays a small XLM fee) before the
 * original operation can be executed.
 *
 * Acceptance criteria for #406:
 *   ✓ Restoration fees are explained before signing.
 *   ✓ Rejection leaves the original action unsubmitted.
 *   ✓ Successful restoration reruns simulation (via executeDepositAfterRestore).
 */

import React from 'react';
import { AlertTriangle, X, ArchiveRestore, ExternalLink } from 'lucide-react';
import type { RestoreRequirement } from '@/lib/vaultHelpers';

export interface RestoreFootprintModalProps {
  /** Whether the modal is visible. */
  isOpen: boolean;
  /** The restore cost details returned by the RPC simulation. */
  requirement: RestoreRequirement;
  /** Whether the restore transaction is currently being submitted. */
  isRestoring: boolean;
  /** Called when the user confirms the restore step. */
  onConfirm: () => void;
  /**
   * Called when the user dismisses or cancels the modal.
   * The original action is left unsubmitted (acceptance criterion: rejection).
   */
  onCancel: () => void;
}

/**
 * Modal that explains the restore-footprint requirement and asks the user to
 * confirm or cancel before the original transaction is attempted.
 */
export function RestoreFootprintModal({
  isOpen,
  requirement,
  isRestoring,
  onConfirm,
  onCancel,
}: RestoreFootprintModalProps) {
  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
      aria-describedby="restore-modal-desc"
    >
      {/* Panel */}
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-6 space-y-5">

        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isRestoring}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50"
          aria-label="Cancel restore and close"
        >
          <X size={18} aria-hidden="true" />
        </button>

        {/* Icon + Title */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5 h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center">
            <ArchiveRestore size={20} className="text-amber-400" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="restore-modal-title"
              className="text-base font-bold text-white leading-tight"
            >
              Archived Contract Data Detected
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              One or more ledger entries have expired and must be restored before
              your transaction can proceed.
            </p>
          </div>
        </div>

        {/* Explanation */}
        <div
          id="restore-modal-desc"
          className="text-sm text-slate-300 space-y-2 leading-relaxed"
        >
          <p>
            On the Stellar network, smart contract storage entries expire after a
            period of inactivity. A <strong className="text-white">restore-footprint</strong>{' '}
            transaction pays a small XLM fee to bring those entries back to an
            active state.
          </p>
          <p>
            This is a separate transaction that must be confirmed in your Freighter
            wallet <em>before</em> your deposit is submitted. Your deposit is{' '}
            <strong className="text-white">not sent</strong> until you approve both steps.
          </p>
        </div>

        {/* Fee breakdown */}
        <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 space-y-2 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Restore fee:</span>
            <span className="text-amber-300 font-mono font-semibold">
              {requirement.feeXlm}
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Entries to restore:</span>
            <span className="text-white font-mono">{requirement.entryCount}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Network:</span>
            <span className="text-white">Stellar Testnet</span>
          </div>
        </div>

        {/* Warning callout */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
          <p className="text-xs text-amber-300 leading-snug">
            If you cancel, your original action will <strong>not</strong> be submitted.
            You can retry it at any time — the vault state is unchanged.
          </p>
        </div>

        {/* Docs link */}
        <a
          href="https://developers.stellar.org/docs/build/smart-contracts/storage/restore"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
        >
          <ExternalLink size={12} aria-hidden="true" />
          Learn more about Soroban state archival
        </a>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRestoring}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRestoring}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isRestoring ? (
              <>
                <span className="inline-block h-4 w-4 border-2 border-black/40 border-t-black rounded-full animate-spin" aria-hidden="true" />
                Restoring…
              </>
            ) : (
              <>
                <ArchiveRestore size={15} aria-hidden="true" />
                Confirm Restore
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
