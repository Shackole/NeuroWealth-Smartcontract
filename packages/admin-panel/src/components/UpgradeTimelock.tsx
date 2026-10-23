"use client";

/**
 * UpgradeTimelock — Issue #18
 *
 * Polls get_pending_upgrade every 30 seconds and displays a prominent banner
 * when a contract upgrade is pending. Only the contract owner sees the banner.
 *
 * Features:
 *  - Polls every 30 s via setInterval
 *  - Shows WASM hash, time remaining (ledger delta → hours/minutes)
 *  - "Execute Upgrade" button (disabled until timelock elapsed)
 *  - "Cancel Upgrade" button
 *  - Banner auto-dismisses after execute or cancel
 *  - Non-owner wallets see nothing
 *
 * Technical note: 1 ledger ≈ 5 seconds
 *   ledger_delta × 5 / 3600 = hours remaining
 */

import { useState, useEffect, useCallback } from "react";
import { VaultClient } from "@neurowealth/vault-client";
import { useStore } from "@/lib/store";
import { getSorobanServer } from "@/lib/stellar";
import { AlertTriangle, CheckCircle, X, Clock, GitBranch } from "lucide-react";
import * as StellarSdk from "@stellar/stellar-sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpgradeTimelockProps {
  client: VaultClient;
  signer: StellarSdk.Keypair;
  currentLedger: number;
  /** The contract owner's public key. */
  ownerPublicKey: string;
  /** The currently connected wallet's public key. */
  connectedPublicKey: string;
  /** Called after a successful execute or cancel so the parent can refresh. */
  onUpgradeComplete?: () => void;
}

interface PendingUpgrade {
  wasmHash: string;
  effectiveLedger: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECONDS_PER_LEDGER = 5;

function ledgersToHumanTime(ledgers: number): string {
  const totalSeconds = ledgers * SECONDS_PER_LEDGER;
  if (totalSeconds <= 0) return "0 minutes";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  if (minutes === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UpgradeTimelock({
  client,
  signer,
  currentLedger,
  ownerPublicKey,
  connectedPublicKey,
  onUpgradeComplete,
}: UpgradeTimelockProps) {
  const { network } = useStore();

  const [pending, setPending] = useState<PendingUpgrade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Only the contract owner should see this banner
  const isOwner = connectedPublicKey === ownerPublicKey;

  // ── Poll get_pending_upgrade every 30 seconds ─────────────────────────────

  const fetchPendingUpgrade = useCallback(async () => {
    try {
      const result = await client.get_pending_upgrade(signer.publicKey());
      if (result && typeof result === "object") {
        const wasmHash =
          (result as any).wasm_hash ||
          (result as any).hash ||
          (result as any).new_wasm_hash ||
          null;
        const effectiveLedger =
          (result as any).effective_ledger ||
          (result as any).expiry ||
          (result as any).unlock_ledger ||
          null;

        if (wasmHash && effectiveLedger) {
          setPending({ wasmHash: String(wasmHash), effectiveLedger: Number(effectiveLedger) });
          setDismissed(false);
        } else {
          setPending(null);
        }
      } else {
        setPending(null);
      }
    } catch {
      // Silently fail polling — don't spam the UI with poll errors
    }
  }, [client, signer]);

  useEffect(() => {
    if (!isOwner) return;

    fetchPendingUpgrade();

    const intervalId = setInterval(fetchPendingUpgrade, 30_000);
    return () => clearInterval(intervalId);
  }, [isOwner, fetchPendingUpgrade]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const ledgersRemaining = pending
    ? Math.max(0, pending.effectiveLedger - currentLedger)
    : 0;
  const canExecute = pending !== null && currentLedger >= pending.effectiveLedger;
  const timeRemainingText = ledgersToHumanTime(ledgersRemaining);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleExecuteUpgrade = async () => {
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await client.execute_upgrade(signer, signer.publicKey());
      setTxHash(result.hash);

      // Poll for confirmation
      const server = getSorobanServer(network);
      for (let i = 0; i < 60; i++) {
        try {
          const tx = await server.getTransaction(result.hash);
          if (tx.status === "SUCCESS") break;
        } catch {
          // not confirmed yet
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Refresh state — banner will auto-dismiss because pending becomes null
      await fetchPendingUpgrade();
      onUpgradeComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute upgrade");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelUpgrade = async () => {
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await client.cancel_upgrade(signer, signer.publicKey());
      setTxHash(result.hash);

      const server = getSorobanServer(network);
      for (let i = 0; i < 60; i++) {
        try {
          const tx = await server.getTransaction(result.hash);
          if (tx.status === "SUCCESS") break;
        } catch {
          // not confirmed yet
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      await fetchPendingUpgrade();
      onUpgradeComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel upgrade");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Not owner, no pending upgrade, or manually dismissed → render nothing
  if (!isOwner || !pending || dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full rounded-xl border-2 border-amber-500 bg-amber-950/40 p-4 shadow-lg"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertTriangle
            className="text-amber-400 flex-shrink-0 mt-0.5"
            size={22}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            {/* Title + status */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-amber-200 flex items-center gap-2">
                <GitBranch size={16} aria-hidden="true" />
                Upgrade Pending
              </h3>
              {canExecute ? (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700">
                  <CheckCircle size={12} aria-hidden="true" />
                  Ready to execute
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300 border border-amber-700">
                  <Clock size={12} aria-hidden="true" />
                  Timelock active
                </span>
              )}
            </div>

            {/* Human-readable time remaining */}
            <p className="text-sm text-amber-100 mb-2">
              {canExecute
                ? "Timelock has elapsed — upgrade is ready to execute."
                : `Upgrade pending — executable in ${timeRemainingText}`}
            </p>

            {/* WASM hash */}
            <div className="bg-slate-900/60 rounded-lg px-3 py-2 mb-3">
              <div className="text-xs text-slate-400 mb-0.5">WASM hash</div>
              <div className="font-mono text-xs text-amber-300 break-all">
                {pending.wasmHash}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Effective ledger: {pending.effectiveLedger} &nbsp;·&nbsp; Current:{" "}
                {currentLedger}
                {ledgersRemaining > 0 && (
                  <> &nbsp;·&nbsp; ~{ledgersRemaining.toLocaleString()} ledgers remaining</>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExecuteUpgrade}
                disabled={loading || !canExecute}
                aria-label="Execute the pending contract upgrade"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                  bg-emerald-700 hover:bg-emerald-600 text-white
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Processing…" : "Execute Upgrade"}
              </button>

              <button
                onClick={handleCancelUpgrade}
                disabled={loading}
                aria-label="Cancel the pending contract upgrade"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                  bg-red-800 hover:bg-red-700 text-white
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Processing…" : "Cancel Upgrade"}
              </button>
            </div>

            {/* Transaction confirmation */}
            {txHash && (
              <div className="mt-3 p-2 rounded bg-emerald-900/30 border border-emerald-700 text-xs text-emerald-300 font-mono break-all">
                Tx confirmed: {txHash}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 p-2 rounded bg-red-900/30 border border-red-700 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss upgrade banner"
          className="text-amber-400 hover:text-amber-200 transition-colors flex-shrink-0 p-1"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
