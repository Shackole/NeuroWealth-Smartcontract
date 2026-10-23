'use client';

import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { TrendingUp, BarChart2 } from 'lucide-react';
import { getEarningsHistory, type EarningsDataPoint } from '@/lib/database';

// ─── Time range config ─────────────────────────────────────────────────────────
type Range = '1D' | '7D' | '1M' | '3M' | 'All';
type SortField = 'date' | 'balance' | 'apy';
type SortDirection = 'asc' | 'desc';

const RANGES: { label: Range; days: number | null }[] = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'All', days: null },
];

function filterByRange(data: EarningsDataPoint[], days: number | null): EarningsDataPoint[] {
  if (days === null || data.length === 0) return data;
  const latestTimestamp = Math.max(...data.map((d) => new Date(d.timestamp).getTime()));
  const cutoff = latestTimestamp - days * 86_400_000;
  return data.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
}

function formatDateExplicitUtc(iso: string, range: Range): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${iso} (UTC)`;
  if (range === '1D') {
    return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
  return `${d.toISOString().slice(0, 10)} UTC`;
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  payload?: Array<{ value?: number }>;
  label?: string;
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-2xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="font-bold text-emerald-400 font-mono">
        +${Number(value).toFixed(4)} USDC
      </p>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-48 gap-3 text-center rounded-xl border border-slate-800 bg-slate-950/40 p-4"
      role="status"
      aria-live="polite"
    >
      <BarChart2 size={36} className="text-slate-600" aria-hidden="true" />
      <p className="text-slate-300 text-sm font-medium">
        No earnings history available (0.0000 USDC)
      </p>
      <p className="text-slate-400 text-xs max-w-md">
        {isConnected
          ? 'Deposit USDC on Stellar Testnet and let the AI agent start generating yield. Your cumulative USDC earnings and APY (%) series will appear here and in the table below.'
          : 'Wallet authorization required: connect your Stellar wallet to load account-specific cumulative USDC earnings and APY (%) history.'}
      </p>
    </div>
  );
}

export interface EarningsHistoryChartProps {
  publicKey: string | null;
  /** Optional pre-loaded series (for deterministic rendering or testing) */
  initialData?: EarningsDataPoint[];
  /** Marks the series as unavailable (e.g. indexer / RPC failure) */
  isUnavailable?: boolean;
  /** Reason shown when series is unavailable */
  unavailableReason?: string;
  /** Explicit network identity (default: 'Stellar Testnet') */
  network?: string;
}

export const EarningsHistoryChart: React.FC<EarningsHistoryChartProps> = ({
  publicKey,
  initialData,
  isUnavailable = false,
  unavailableReason,
  network = 'Stellar Testnet',
}) => {
  const [range, setRange] = useState<Range>('1M');
  const [rawData, setRawData] = useState<EarningsDataPoint[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  React.useEffect(() => {
    if (initialData !== undefined) {
      setRawData(initialData);
      return;
    }
    if (!publicKey) {
      setRawData([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);
    getEarningsHistory(publicKey)
      .then((res) => {
        if (!cancelled) {
          setRawData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : 'Unable to load earnings history'
          );
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, initialData]);

  const rangeObj = RANGES.find((r) => r.label === range)!;
  const effectiveUnavailable = isUnavailable || Boolean(fetchError);

  const chartData = useMemo(() => {
    if (effectiveUnavailable) return [];
    const filtered = filterByRange(rawData, rangeObj.days);
    return filtered.map((d, index) => ({
      index,
      timestamp: d.timestamp,
      date: formatDateExplicitUtc(d.timestamp, range),
      balance: d.balance,
      apy: typeof d.apy === 'number' && Number.isFinite(d.apy) ? d.apy : null,
    }));
  }, [rawData, rangeObj.days, range, effectiveUnavailable]);

  const sortedRows = useMemo(() => {
    const copy = [...chartData];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        cmp = a.index - b.index;
      } else if (sortField === 'balance') {
        cmp = a.balance - b.balance;
      } else {
        const aApy = a.apy ?? -Infinity;
        const bApy = b.apy ?? -Infinity;
        cmp = aApy - bApy;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [chartData, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const totalEarnings =
    chartData.length > 0 ? chartData[chartData.length - 1].balance : 0;
  const minEarnings =
    chartData.length > 0 ? Math.min(...chartData.map((d) => d.balance)) : 0;
  const maxEarnings =
    chartData.length > 0 ? Math.max(...chartData.map((d) => d.balance)) : 0;
  const validApys = chartData
    .map((d) => d.apy)
    .filter((v): v is number => v !== null);
  const latestApy = validApys.length > 0 ? validApys[validApys.length - 1] : null;

  const canRenderRecharts =
    typeof window !== 'undefined' && typeof window.ResizeObserver !== 'undefined';

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} className="text-emerald-400" aria-hidden="true" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              Earnings History ({range})
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Cumulative USDC yield and APY (%) over time on {network} (UTC dates)
          </p>
          {!isLoading && !effectiveUnavailable && chartData.length > 0 && (
            <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-2">
              +${totalEarnings.toFixed(4)} USDC
            </p>
          )}
        </div>

        {/* Time range buttons */}
        <div
          className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800"
          role="group"
          aria-label="Earnings history time range"
        >
          {RANGES.map(({ label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setRange(label)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                range === label
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              aria-pressed={range === label}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Explicit Text Summary */}
      <div
        role="group"
        aria-label="Cumulative earnings chart text summary"
        className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 text-xs text-slate-300 space-y-1.5"
      >
        {effectiveUnavailable ? (
          <p role="status" aria-live="polite" className="text-amber-300">
            Unavailable series on {network}:{' '}
            {unavailableReason ||
              fetchError ||
              'Cumulative earnings (USDC) and APY (%) series could not be loaded.'}
          </p>
        ) : chartData.length === 0 ? (
          <p role="status" aria-live="polite">
            Empty series on {network} for range {range}: 0 data points (0.0000 USDC).{' '}
            {publicKey
              ? 'No yield events recorded in this window.'
              : 'Connect and authorize a Stellar wallet to query personal earnings.'}
          </p>
        ) : (
          <p>
            Range <strong>{range}</strong> on <strong>{network}</strong> (
            {chartData[0].date} to {chartData[chartData.length - 1].date}): Cumulative
            Earnings reached <strong>+${totalEarnings.toFixed(4)} USDC</strong> (min{' '}
            <strong>+${minEarnings.toFixed(4)} USDC</strong>, max{' '}
            <strong>+${maxEarnings.toFixed(4)} USDC</strong>)
            {latestApy !== null
              ? `, with latest Net APY at ${latestApy.toFixed(2)}% APY.`
              : ', with Net APY series unavailable (% APY).'}
          </p>
        )}
      </div>

      {/* Chart body */}
      {effectiveUnavailable ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200"
        >
          Earnings chart visualization is currently unavailable on {network}. Refer to
          the tabular record below.
        </div>
      ) : !publicKey && chartData.length === 0 ? (
        <EmptyState isConnected={false} />
      ) : isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3" role="status">
          <div className="h-5 w-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Loading earnings data (USDC)…</p>
        </div>
      ) : chartData.length === 0 ? (
        <EmptyState isConnected={true} />
      ) : (
        <div
          className="h-72 w-full"
          role="img"
          aria-label={`Cumulative earnings chart in USDC for range ${range} on ${network}`}
        >
          {canRenderRecharts ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                <XAxis
                  dataKey="date"
                  stroke="#475569"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />

                <YAxis
                  stroke="#475569"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                />

                <Tooltip content={<CustomTooltip />} />

                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#earningsGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#2563eb', stroke: '#1e3a8a' }}
                  name="Cumulative Earnings (USDC)"
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      )}

      {/* Accessible Data Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table
          className="w-full text-left text-xs text-slate-200"
          aria-label="Cumulative earnings and APY history table"
        >
          <caption className="px-4 py-2 text-left text-[11px] text-slate-400 bg-slate-950/50 border-b border-slate-800">
            Cumulative Earnings (USDC) and Net APY (%) for range {range} on {network}.
          </caption>
          <thead className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-300 border-b border-slate-800 font-mono">
            <tr>
              <th scope="col" aria-sort={getAriaSort('date')} className="py-2.5 px-4">
                <button
                  type="button"
                  onClick={() => handleSort('date')}
                  className="inline-flex items-center gap-1 font-semibold hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
                >
                  <span>Date (UTC)</span>
                  <span aria-hidden="true">
                    {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
              <th scope="col" aria-sort={getAriaSort('balance')} className="py-2.5 px-4">
                <button
                  type="button"
                  onClick={() => handleSort('balance')}
                  className="inline-flex items-center gap-1 font-semibold hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
                >
                  <span>Cumulative Earnings (USDC)</span>
                  <span aria-hidden="true">
                    {sortField === 'balance' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
              <th scope="col" aria-sort={getAriaSort('apy')} className="py-2.5 px-4">
                <button
                  type="button"
                  onClick={() => handleSort('apy')}
                  className="inline-flex items-center gap-1 font-semibold hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded px-1"
                >
                  <span>Net APY (% Annualized)</span>
                  <span aria-hidden="true">
                    {sortField === 'apy' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {effectiveUnavailable ? (
              <tr>
                <td colSpan={3} className="py-4 px-4 text-center text-amber-300">
                  Unavailable series: Cumulative Earnings (USDC) and Net APY (%) could
                  not be loaded on {network}.
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 px-4 text-center text-slate-400">
                  Empty series: No Cumulative Earnings (USDC) or Net APY (%) records for
                  range {range} on {network}.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={`${row.timestamp}-${row.index}`}>
                  <th scope="row" className="py-2.5 px-4 font-semibold text-white">
                    {row.date}
                  </th>
                  <td className="py-2.5 px-4 text-slate-200">
                    +${row.balance.toFixed(4)} USDC
                  </td>
                  <td className="py-2.5 px-4 text-slate-200">
                    {row.apy !== null ? `${row.apy.toFixed(2)}% APY` : 'Unavailable (% APY)'}
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
