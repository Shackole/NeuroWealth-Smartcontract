import { useState, useEffect, useCallback, useId } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { VaultClient } from '@neurowealth/vault-client';

type Range = '1D' | '1W' | '1M' | '3M' | 'ALL';

const RANGES: { value: Range; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: 'ALL', label: 'ALL' },
];

function generateMockData(range: Range) {
  const now = new Date();
  const points: { date: string; value: number; earnings: number }[] = [];
  const count = range === '1D' ? 24 : range === '1W' ? 7 : range === '1M' ? 30 : range === '3M' ? 90 : 180;

  let value = 10000;
  for (let i = count; i >= 0; i--) {
    const d = new Date(now);
    if (range === '1D') d.setHours(d.getHours() - i);
    else d.setDate(d.getDate() - i);
    const dateStr = range === '1D'
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });

    const change = Math.random() * 100 - 30;
    value = Math.max(1000, value + change);
    const earnings = Math.random() * 20;

    points.push({ date: dateStr, value: Number(value.toFixed(2)), earnings: Number(earnings.toFixed(2)) });
  }
  return points;
}

function formatUsdc(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EarningsHistoryPage() {
  const [range, setRange] = useState<Range>('1M');
  const [data, setData] = useState(() => generateMockData(range));
  const [cumulative, setCumulative] = useState<number>(0);
  const [busd, setBUsd] = useState<number>(0);
  const headingId = useId();
  const publicKey = '';

  const [client] = useState(() => new VaultClient({ contractId: '' }));

  const refresh = useCallback(async () => {
    try {
      const [ta] = await Promise.all([client.get_total_assets(publicKey).catch(() => 0n)]);
      const current = Number(ta);
      setBUsd(current);
      if (data.length > 0) {
        const start = data[0].value;
        setCumulative(Number((current - start).toFixed(2)));
      }
    } catch {
      // ignore
    }
  }, [client, publicKey, data]);

  useEffect(() => {
    const next = generateMockData(range);
    setData(next);
    if (next.length > 0) setBUsd(next[next.length - 1].value);
  }, [range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="max-w-5xl mx-auto" aria-labelledby={headingId}>
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 id={headingId} className="text-2xl font-semibold text-vault-text">Earnings History</h2>
        <div className="inline-flex rounded-md shadow-sm" role="group" aria-label="History range">
          {RANGES.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={`px-3 py-1.5 text-sm font-medium border ${
                range === r.value
                  ? 'bg-vault-accent text-vault-on-accent border-vault-accent'
                  : 'bg-vault-surface text-vault-muted border-vault-control-border hover:bg-vault-canvas'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-vault-surface rounded-lg shadow-sm border border-vault-border p-4">
          <div className="text-sm text-vault-muted">Current value</div>
          <div className="text-2xl font-semibold text-vault-text">{formatUsdc(busd)} USDC</div>
        </div>
        <div className="bg-vault-surface rounded-lg shadow-sm border border-vault-border p-4">
          <div className="text-sm text-vault-muted">Cumulative earnings</div>
          <div className="text-2xl font-semibold text-vault-success">{formatUsdc(Math.max(0, cumulative))} USDC</div>
        </div>
        <div className="bg-vault-surface rounded-lg shadow-sm border border-vault-border p-4">
          <div className="text-sm text-vault-muted">Benchmark APY</div>
          <div className="text-2xl font-semibold text-vault-text">~8.5%</div>
        </div>
      </div>

      <div className="bg-vault-surface rounded-lg shadow-sm border border-vault-border p-4 mb-6">
        <h3 className="text-lg font-medium text-vault-text mb-4">Portfolio value</h3>
        <div
          className="h-72"
          role="img"
          aria-label="Line chart of portfolio value over the selected range"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: '0.75rem' }} />
              <YAxis tick={{ fontSize: '0.75rem' }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="var(--vault-accent, #1d4ed8)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Portfolio value by date</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value (USDC)</th>
            </tr>
          </thead>
          <tbody>
            {data.map(point => (
              <tr key={`value-${point.date}`}>
                <td>{point.date}</td>
                <td>{formatUsdc(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-vault-surface rounded-lg shadow-sm border border-vault-border p-4">
        <h3 className="text-lg font-medium text-vault-text mb-4">Daily earnings</h3>
        <div
          className="h-72"
          role="img"
          aria-label="Bar chart of daily earnings over the selected range"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: '0.75rem' }} />
              <YAxis tick={{ fontSize: '0.75rem' }} />
              <Tooltip />
              <Bar dataKey="earnings" fill="var(--vault-success, #166534)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Daily earnings by date</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Earnings (USDC)</th>
            </tr>
          </thead>
          <tbody>
            {data.map(point => (
              <tr key={`earn-${point.date}`}>
                <td>{point.date}</td>
                <td>{formatUsdc(point.earnings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
