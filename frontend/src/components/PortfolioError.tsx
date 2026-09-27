'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface PortfolioErrorProps {
  /** Human-readable error message */
  message?: string;
  /** Called when the user clicks Retry */
  onRetry: () => void;
}

/**
 * PortfolioError — shown when the SWR fetch fails.
 * Displays a friendly message and a retry button.
 */
export function PortfolioError({ message, onRetry }: PortfolioErrorProps) {
  return (
    <div
      role="alert"
      className="glass-panel-interactive rounded-2xl p-8 col-span-full flex flex-col items-center justify-center gap-4 border border-red-500/20 text-center"
    >
      <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="text-red-400" size={24} />
      </div>
      <div>
        <p className="font-semibold text-slate-200 mb-1">
          Failed to load portfolio data
        </p>
        <p className="text-sm text-slate-400">
          {message ?? 'Unable to reach the Soroban RPC endpoint. Please check your connection.'}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold px-5 py-2.5 rounded-xl border border-emerald-500/30 transition-all"
        aria-label="Retry loading portfolio"
      >
        <RefreshCw size={16} />
        Retry
      </button>
    </div>
  );
}
