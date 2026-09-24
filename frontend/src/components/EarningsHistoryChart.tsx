'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
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
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, BarChart2 } from 'lucide-react';
import { getEarningsHistory, type EarningsDataPoint } from '@/lib/database';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Stable QueryClient (created once per page load; avoids reinit on re-renders)
const qc = new QueryClient();

// ─── Time range config ─────────────────────────────────────────────────────────
type Range = '1D' | '7D' | '1M' | '3M' | 'All';

const RANGES: { label: Range; days: number | null }[] = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'All', days: null },
];

function filterByRange(data: EarningsDataPoint[], days: number | null): EarningsDataPoint[] {
  if (days === null) return data;
  const cutoff = Date.now() - days * 86_400_000;
  return data.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
}

function formatDate(iso: string, range: Range): string {
  const d = new Date(iso);
  if (range === '1D') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-2xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="font-bold text-emerald-400 font-mono">
        +{Number(value).toFixed(4)} USDC
      </p>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <BarChart2 size={40} className="text-slate-700" />
      <p className="text-slate-400 text-sm font-medium">No earnings history yet</p>
      <p className="text-slate-500 text-xs max-w-xs">
        Deposit USDC and let the AI agent start generating yield. Your earnings
        chart will appear here once the vault starts accruing returns.
      </p>
    </div>
  );
}

// ─── Chart inner (consumes query result) ─────────────────────────────────────
interface ChartInnerProps {
  publicKey: string | null;
}

function ChartInner({ publicKey }: ChartInnerProps) {
  const [range, setRange] = React.useState<Range>('1M');

  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['earnings-history', publicKey],
    queryFn: () => getEarningsHistory(publicKey ?? undefined),
    staleTime: 5 * 60 * 1000, // 5 min cache as per spec
    enabled: !!publicKey,
  });

  const rangeObj = RANGES.find((r) => r.label === range)!;

  const chartData = useMemo(() => {
    const filtered = filterByRange(rawData, rangeObj.days);
    return filtered.map((d) => ({
      date: formatDate(d.timestamp, range),
      balance: d.balance,
    }));
  }, [rawData, rangeObj.days, range]);

  const totalEarnings =
    chartData.length > 0 ? chartData[chartData.length - 1].balance : 0;

  return (
    <div className="glass-panel rounded-2xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} className="text-emerald-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              Earnings History
            </h3>
          </div>
          <p className="text-xs text-slate-400">Cumulative USDC yield over time</p>
          {!isLoading && rawData.length > 0 && (
            <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-2">
              +{totalEarnings.toFixed(4)} USDC
            </p>
          )}
        </div>

        {/* Time range buttons */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {RANGES.map(({ label }) => (
            <button
              key={label}
              onClick={() => setRange(label)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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

      {/* Chart body */}
      {!publicKey ? (
        <EmptyState />
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64 gap-3">
          <div className="h-5 w-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Loading earnings data…</p>
        </div>
      ) : chartData.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.div
          key={range}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="h-72 w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
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
                tickFormatter={(v) => `${Number(v).toFixed(2)}`}
                label={{
                  value: 'USDC',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 12,
                  fill: '#475569',
                  fontSize: 11,
                }}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="balance"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#earningsGradient)"
                dot={false}
                activeDot={{ r: 5, fill: '#10b981', stroke: '#064e3b' }}
                name="Cumulative Earnings"
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </div>
  );
}

// ─── Public export — wraps with QueryClientProvider ───────────────────────────
interface EarningsHistoryChartProps {
  publicKey: string | null;
}

export const EarningsHistoryChart: React.FC<EarningsHistoryChartProps> = ({
  publicKey,
}) => (
  <QueryClientProvider client={qc}>
    <ChartInner publicKey={publicKey} />
  </QueryClientProvider>
);
