'use client';

import React from 'react';
import { CircleHelp, Layers3 } from 'lucide-react';

export interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  /** Exact display quantity supplied by the asset parser; never sum this with other assets. */
  rawAmount: string;
  protocol: string;
  /** Display-ready estimate from the valuation service, or null when no quote exists. */
  estimatedValue: string | null;
  quoteUpdatedAt?: string | null;
  valuationSource?: string | null;
}

interface AssetOverviewProps {
  assets: PortfolioAsset[];
  totalEstimatedValue?: string | null;
  totalValueSource?: string | null;
}

export const AssetOverview: React.FC<AssetOverviewProps> = ({
  assets,
  totalEstimatedValue = null,
  totalValueSource = null,
}) => (
  <section className="glass-panel rounded-2xl p-4 sm:p-6 min-w-0" aria-labelledby="asset-overview-title">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 id="asset-overview-title" className="text-lg font-bold text-white">Assets and allocation</h3>
        <p className="text-xs text-slate-400">Token quantities stay separate from estimated display values.</p>
      </div>
      <div className="text-right max-w-full">
        <span className="block text-[11px] text-slate-400">Estimated total value</span>
        <strong className="font-mono text-white break-words">{totalEstimatedValue ?? 'Value unavailable'}</strong>
        {totalValueSource && <span className="block text-[11px] text-slate-500 break-words">Source: {totalValueSource}</span>}
      </div>
    </div>

    {assets.length === 0 ? (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400" role="status">
        No asset positions are available for this wallet.
      </div>
    ) : (
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-label="Asset positions">
        {assets.map((asset) => (
          <li key={asset.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-indigo-500/10 p-2 text-indigo-300" aria-hidden="true"><Layers3 size={18} /></span>
                <div className="min-w-0">
                  <h4 className="font-semibold text-white break-words">{asset.name} <span className="font-mono text-slate-400">({asset.symbol})</span></h4>
                  <p className="text-xs text-slate-400 break-words">Placed in {asset.protocol}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="block font-mono text-sm text-white break-all">{asset.rawAmount} {asset.symbol}</span>
                <strong className="block font-mono text-sm text-emerald-300 break-words">{asset.estimatedValue ?? 'Value unavailable'}</strong>
              </div>
            </div>
            {asset.estimatedValue ? (
              <details className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-400">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                  <CircleHelp size={14} aria-hidden="true" /> Valuation source and freshness
                </summary>
                <p className="break-words">Source: {asset.valuationSource || 'Source unavailable'}</p>
                <p>Quote updated: {asset.quoteUpdatedAt || 'Time unavailable'}</p>
              </details>
            ) : (
              <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-amber-300" role="status">
                No current price quote is available. This asset is excluded from the estimated total.
              </p>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
);
