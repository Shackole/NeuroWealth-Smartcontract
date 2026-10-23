'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ChartDataPoint } from '@/lib/database';
import { useReducedMotion } from '@/lib/useReducedMotion';

export interface PortfolioChartProps {
  data: ChartDataPoint[];
  /** Fallback vault APY (%) when data points do not carry an explicit `apy` value */
  defaultApy?: number | null;
  /** Indicates that the chart series could not be loaded from RPC / indexer */
  isUnavailable?: boolean;
  /** Optional explanation when series is unavailable */
  unavailableReason?: string;
  /** Explicit Stellar network identity (default: 'Stellar Testnet') */
  network?: string;
  /** Whether the user wallet is connected/authorized for account-specific vault data */
  isConnected?: boolean;
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data }) => {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className="glass-panel rounded-2xl p-6 relative space-y-6"
      data-testid="portfolio-chart-container"
    >
      {/* Header & Non-Color-Only Legend */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Portfolio Growth &amp; Yield
          </h3>
          <p className="text-xs text-slate-400">
            Autonomous Soroban vault earnings in USDC and annualized APY (%) on{' '}
            <span className="font-semibold text-slate-300">{network}</span> ·{' '}
            <span>
              {isConnected
                ? 'Wallet authorized for account series'
                : 'Read-only preview (wallet authorization required for live account series)'}
            </span>
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-4 text-xs"
          role="list"
          aria-label="Chart series legend (shape and label)"
        >
          <div className="flex items-center gap-1.5" role="listitem">
            <span
              className="h-2.5 w-2.5 rounded-sm inline-block"
              style={{ backgroundColor: CHART_VALUE_COLOR }}
              aria-hidden="true"
            />
            <span className="text-slate-300">■ Portfolio Value (USDC)</span>
          </div>
          <div className="flex items-center gap-1.5" role="listitem">
            <span
              className="h-2.5 w-2.5 rounded-full inline-block"
              style={{ backgroundColor: CHART_YIELD_COLOR }}
              aria-hidden="true"
            />
            <span className="text-slate-300">● Accrued Earnings (USDC)</span>
          </div>
          <div className="flex items-center gap-1.5" role="listitem">
            <span
              className="h-2.5 w-2.5 rotate-45 inline-block"
              style={{ backgroundColor: CHART_APY_COLOR }}
              aria-hidden="true"
            />
            <span className="text-slate-300">◆ Net APY (% Annualized)</span>
          </div>
        </div>
      </div>

      {/* Accessible Text Summary (Available without hover or color) */}
      <div
        role="group"
        aria-label="Earnings and APY chart text summary"
        id="portfolio-chart-text-summary"
        data-testid="chart-text-summary"
        className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 space-y-3 text-xs text-slate-300"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
            Accessible Chart Summary ({network})
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Units: Monetary = USDC · Yield Rate = % APY · Dates = UTC
          </span>
        </div>

        {isUnavailable ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="chart-summary-unavailable"
            className="text-amber-300 leading-relaxed"
          >
            Series unavailable on {network}:{' '}
            {unavailableReason ||
              'Historical Portfolio Value (USDC), Accrued Earnings (USDC), and Net APY (%) series could not be loaded from the Soroban RPC or indexer service.'}{' '}
            On-chain vault shares remain unaffected. Use the tabular view below to
            verify series status.
          </p>
        ) : summary.count === 0 ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="chart-summary-empty"
            className="text-slate-300 leading-relaxed"
          >
            Empty series on {network}: 0 data points recorded for Portfolio Value
            (USDC), Accrued Earnings (USDC), and Net APY (%).{' '}
            {isConnected
              ? 'No vault earnings history has accrued for this account yet.'
              : 'Wallet is not connected; connect and authorize your Stellar wallet to load personal vault series.'}
          </p>
        ) : (
          <>
            <p className="leading-relaxed" data-testid="chart-summary-narrative">
              From <strong>{summary.startDate}</strong> to{' '}
              <strong>{summary.endDate}</strong> ({summary.count}{' '}
              {summary.count === 1 ? 'observation' : 'observations'} on {network}
              ): Portfolio Value is{' '}
              <strong>{formatUsdcExplicit(summary.latestValue)}</strong>
              {summary.minValue !== null && summary.maxValue !== null
                ? ` (range ${formatUsdcExplicit(summary.minValue)} to ${formatUsdcExplicit(summary.maxValue)}, net change ${formatUsdcExplicit(summary.valueDelta, true)})`
                : ' (Portfolio Value series unavailable)'}
              . Cumulative Accrued Earnings:{' '}
              <strong>
                {summary.hasYieldSeries
                  ? `${formatUsdcExplicit(summary.latestYield, true)} (range ${formatUsdcExplicit(summary.minYield, true)} to ${formatUsdcExplicit(summary.maxYield, true)})`
                  : 'Series unavailable (USDC)'}
              </strong>
              . Net APY:{' '}
              <strong>
                {summary.hasApySeries
                  ? `${formatApyExplicit(summary.latestApy)} (average ${formatApyExplicit(summary.avgApy)}, range ${formatApyExplicit(summary.minApy)} to ${formatApyExplicit(summary.maxApy)})`
                  : 'Series unavailable (% APY)'}
              </strong>
              .
            </p>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
              <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/80">
                <dt className="text-[11px] text-slate-400">Date Range (UTC)</dt>
                <dd className="font-mono font-semibold text-white mt-0.5">
                  {summary.startDate} – {summary.endDate}
                </dd>
              </div>
              <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/80">
                <dt className="text-[11px] text-slate-400">
                  Latest Portfolio Value (USDC)
                </dt>
                <dd className="font-mono font-semibold text-white mt-0.5">
                  {formatUsdcExplicit(summary.latestValue)}
                </dd>
              </div>
              <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/80">
                <dt className="text-[11px] text-slate-400">
                  Latest Accrued Earnings (USDC)
                </dt>
                <dd className="font-mono font-semibold text-white mt-0.5">
                  {summary.hasYieldSeries
                    ? formatUsdcExplicit(summary.latestYield, true)
                    : 'Unavailable (USDC)'}
                </dd>
              </div>
              <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/80">
                <dt className="text-[11px] text-slate-400">
                  Latest Net APY (% Annualized)
                </dt>
                <dd className="font-mono font-semibold text-white mt-0.5">
                  {summary.hasApySeries
                    ? formatApyExplicit(summary.latestApy)
                    : 'Unavailable (% APY)'}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>

      {/* Keyboard-Accessible Table & View Controls */}
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        role="toolbar"
        aria-label="Chart and table keyboard controls"
      >
        <div
          className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800"
          role="group"
          aria-label="Display mode"
        >
          {viewModes.map((mode, idx) => (
            <button
              key={mode.value}
              ref={(el) => {
                viewModeButtonsRef.current[idx] = el;
              }}
              formatter={(val: number) => [`$${val.toFixed(2)}`, '']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorValue)"
              name="Portfolio Value"
              isAnimationActive={!reducedMotion}
            />
            <Area
              type="monotone"
              dataKey="yield"
              stroke="#6366f1"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorYield)"
              name="Yield Earned"
              isAnimationActive={!reducedMotion}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
