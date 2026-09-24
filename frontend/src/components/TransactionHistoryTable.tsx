'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import { getTransactions, type TransactionRecord } from '@/lib/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortenHash(hash: string): string {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function exportToCsv(rows: TransactionRecord[]) {
  const headers = ['Type', 'Amount', 'Asset', 'Strategy', 'Status', 'Date', 'Tx Hash'];
  const lines = rows.map((r) =>
    [r.type, r.amount, r.asset, r.strategy, r.status, r.timestamp, r.txHash].join(',')
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `neurowealth-transactions-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<TransactionRecord['status'], string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function StatusBadge({ status }: { status: TransactionRecord['status'] }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ─── Type Icon ─────────────────────────────────────────────────────────────────

function TypeCell({ type }: { type: TransactionRecord['type'] }) {
  const map = {
    deposit: {
      icon: <ArrowDownLeft size={14} />,
      bg: 'bg-emerald-500/10 text-emerald-400',
    },
    withdrawal: {
      icon: <ArrowUpRight size={14} />,
      bg: 'bg-indigo-500/10 text-indigo-400',
    },
    rebalance: {
      icon: <RefreshCw size={14} />,
      bg: 'bg-amber-500/10 text-amber-400',
    },
  } as const;

  const { icon, bg } = map[type];
  return (
    <div className="flex items-center gap-2">
      <span className={`p-1.5 rounded-lg ${bg}`}>{icon}</span>
      <span className="capitalize font-medium text-slate-200 text-xs">{type}</span>
    </div>
  );
}

// ─── Column definition ─────────────────────────────────────────────────────────

const col = createColumnHelper<TransactionRecord>();

const columns = [
  col.accessor('type', {
    header: 'Type',
    cell: (info) => <TypeCell type={info.getValue()} />,
    enableSorting: false,
  }),
  col.accessor('amount', {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-white transition-colors"
        onClick={() => column.toggleSorting()}
      >
        Amount
        <ArrowUpDown size={12} />
      </button>
    ),
    cell: (info) => (
      <span className="font-semibold text-white font-mono text-xs">
        {info.getValue().toLocaleString()} {info.row.original.asset}
      </span>
    ),
  }),
  col.accessor('strategy', {
    header: 'Strategy',
    cell: (info) => (
      <span className="text-xs text-slate-300">{info.getValue()}</span>
    ),
    enableSorting: false,
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue()} />,
    enableSorting: false,
  }),
  col.accessor('timestamp', {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-white transition-colors"
        onClick={() => column.toggleSorting()}
      >
        Date
        <ArrowUpDown size={12} />
      </button>
    ),
    cell: (info) => (
      <span className="text-xs text-slate-400">{info.getValue()}</span>
    ),
  }),
  col.accessor('txHash', {
    header: 'Explorer',
    cell: (info) => (
      <a
        href={`https://stellar.expert/explorer/testnet/tx/${info.getValue()}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors font-mono text-xs"
        aria-label={`View transaction ${info.getValue()} on Stellar Expert`}
      >
        {shortenHash(info.getValue())}
        <ExternalLink size={12} />
      </a>
    ),
    enableSorting: false,
  }),
];

// ─── Filter Tabs ───────────────────────────────────────────────────────────────

type FilterValue = 'all' | 'deposit' | 'withdrawal' | 'rebalance';

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: 'All', value: 'all' },
  { label: 'Deposits', value: 'deposit' },
  { label: 'Withdrawals', value: 'withdrawal' },
  { label: 'Rebalances', value: 'rebalance' },
];

// ─── Main Component ────────────────────────────────────────────────────────────

interface TransactionHistoryTableProps {
  publicKey: string | null;
}

export const TransactionHistoryTable: React.FC<TransactionHistoryTableProps> = ({
  publicKey,
}) => {
  const [data, setData] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Load transactions whenever wallet connects / changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTransactions(publicKey ?? undefined).then((txs) => {
      if (!cancelled) {
        setData(txs);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // Apply type filter
  const filteredData = useMemo(
    () =>
      activeFilter === 'all' ? data : data.filter((d) => d.type === activeFilter),
    [data, activeFilter]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  // ─── Empty / Loading states ──────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
        <RefreshCw size={32} className="text-slate-700" />
        <p className="text-slate-400 text-sm">
          Connect your wallet to view transaction history.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-8 flex items-center justify-center gap-3">
        <RefreshCw size={20} className="text-emerald-400 animate-spin" />
        <p className="text-slate-400 text-sm">Loading transactions…</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Transaction History
          </h3>
          <p className="text-xs text-slate-400">On-chain Soroban vault events</p>
        </div>
        <button
          onClick={() => exportToCsv(filteredData)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
          aria-label="Export transactions to CSV"
        >
          <Download size={14} />
          CSV
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => {
              setActiveFilter(value);
              table.setPageIndex(0);
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              activeFilter === value
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filteredData.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No transactions match the selected filter.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" role="table">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr
                    key={hg.id}
                    className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider"
                  >
                    {hg.headers.map((header) => (
                      <th key={header.id} className="py-3 px-4 whitespace-nowrap">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-900/40 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-400">
              Page{' '}
              <strong className="text-slate-200">
                {table.getState().pagination.pageIndex + 1}
              </strong>{' '}
              of <strong className="text-slate-200">{table.getPageCount()}</strong>
              {' '}·{' '}
              {filteredData.length} transaction{filteredData.length !== 1 ? 's' : ''}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
