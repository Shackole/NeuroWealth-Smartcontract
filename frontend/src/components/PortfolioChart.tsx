'use client';

import React, { useId, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/database';
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

const CHART_VALUE_COLOR = '#10b981';
const CHART_YIELD_COLOR = '#6366f1';
const CHART_APY_COLOR = '#f59e0b';

function formatNumber(value: number | null | undefined, unit: string, signed = false) {
  if (value == null) return 'Unavailable';
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(2)} ${unit}`;
}

function formatUsdcExplicit(value: number | null | undefined, signed = false) {
  return formatNumber(value, 'USDC', signed);
}

function formatApyExplicit(value: number | null | undefined) {
  return formatNumber(value, '% APY');
}

function getRange(values: number[]) {
  return {
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({
  data,
  defaultApy = null,
  isUnavailable = false,
  unavailableReason,
  network = 'Stellar Testnet',
  isConnected = false,
}) => {
  const reducedMotion = useReducedMotion();
  const viewId = useId();
  const [showTable, setShowTable] = useState(false);
  const series = useMemo(() => data.map((point) => ({
    ...point,
    apy: point.apyBps == null ? defaultApy : point.apyBps / 100,
  })), [data, defaultApy]);
  const summary = useMemo(() => {
    const first = series[0];
    const last = series.at(-1);
    const value = getRange(series.map((point) => point.value));
    const earnings = getRange(series.map((point) => point.yield));
    const apys = series.flatMap((point) => point.apy == null ? [] : [point.apy]);
    const apy = getRange(apys);
    return {
      count: series.length,
      startDate: first?.date,
      endDate: last?.date,
      latestValue: last?.value,
      minValue: value.min,
      maxValue: value.max,
      valueDelta: first && last ? last.value - first.value : null,
      hasYieldSeries: earnings.min !== null,
      latestYield: last?.yield,
      minYield: earnings.min,
      maxYield: earnings.max,
      hasApySeries: apys.length > 0,
      latestApy: last?.apy,
      avgApy: apys.length ? apys.reduce((sum, rate) => sum + rate, 0) / apys.length : null,
      minApy: apy.min,
      maxApy: apy.max,
    };
  }, [series]);
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

      <div className="flex flex-wrap gap-2" role="group" aria-label="Display mode">
        {(['Chart', 'Table'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={showTable === (mode === 'Table')}
            aria-controls={viewId}
            onClick={() => setShowTable(mode === 'Table')}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 aria-pressed:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            {mode}
          </button>
        ))}
      </div>

      <div id={viewId}>
        {isUnavailable || series.length === 0 ? (
          <p className="text-sm text-slate-400">No portfolio observations to display.</p>
        ) : showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Portfolio observations on {network}</caption>
              <thead>
                <tr className="border-b border-slate-700 text-slate-300">
                  <th scope="col" className="p-2">Date (UTC)</th>
                  <th scope="col" className="p-2">Portfolio value (USDC)</th>
                  <th scope="col" className="p-2">Accrued earnings (USDC)</th>
                  <th scope="col" className="p-2">Net APY (%)</th>
                </tr>
              </thead>
              <tbody>
                {series.map((point, index) => (
                  <tr key={`${point.date}-${index}`} className="border-b border-slate-800 text-slate-200">
                    <th scope="row" className="p-2 font-medium">{point.date}</th>
                    <td className="p-2">{point.value.toFixed(2)}</td>
                    <td className="p-2">{point.yield.toFixed(2)}</td>
                    <td className="p-2">{point.apy?.toFixed(2) ?? 'Unavailable'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-48 w-full sm:h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis yAxisId="usdc" stroke="#64748b" fontSize={11} width={48} />
                {summary.hasApySeries && (
                  <YAxis yAxisId="apy" orientation="right" stroke="#64748b" fontSize={11} unit="%" width={48} />
                )}
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 12 }}
                  formatter={(value, name) => [
                    typeof value === 'number' ? formatNumber(value, name === 'Net APY' ? '%' : 'USDC') : value,
                    name,
                  ]}
                />
                <Area yAxisId="usdc" type="monotone" dataKey="value" name="Portfolio Value" stroke={CHART_VALUE_COLOR} fill={CHART_VALUE_COLOR} fillOpacity={0.12} isAnimationActive={!reducedMotion} />
                <Area yAxisId="usdc" type="monotone" dataKey="yield" name="Accrued Earnings" stroke={CHART_YIELD_COLOR} strokeDasharray="5 3" fill={CHART_YIELD_COLOR} fillOpacity={0.12} isAnimationActive={!reducedMotion} />
                {summary.hasApySeries && (
                  <Area yAxisId="apy" type="monotone" dataKey="apy" name="Net APY" stroke={CHART_APY_COLOR} strokeDasharray="2 3" fill="none" isAnimationActive={!reducedMotion} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
