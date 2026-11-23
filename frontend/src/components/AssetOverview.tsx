'use client';

import React from 'react';
import { ArrowDown, ArrowUp, CircleHelp, Layers3 } from 'lucide-react';

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

const SORT_COLUMNS = [
  { field: 'asset', label: 'Asset' },
  { field: 'balance', label: 'Balance' },
  { field: 'allocation', label: 'Allocation' },
] as const;

type SortField = (typeof SORT_COLUMNS)[number]['field'];
type SortDirection = 'ascending' | 'descending';

function normalizeDecimal(value: string | null): string | null {
  const decimal = value?.trim().replace(/^\$\s*|\s+(?:USD|USDC)$/g, '');
  if (!decimal || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(decimal)) return null;
  return decimal.replaceAll(',', '');
}

function parseDisplayValue(value: string | null): number | null {
  const decimal = normalizeDecimal(value);
  if (decimal === null) return null;
  const amount = Number(decimal);
  return Number.isFinite(amount) ? amount : null;
}

function compareBalances(left: string | null, right: string | null, direction: number): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;

  const [leftInteger, leftFraction = ''] = left.split('.');
  const [rightInteger, rightFraction = ''] = right.split('.');
  const decimalPlaces = Math.max(leftFraction.length, rightFraction.length);
  const leftUnits = BigInt(leftInteger + leftFraction.padEnd(decimalPlaces, '0'));
  const rightUnits = BigInt(rightInteger + rightFraction.padEnd(decimalPlaces, '0'));
  return direction * (leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0);
}

export const AssetOverview: React.FC<AssetOverviewProps> = ({
  assets,
  totalEstimatedValue = null,
  totalValueSource = null,
}) => {
  const [sort, setSort] = React.useState<{ field: SortField; direction: SortDirection } | null>(null);
  const total = parseDisplayValue(totalEstimatedValue);
  const rows = assets.map(asset => {
    const value = parseDisplayValue(asset.estimatedValue);
    const allocation = value !== null && total !== null && total > 0 ? value / total : null;
    return { asset, allocation, balance: normalizeDecimal(asset.rawAmount) };
  });

  if (sort) {
    const direction = sort.direction === 'ascending' ? 1 : -1;
    rows.sort((left, right) => {
      switch (sort.field) {
        case 'asset':
          return direction * left.asset.symbol.localeCompare(right.asset.symbol);
        case 'balance':
          return compareBalances(left.balance, right.balance, direction);
        case 'allocation':
          if (left.allocation === null) return right.allocation === null ? 0 : 1;
          if (right.allocation === null) return -1;
          return direction * (left.allocation - right.allocation);
      }
    });
  }

  return (
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
        <div className="overflow-x-auto">
          <p className="sr-only" role="status">
            {sort && `Sorted by ${SORT_COLUMNS.find(column => column.field === sort.field)?.label}, ${sort.direction}`}
          </p>
          <table className="w-full text-left text-sm" aria-label="Asset positions">
            <thead>
              <tr className="border-b border-slate-800 text-slate-300">
                {SORT_COLUMNS.map(({ field, label }) => {
                  const direction = sort?.field === field ? sort.direction : undefined;
                  return (
                    <th key={field} scope="col" aria-sort={direction} className="px-2">
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                        onClick={() => setSort({
                          field,
                          direction: direction === 'ascending' ? 'descending' : 'ascending',
                        })}
                      >
                        {label}
                        {direction === 'ascending' && <ArrowUp size={14} aria-hidden="true" />}
                        {direction === 'descending' && <ArrowDown size={14} aria-hidden="true" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map(({ asset, allocation }) => (
                <tr key={asset.id}>
                  <th scope="row" className="px-2 py-3 align-top font-normal">
                    <div className="flex items-start gap-2">
                      <Layers3 size={18} className="shrink-0 text-indigo-300" aria-hidden="true" />
                      <div>
                        <strong className="text-white">{asset.name} ({asset.symbol})</strong>
                        <p className="text-xs text-slate-400">Placed in {asset.protocol}</p>
                      </div>
                    </div>
                  </th>
                  <td className="px-2 py-3 align-top font-mono text-white">
                    {asset.rawAmount} {asset.symbol}
                  </td>
                  <td className="px-2 py-3 align-top">
                    <span className="block font-mono text-white">
                      {allocation === null ? 'Allocation unavailable' : `${(allocation * 100).toFixed(2)}%`}
                    </span>
                    <strong className="block font-mono text-emerald-300">{asset.estimatedValue ?? 'Value unavailable'}</strong>
                    {asset.estimatedValue ? (
                      <details className="mt-1 text-xs text-slate-400">
                        <summary className="min-h-11 cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                          <CircleHelp size={14} className="inline" aria-hidden="true" /> Valuation source and freshness
                        </summary>
                        <p>Source: {asset.valuationSource || 'Source unavailable'}</p>
                        <p>Quote updated: {asset.quoteUpdatedAt || 'Time unavailable'}</p>
                      </details>
                    ) : (
                      <p className="mt-1 text-xs text-amber-300">
                        No current price quote is available. This asset is excluded from the estimated total.
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
