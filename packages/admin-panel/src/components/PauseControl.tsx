"use client";

/**
 * PauseControl — Issue #19 (Enhanced)
 *
 * Admin panel section for pausing and unpausing the vault in emergency
 * situations. Features:
 *
 *  - Prominent status badge (PAUSED / ACTIVE)
 *  - "Pause Vault" confirmation modal that requires typing "PAUSE"
 *  - "Unpause Vault" with simple confirmation
 *  - Activity log showing recent pause/unpause events from the DB
 *  - Auto-refreshes pause state every 30 seconds
 *  - Non-owner wallets see only a read-only view (owner gate in parent page)
 */

import { useState, useEffect, useCallback } from "react";
import { VaultClient } from "@neurowealth/vault-client";
import { useStore } from "@/lib/store";
import { getSorobanServer } from "@/lib/stellar";
import {
  AlertTriangle,
  Play,
  Pause,
  ShieldAlert,
  ShieldCheck,
  Clock,
  RefreshCw,
} from "lucide-react";
import * as StellarSdk from "@stellar/stellar-sdk";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PauseControlProps {
  client: VaultClient;
  signer: StellarSdk.Keypair;
}

export interface PauseEvent {
  id: string;
  action: "PAUSED" | "UNPAUSED";
  timestamp: number; // unix ms
  txHash: string;
  triggeredBy: string; // address
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function truncateAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PauseControl({ client, signer }: PauseControlProps) {
  const { network } = useStore();

  // ── State ──────────────────────────────────────────────────────────────────
  const [paused, setPaused] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Pause confirmation modal
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseConfirmInput, setPauseConfirmInput] = useState("");

  // Unpause confirmation
  const [showUnpauseConfirm, setShowUnpauseConfirm] = useState(false);

  // Activity log
  const [activityLog, setActivityLog] = useState<PauseEvent[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchPauseStatus = useCallback(async () => {
    try {
      const status = await client.is_paused(signer.publicKey());
      setPaused(Boolean(status));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pause status");
    }
  }, [client, signer]);

  const fetchActivityLog = useCallback(async () => {
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await fetch("/api/pause-events");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PauseEvent[] = await res.json();
      setActivityLog(data);
    } catch {
      setLogError("Unable to load activity log. Check that the agent API is running.");
    } finally {
      setLogLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPauseStatus();
    fetchActivityLog();
  }, [fetchPauseStatus, fetchActivityLog]);

  // Auto-refresh pause state every 30 s
  useEffect(() => {
    const id = setInterval(fetchPauseStatus, 30_000);
    return () => clearInterval(id);
  }, [fetchPauseStatus]);

  // ── Pause action ───────────────────────────────────────────────────────────

  const handlePause = async () => {
    if (pauseConfirmInput !== "PAUSE") return;

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await client.pause(signer, signer.publicKey());
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

      setPaused(true);
      setShowPauseModal(false);
      setPauseConfirmInput("");
      await fetchActivityLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause vault");
    } finally {
      setLoading(false);
    }
  };

  // ── Unpause action ─────────────────────────────────────────────────────────

  const handleUnpause = async () => {
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const result = await client.unpause(signer, signer.publicKey());
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

      setPaused(false);
      setShowUnpauseConfirm(false);
      await fetchActivityLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpause vault");
    } finally {
      setLoading(false);
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (paused === null) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-4" />
        <div className="h-4 bg-slate-700 rounded w-1/2 mb-2" />
        <div className="h-12 bg-slate-700 rounded mb-4" />
        <div className="h-10 bg-slate-700 rounded" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Main card ── */}
      <div
        className={`card border-2 ${paused ? "border-red-600" : "border-emerald-600"}`}
        aria-label="Vault pause control"
      >
        {/* Status header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              {paused ? (
                <>
                  <ShieldAlert className="text-red-500" size={24} aria-hidden="true" />
                  Vault is Paused
                </>
              ) : (
                <>
                  <ShieldCheck className="text-emerald-500" size={24} aria-hidden="true" />
                  Vault is Active
                </>
              )}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {paused
                ? "All deposits and withdrawals are currently blocked."
                : "Deposits and withdrawals are open."}
            </p>
          </div>

          {/* Prominent status badge */}
          <span
            role="status"
            aria-label={paused ? "Vault is paused" : "Vault is active"}
            className={`text-sm font-bold px-4 py-1.5 rounded-full border ${
              paused
                ? "bg-red-900/40 text-red-300 border-red-600"
                : "bg-emerald-900/40 text-emerald-300 border-emerald-600"
            }`}
          >
            {paused ? "PAUSED" : "ACTIVE"}
          </span>
        </div>

        {/* Action buttons */}
        {paused ? (
          /* Unpause */
          showUnpauseConfirm ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-100">Confirm Unpause</p>
                  <p className="text-sm text-slate-300 mt-1">
                    This will re-enable all deposits and withdrawals. Are you sure the
                    emergency has been resolved?
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUnpause}
                  disabled={loading}
                  aria-label="Confirm unpause vault"
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 transition-colors"
                >
                  {loading ? "Processing…" : "Unpause Vault"}
                </button>
                <button
                  onClick={() => setShowUnpauseConfirm(false)}
                  disabled={loading}
                  className="button-secondary px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowUnpauseConfirm(true)}
              disabled={loading}
              aria-label="Unpause vault"
              className="w-full py-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Play size={18} aria-hidden="true" />
              Unpause Vault
            </button>
          )
        ) : (
          /* Pause */
          <button
            onClick={() => {
              setPauseConfirmInput("");
              setShowPauseModal(true);
            }}
            disabled={loading}
            aria-label="Open emergency pause confirmation"
            className="w-full py-3 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Pause size={18} aria-hidden="true" />
            Emergency Pause
          </button>
        )}

        {/* Transaction confirmation */}
        {txHash && (
          <div className="mt-4 p-3 bg-emerald-900/20 border border-emerald-700 rounded text-xs text-emerald-300 font-mono break-all">
            Tx confirmed: {txHash}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── Activity log ── */}
        <div className="mt-6 pt-5 border-t border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Clock size={14} className="text-slate-400" aria-hidden="true" />
              Activity Log
            </h4>
            <button
              onClick={fetchActivityLog}
              disabled={logLoading}
              aria-label="Refresh activity log"
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={logLoading ? "animate-spin" : ""} aria-hidden="true" />
            </button>
          </div>

          {logError ? (
            <p className="text-xs text-red-400">{logError}</p>
          ) : logLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />
              ))}
            </div>
          ) : activityLog.length === 0 ? (
            <p className="text-xs text-slate-500">No pause/unpause events recorded.</p>
          ) : (
            <ul className="space-y-2" aria-label="Pause/unpause event history">
              {activityLog.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-800/50 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-bold shrink-0 px-2 py-0.5 rounded text-[11px] ${
                        event.action === "PAUSED"
                          ? "bg-red-900/50 text-red-400"
                          : "bg-emerald-900/50 text-emerald-400"
                      }`}
                    >
                      {event.action}
                    </span>
                    <span className="text-slate-400 shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className="text-slate-500 font-mono truncate">
                      by {truncateAddress(event.triggeredBy)}
                    </span>
                  </div>
                  <span
                    className="font-mono text-slate-500 shrink-0"
                    title={event.txHash}
                  >
                    {truncateHash(event.txHash)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Pause confirmation modal ── */}
      {showPauseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="text-red-500 flex-shrink-0" size={28} aria-hidden="true" />
              <h2 id="pause-modal-title" className="text-lg font-bold text-white">
                Confirm Emergency Pause
              </h2>
            </div>

            {/* Warning box */}
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-5">
              <p className="text-sm font-semibold text-red-300 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} aria-hidden="true" />
                This action will immediately:
              </p>
              <ul className="text-sm text-red-200 space-y-1 list-disc list-inside">
                <li>Block all user deposits</li>
                <li>Block all user withdrawals</li>
                <li>Prevent the AI agent from rebalancing</li>
                <li className="text-emerald-300">Funds remain safe in the contract</li>
              </ul>
            </div>

            {/* Confirm input */}
            <label className="block mb-4">
              <span className="text-sm text-slate-300 mb-1.5 block">
                Type <span className="font-mono font-bold text-red-400">PAUSE</span> to confirm
              </span>
              <input
                type="text"
                value={pauseConfirmInput}
                onChange={(e) => setPauseConfirmInput(e.target.value)}
                placeholder="Type PAUSE to confirm"
                aria-label="Confirm pause by typing PAUSE"
                className={`w-full px-4 py-2 rounded-lg bg-slate-800 border text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 ${
                  pauseConfirmInput === "PAUSE"
                    ? "border-red-500 focus:ring-red-500/40"
                    : "border-slate-700 focus:ring-slate-500/40"
                }`}
                autoFocus
              />
            </label>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handlePause}
                disabled={loading || pauseConfirmInput !== "PAUSE"}
                aria-label="Confirm pause vault"
                className="flex-1 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Processing…" : "Pause Vault Now"}
              </button>
              <button
                onClick={() => {
                  setShowPauseModal(false);
                  setPauseConfirmInput("");
                }}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg button-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
