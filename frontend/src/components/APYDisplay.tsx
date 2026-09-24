'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, RefreshCw, WifiOff, Clock } from 'lucide-react';
import { useApyData } from '@/lib/useApyData';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface APYDisplayProps {
  /** Override the active APY value (e.g. passed from a parent that already has vault state). */
  apyOverride?: number;
  /** Current user strategy — used to label the active protocol. */
  strategy?: 'Conservative' | 'Balanced' | 'Growth';
  /** Extra Tailwind class names to apply to the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (date.getFullYear() === 1970) return 'cached (offline)';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function strategyToProtocol(strategy?: string): string {
  switch (strategy) {
    case 'Conservative': return 'Blend';
    case 'Growth': return 'DEX Pool';
    default: return 'Blend + DEX';
  }
}

// ---------------------------------------------------------------------------
// APYValue — animated counter that highlights on change
// ---------------------------------------------------------------------------

interface APYValueProps {
  value: number;
  size?: 'lg' | 'md' | 'sm';
  colorClass?: string;
}

function APYValue({ value, size = 'lg', colorClass = 'text-white' }: APYValueProps) {
  const prevValueRef = useRef(value);
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setHighlight(true);
      const timer = setTimeout(() => setHighlight(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const sizeClass =
    size === 'lg'
      ? 'text-4xl font-extrabold'
      : size === 'md'
      ? 'text-2xl font-bold'
      : 'text-lg font-semibold';

  return (
    <span
      className={`
        font-mono tracking-tight transition-all duration-700
        ${sizeClass} ${colorClass}
        ${highlight ? 'text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : ''}
      `}
      aria-live="polite"
      aria-atomic="true"
    >
      {value.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// APYDisplay — main exported component
// ---------------------------------------------------------------------------

/**
 * Real-time APY display card.
 *
 * - Fetches `/api/apy` via SWR with a 5-minute auto-refresh.
 * - Shows Blend APY, DEX APY, and the currently active vault APY.
 * - Animates the number on every change with an emerald glow.
 * - Shows a "Last updated" timestamp.
 * - Displays a Wi-Fi-off badge when the backend is temporarily unreachable
 *   but still renders the last-known (cached) values.
 * - Shows a subtle loading overlay while SWR is re-validating in the background.
 */
export const APYDisplay: React.FC<APYDisplayProps> = ({
  apyOverride,
  strategy,
  className = '',
}) => {
  const { blend, dex, current, updatedAt, isLoading, isValidating, error, refresh } =
    useApyData();

  // Use parent-supplied APY (from vault state) when present, else live /api/apy value
  const displayCurrent = apyOverride !== undefined ? apyOverride : current;
  const activeProtocol = strategyToProtocol(strategy);

  return (
    <div
      className={`glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between ${className}`}
      aria-label="Real-time APY display"
    >
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ------------------------------------------------------------------ */}
      {/* Header row                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp size={14} className="text-emerald-400" /> Live APY
        </span>

        <div className="flex items-center gap-2">
          {/* Offline badge — only shown when the API is unreachable */}
          {error && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30"
              title="Using cached APY values — backend temporarily unreachable"
            >
              <WifiOff size={10} /> Cached
            </span>
          )}

          {/* Re-validating spinner */}
          {isValidating && !isLoading && (
            <RefreshCw
              size={12}
              className="text-slate-500 animate-spin"
              aria-label="Refreshing APY data"
            />
          )}

          {/* Manual refresh button */}
          <button
            onClick={refresh}
            className="text-slate-500 hover:text-emerald-400 transition-colors"
            aria-label="Refresh APY data now"
            title="Refresh APY"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main APY figure                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-4">
        {isLoading ? (
          // Skeleton while the very first fetch is in-flight
          <div className="h-10 w-28 rounded-lg bg-slate-800 animate-pulse mb-1" />
        ) : (
          <div className="flex items-baseline gap-2">
            <APYValue value={displayCurrent} size="lg" colorClass="text-white" />
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Net APY
            </span>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-1.5">
          Active protocol: <span className="text-emerald-400 font-medium">{activeProtocol}</span>
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Protocol breakdown panel                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Blend */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Blend Protocol
          </p>
          {isLoading ? (
            <div className="h-7 w-16 rounded bg-slate-800 animate-pulse" />
          ) : (
            <APYValue value={blend} size="md" colorClass="text-blue-400" />
          )}
          <p className="text-[10px] text-slate-500 mt-1">Stablecoin lending</p>
        </div>

        {/* DEX */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            DEX Pool
          </p>
          {isLoading ? (
            <div className="h-7 w-16 rounded bg-slate-800 animate-pulse" />
          ) : (
            <APYValue value={dex} size="md" colorClass="text-amber-400" />
          )}
          <p className="text-[10px] text-slate-500 mt-1">Liquidity provision</p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Last updated timestamp                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center gap-1.5 text-[10px] text-slate-500">
        <Clock size={10} />
        <span>Last updated: </span>
        <time
          dateTime={updatedAt ?? undefined}
          className="font-mono text-slate-400"
          aria-label={`APY last updated at ${formatUpdatedAt(updatedAt)}`}
        >
          {formatUpdatedAt(updatedAt)}
        </time>
        <span className="ml-auto text-slate-600">Auto-refreshes every 5 min</span>
      </div>
    </div>
  );
};
