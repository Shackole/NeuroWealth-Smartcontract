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

type ViewMode = 'both' | 'table';
type SeriesFilter = 'all' | 'earnings' | 'apy';
type SortField = 'date' | 'value' | 'yield' | 'apy';
type SortDirection = 'asc' | 'desc';

/*
 * CVD-safe palette (WCAG SC 1.4.1):
 * Blue (#2563eb), Amber (#d97706), and Teal (#0891b2) remain distinguishable
 * under deuteranopia, protanopia, and monochrome rendering when paired with
 * distinct legend shapes and stroke dash patterns.
 */
const CHART_VALUE_COLOR = '#2563eb';
const CHART_YIELD_COLOR = '#d97706';
const CHART_APY_COLOR = '#0891b2';

function formatExplicitDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (!trimmed) return 'Unspecified Date (UTC)';
  if (/utc/i.test(trimmed)) return trimmed;
  return `${trimmed} (UTC)`;
}

function isValidNumber(val: number | null | undefined): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function formatUsdcExplicit(val: number | null | undefined, signed = false): string {
  if (!isValidNumber(val)) return 'Unavailable (USDC)';
  const prefix = signed && val >= 0 ? '+' : signed && val < 0 ? '-' : '';
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${prefix}$${abs} USDC`;
}

function formatApyExplicit(val: number | null | undefined): string {
  if (!isValidNumber(val)) return 'Unavailable (% APY)';
  return `${val.toFixed(2)}% APY`;
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({
  data,
  defaultApy,
  isUnavailable = false,
  unavailableReason,
  network = 'Stellar Testnet',
  isConnected = true,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [seriesFilter, setSeriesFilter] = useState<SeriesFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const viewModeButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const filterButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const normalizedData = useMemo(() => {
    if (!Array.isArray(data) || isUnavailable) return [];
    return data.map((point, index) => ({
      index,
      rawDate: point.date,
      explicitDate: formatExplicitDate(point.date),
      value: isValidNumber(point.value) ? point.value : null,
      yield: isValidNumber(point.yield) ? point.yield : null,
      apy: isValidNumber(point.apy)
        ? point.apy
        : isValidNumber(defaultApy)
        ? defaultApy
        : null,
    }));
  }, [data, defaultApy, isUnavailable]);

  const summary = useMemo(() => {
    const count = normalizedData.length;
    if (count === 0) {
      return {
        count: 0,
        startDate: 'N/A (UTC)',
        endDate: 'N/A (UTC)',
        hasValueSeries: false,
        hasYieldSeries: false,
        hasApySeries: false,
        latestValue: null as number | null,
        minValue: null as number | null,
        maxValue: null as number | null,
        valueDelta: null as number | null,
        latestYield: null as number | null,
        minYield: null as number | null,
        maxYield: null as number | null,
        latestApy: null as number | null,
        minApy: null as number | null,
        maxApy: null as number | null,
        avgApy: null as number | null,
      };
    }

    const values = normalizedData.map((d) => d.value).filter(isValidNumber);
    const yields = normalizedData.map((d) => d.yield).filter(isValidNumber);
    const apys = normalizedData.map((d) => d.apy).filter(isValidNumber);

    const hasValueSeries = values.length > 0;
    const hasYieldSeries = yields.length > 0;
    const hasApySeries = apys.length > 0;

    const latestValue = hasValueSeries ? values[values.length - 1] : null;
    const firstValue = hasValueSeries ? values[0] : null;
    const minValue = hasValueSeries ? Math.min(...values) : null;
    const maxValue = hasValueSeries ? Math.max(...values) : null;
    const valueDelta =
      latestValue !== null && firstValue !== null ? latestValue - firstValue : null;

    const latestYield = hasYieldSeries ? yields[yields.length - 1] : null;
    const minYield = hasYieldSeries ? Math.min(...yields) : null;
    const maxYield = hasYieldSeries ? Math.max(...yields) : null;

    const latestApy = hasApySeries ? apys[apys.length - 1] : null;
    const minApy = hasApySeries ? Math.min(...apys) : null;
    const maxApy = hasApySeries ? Math.max(...apys) : null;
    const avgApy = hasApySeries
      ? apys.reduce((acc, v) => acc + v, 0) / apys.length
      : null;

    return {
      count,
      startDate: normalizedData[0].explicitDate,
      endDate: normalizedData[count - 1].explicitDate,
      hasValueSeries,
      hasYieldSeries,
      hasApySeries,
      latestValue,
      minValue,
      maxValue,
      valueDelta,
      latestYield,
      minYield,
      maxYield,
      latestApy,
      minApy,
      maxApy,
      avgApy,
    };
  }, [normalizedData]);

  const sortedRows = useMemo(() => {
    const copy = [...normalizedData];
    copy.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = a.index - b.index;
      } else {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal === null && bVal === null) comparison = a.index - b.index;
        else if (aVal === null) comparison = 1;
        else if (bVal === null) comparison = -1;
        else comparison = aVal - bVal;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return copy;
  }, [normalizedData, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const handleRovingKeyDown = <T,>(
    event: React.KeyboardEvent<HTMLButtonElement>,
    items: T[],
    currentIndex: number,
    onSelect: (item: T) => void,
    refs: React.MutableRefObject<Array<HTMLButtonElement | null>>
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      onSelect(items[nextIndex]);
      refs.current[nextIndex]?.focus();
    }
  };

  const canRenderRecharts =
    typeof window !== 'undefined' && typeof window.ResizeObserver !== 'undefined';

  const showEarningsColumns = seriesFilter === 'all' || seriesFilter === 'earnings';
  const showApyColumn = seriesFilter === 'all' || seriesFilter === 'apy';
  const visibleColumnCount =
    2 + (showEarningsColumns ? 2 : 0) + (showApyColumn ? 1 : 0);

  const viewModes: Array<{ value: ViewMode; label: string }> = [
    { value: 'both', label: 'Chart & Table' },
    { value: 'table', label: 'Table Only' },
  ];

  const filterOptions: Array<{ value: SeriesFilter; label: string }> = [
    { value: 'all', label: 'All Series' },
    { value: 'earnings', label: 'Earnings (USDC)' },
    { value: 'apy', label: 'APY (%)' },
  ];

  const getRowStatusText = (row: {
    value: number | null;
    yield: number | null;
    apy: number | null;
  }): string => {
    const missing: string[] = [];
    if (row.value === null) missing.push('Portfolio Value (USDC)');
    if (row.yield === null) missing.push('Accrued Earnings (USDC)');
    if (row.apy === null) missing.push('Net APY (%)');
    if (missing.length === 0) return 'Complete (All series available)';
    return `Partial (${missing.join(', ')} unavailable)`;
  };

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
              type="button"
              onClick={() => setViewMode(mode.value)}
              onKeyDown={(e) =>
                handleRovingKeyDown(
                  e,
                  viewModes.map((m) => m.value),
                  idx,
                  setViewMode,
                  viewModeButtonsRef
                )
              }
              aria-pressed={viewMode === mode.value}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                viewMode === mode.value
                  ? 'bg-slate-800 text-white border border-slate-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800"
          role="group"
          aria-label="Table series filter"
        >
          {filterOptions.map((option, idx) => (
            <button
              key={option.value}
              ref={(el) => {
                filterButtonsRef.current[idx] = el;
              }}
              type="button"
              onClick={() => setSeriesFilter(option.value)}
              onKeyDown={(e) =>
                handleRovingKeyDown(
                  e,
                  filterOptions.map((o) => o.value),
                  idx,
                  setSeriesFilter,
                  filterButtonsRef
                )
              }
              aria-pressed={seriesFilter === option.value}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                seriesFilter === option.value
                  ? 'bg-slate-800 text-white border border-slate-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visual Chart (Hidden in Table-Only mode; accompanied by full table below) */}
      {viewMode === 'both' && !isUnavailable && summary.count > 0 && (
        <div
          className="h-48 sm:h-64 md:h-72 w-full"
          role="img"
          aria-label={`Area chart of Portfolio Value in USDC and Accrued Earnings in USDC from ${summary.startDate} to ${summary.endDate} on ${network}. Full values are provided in the text summary and data table.`}
          aria-describedby="portfolio-chart-text-summary"
        >
          {canRenderRecharts ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={normalizedData}
                margin={{ top: 10, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_VALUE_COLOR} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={CHART_VALUE_COLOR} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_YIELD_COLOR} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_YIELD_COLOR} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="explicitDate"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  width={56}
                  tickFormatter={(v: number) => `$${Number(v).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  }}
                  formatter={(val: number, name: string) => [
                    `${formatUsdcExplicit(Number(val))}`,
                    name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_VALUE_COLOR}
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                  name="Portfolio Value (USDC)"
                />
                <Area
                  type="monotone"
                  dataKey="yield"
                  stroke={CHART_YIELD_COLOR}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  fillOpacity={1}
                  fill="url(#colorYield)"
                  name="Accrued Earnings (USDC)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 text-xs text-slate-400 px-4 text-center">
              Visual canvas hidden in non-browser environment; refer to the
              complete text summary and accessible data table below.
            </div>
          )}
        </div>
      )}

      {/* Accessible Tabular Alternative */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table
          className="w-full text-left text-xs text-slate-200"
          aria-label="Earnings and APY historical data table"
          data-testid="earnings-apy-table"
        >
          <caption className="px-4 py-2.5 text-left text-[11px] text-slate-400 bg-slate-950/50 border-b border-slate-800">
            Tabular alternative for Earnings (USDC) and Net APY (% Annualized) on{' '}
            {network}. Dates are in UTC; monetary amounts are in USDC (Soroban
            7-decimal stroop precision). Sorted by {sortField} (
            {sortDirection === 'asc' ? 'ascending' : 'descending'}).
          </caption>
          <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-300 border-b border-slate-800 font-mono">
            <tr>
              <th
                scope="col"
                aria-sort={getAriaSort('date')}
                className="py-3 px-4"
              >
                <button
                  type="button"
                  onClick={() => handleSort('date')}
                  aria-label={`Sort by Date (UTC), currently ${getAriaSort('date')}`}
                  className="inline-flex items-center gap-1 font-semibold text-left hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1 py-0.5"
                >
                  <span>Date (UTC)</span>
                  <span aria-hidden="true">
                    {sortField === 'date'
                      ? sortDirection === 'asc'
                        ? '↑'
                        : '↓'
                      : '↕'}
                  </span>
                </button>
              </th>

              {showEarningsColumns && (
                <th
                  scope="col"
                  aria-sort={getAriaSort('value')}
                  className="py-3 px-4"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('value')}
                    aria-label={`Sort by Portfolio Value (USDC), currently ${getAriaSort('value')}`}
                    className="inline-flex items-center gap-1 font-semibold text-left hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1 py-0.5"
                  >
                    <span>Portfolio Value (USDC)</span>
                    <span aria-hidden="true">
                      {sortField === 'value'
                        ? sortDirection === 'asc'
                          ? '↑'
                          : '↓'
                        : '↕'}
                    </span>
                  </button>
                </th>
              )}

              {showEarningsColumns && (
                <th
                  scope="col"
                  aria-sort={getAriaSort('yield')}
                  className="py-3 px-4"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('yield')}
                    aria-label={`Sort by Accrued Earnings (USDC), currently ${getAriaSort('yield')}`}
                    className="inline-flex items-center gap-1 font-semibold text-left hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1 py-0.5"
                  >
                    <span>Accrued Earnings (USDC)</span>
                    <span aria-hidden="true">
                      {sortField === 'yield'
                        ? sortDirection === 'asc'
                          ? '↑'
                          : '↓'
                        : '↕'}
                    </span>
                  </button>
                </th>
              )}

              {showApyColumn && (
                <th
                  scope="col"
                  aria-sort={getAriaSort('apy')}
                  className="py-3 px-4"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('apy')}
                    aria-label={`Sort by Net APY (%), currently ${getAriaSort('apy')}`}
                    className="inline-flex items-center gap-1 font-semibold text-left hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1 py-0.5"
                  >
                    <span>Net APY (% Annualized)</span>
                    <span aria-hidden="true">
                      {sortField === 'apy'
                        ? sortDirection === 'asc'
                          ? '↑'
                          : '↓'
                        : '↕'}
                    </span>
                  </button>
                </th>
              )}

              <th scope="col" className="py-3 px-4">
                Series Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60 font-mono">
            {isUnavailable ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
                  className="py-6 px-4 text-center text-amber-300"
                  role="status"
                  aria-live="polite"
                  data-testid="table-unavailable-row"
                >
                  Unavailable series: Earnings (USDC) and Net APY (%) data could
                  not be loaded from {network}
                  {unavailableReason ? ` (${unavailableReason})` : ''}.
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
                  className="py-6 px-4 text-center text-slate-400"
                  role="status"
                  aria-live="polite"
                  data-testid="table-empty-row"
                >
                  Empty series: No Portfolio Value (USDC), Accrued Earnings
                  (USDC), or Net APY (%) records available for this period on{' '}
                  {network}.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={`${row.rawDate}-${row.index}`}
                  className="hover:bg-slate-800/30 transition-colors"
                  data-testid="earnings-apy-table-row"
                >
                  <th
                    scope="row"
                    className="py-3 px-4 font-semibold text-white whitespace-nowrap"
                  >
                    {row.explicitDate}
                  </th>

                  {showEarningsColumns && (
                    <td className="py-3 px-4 text-slate-200 whitespace-nowrap">
                      {formatUsdcExplicit(row.value)}
                    </td>
                  )}

                  {showEarningsColumns && (
                    <td className="py-3 px-4 text-slate-200 whitespace-nowrap">
                      {formatUsdcExplicit(row.yield, true)}
                    </td>
                  )}

                  {showApyColumn && (
                    <td className="py-3 px-4 text-slate-200 whitespace-nowrap">
                      {formatApyExplicit(row.apy)}
                    </td>
                  )}

                  <td className="py-3 px-4 text-slate-400 font-sans">
                    {getRowStatusText(row)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
