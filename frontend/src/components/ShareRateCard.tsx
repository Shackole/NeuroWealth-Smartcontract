'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, ChevronDown, ChevronUp, HelpCircle, RefreshCw } from 'lucide-react';
import { fetchShareData, ShareData, STROOP } from '@/lib/stellar';

interface ShareRateCardProps {
  /** Wallet public key — used to call preview_shares_to_assets */
  publicKey: string | null;
  /**
   * Increment this value to trigger a refresh (e.g. after deposit/withdrawal).
   * Defaults to 0; increment from parent after any transaction.
   */
  refreshKey?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number with 7 decimal places (Stellar Stroop precision). */
function formatStroop(value: number): string {
  return value.toFixed(7);
}

/** Format a share balance with up to 7 significant decimal places. */
function formatShares(shares: number): string {
  return shares.toLocaleString('en-US', {
    minimumFractionDigits: 7,
    maximumFractionDigits: 7,
  });
}

/** Format a USDC value with 2 decimal places. */
function formatUsdc(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ShareRateSkeleton() {
  return (
    <div
      className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden"
      aria-label="Loading share data…"
      role="status"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-40 animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded" aria-hidden="true" />
        <div className="h-6 w-24 animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded-full" aria-hidden="true" />
      </div>
      <div className="space-y-3">
        <div className="h-10 w-56 animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded" aria-hidden="true" />
        <div className="h-4 w-44 animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded" aria-hidden="true" />
        <div className="h-4 w-36 animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

function ShareMechanicsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="region"
      aria-label="Share mechanics explanation"
      className="mt-3 p-4 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-2"
    >
      <button
        type="button"
        onClick={onClose}
        className="sr-only focus:not-sr-only focus:absolute focus:bg-slate-800 focus:text-white focus:p-1 focus:rounded"
      >
        Close explanation
      </button>

      <p>
        <strong className="text-slate-800 dark:text-white">What are shares?</strong>
        <br />
        When you deposit USDC into the NeuroWealth vault, you receive
        <em> vault shares</em> in return. Shares represent your proportional
        ownership of the pooled funds.
      </p>
      <p>
        <strong className="text-slate-800 dark:text-white">Exchange rate</strong>
        <br />
        The vault contract exposes <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">get_exchange_rate()</code> which
        returns <em>assets per share × 10,000,000</em> (Stellar Stroop precision).
        Divide by 10,000,000 to get the human-readable rate (e.g.{' '}
        <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">10,420,000 → 1.0420000</code>).
      </p>
      <p>
        <strong className="text-slate-800 dark:text-white">USDC equivalent</strong>
        <br />
        <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">
          USDC value = shares × exchange rate
        </code>
        <br />
        This is also what <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">preview_shares_to_assets()</code> returns.
        As yield accrues, the rate increases and each share becomes worth more USDC —
        your share count stays the same but its value grows.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * ShareRateCard — displays:
 *   • Shares held (7 decimal places)
 *   • Current exchange rate (7 decimal places)
 *   • Equivalent USDC value
 *   • Collapsible info panel explaining share mechanics
 *
 * Calls get_exchange_rate() and preview_shares_to_assets() on mount and
 * whenever `refreshKey` changes (i.e. after a deposit or withdrawal).
 */
export function ShareRateCard({ publicKey, refreshKey = 0 }: ShareRateCardProps) {
  const [data, setData] = useState<ShareData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchShareData(publicKey ?? undefined);
      if (mountedRef.current) setData(result);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load share data');
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load, refreshKey]); // re-fetch when refreshKey changes (post-transaction)

  if (isLoading && !data) return <ShareRateSkeleton />;

  const isConnected = !!publicKey;
  const shares = data?.shares ?? 0;
  const exchangeRate = data?.exchangeRate ?? 1.0;
  const exchangeRateRaw = data?.exchangeRateRaw ?? STROOP;
  const usdcEquivalent = data?.usdcEquivalent ?? 0;

  return (
    <div className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Layers size={14} className="text-indigo-400" aria-hidden="true" />
          Vault Shares
        </span>

        <div className="flex items-center gap-2">
          {/* Info toggle */}
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            aria-expanded={infoOpen}
            aria-controls="share-mechanics-panel"
            aria-label="Explain share mechanics"
            title="How do shares work?"
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {infoOpen ? (
              <ChevronUp size={15} aria-hidden="true" />
            ) : (
              <HelpCircle size={15} aria-hidden="true" />
            )}
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            aria-label="Refresh share data"
            title="Refresh"
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
          >
            <RefreshCw
              size={14}
              className={isLoading ? 'animate-spin text-indigo-400' : ''}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Primary value — shares held */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-mono"
            aria-label={`${formatShares(isConnected ? shares : 0)} shares`}
          >
            {isConnected ? formatShares(shares) : '0.0000000'}
          </span>
          <span className="text-base font-bold text-indigo-400">SHARES</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Your proportional ownership of the vault pool
        </p>
      </div>

      {/* Exchange rate & USDC equivalent */}
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
            Exchange rate
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              (assets/share)
            </span>
          </dt>
          <dd
            className="font-mono font-semibold text-slate-800 dark:text-slate-200"
            aria-label={`Exchange rate: ${formatStroop(exchangeRate)} USDC per share`}
          >
            {formatStroop(exchangeRate)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">USDC</span>
          </dd>
        </div>

        <div className="flex items-center justify-between">
          <dt className="text-slate-500 dark:text-slate-400">
            Raw rate
            <span className="text-[10px] ml-1 text-slate-400 dark:text-slate-500">
              (×10⁷)
            </span>
          </dt>
          <dd
            className="font-mono font-semibold text-slate-700 dark:text-slate-300"
            aria-label={`Raw exchange rate: ${exchangeRateRaw.toLocaleString()}`}
          >
            {isConnected ? exchangeRateRaw.toLocaleString('en-US') : '10,000,000'}
          </dd>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <dt className="text-slate-500 dark:text-slate-400 font-medium">≈ USDC value</dt>
          <dd
            className="font-mono font-bold text-emerald-600 dark:text-emerald-400"
            aria-label={`Equivalent USDC value: ${formatUsdc(isConnected ? usdcEquivalent : 0)}`}
          >
            {formatUsdc(isConnected ? usdcEquivalent : 0)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">USDC</span>
          </dd>
        </div>
      </dl>

      {/* Error state */}
      {error && (
        <p
          role="alert"
          className="mt-3 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}

      {/* Collapsible info panel */}
      {infoOpen && (
        <div id="share-mechanics-panel">
          <ShareMechanicsPanel onClose={() => setInfoOpen(false)} />
        </div>
      )}
    </div>
  );
}
