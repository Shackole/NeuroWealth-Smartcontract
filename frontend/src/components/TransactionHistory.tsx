'use client';

import React, { useState, useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ExternalLink, Download, Filter, ChevronDown } from 'lucide-react';
import { TransactionRecord } from '@/lib/database';

interface TransactionHistoryProps {
  transactions: TransactionRecord[];
}

type SortField = 'timestamp' | 'amount';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'deposit' | 'withdrawal' | 'rebalance';
const ACTIVITY_COLUMNS = ['Type', 'Amount', 'Asset', 'Tx Hash', 'Date / Time', 'Status'] as const;
const FILTER_CLASS = 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-500';
const DAY_MS = 86_400_000;

function transactionAsset(tx: TransactionRecord): string {
  return tx.asset || 'USDC';
}

type EarningsPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';

function filterTransactions(
  transactions: TransactionRecord[],
  type: FilterType,
  asset: string,
  fromDate: string,
  toDate: string,
): TransactionRecord[] {
  const start = fromDate ? Date.parse(fromDate) : -Infinity;
  const end = toDate ? Date.parse(toDate) + DAY_MS : Infinity;

  return transactions.filter(tx => {
    if (type !== 'all' && tx.type !== type && !(type === 'withdrawal' && tx.type === 'withdraw')) return false;
    if (asset && transactionAsset(tx) !== asset) return false;
    if (!fromDate && !toDate) return true;
    const timestamp = Date.parse(tx.timestamp);
    return timestamp >= start && timestamp < end;
  });
}

function sortTransactions(transactions: TransactionRecord[], field: SortField, direction: SortDirection): TransactionRecord[] {
  return [...transactions].sort((a, b) => {
    let comparison = 0;
    if (field === 'timestamp') {
      comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    } else {
      comparison = a.amount - b.amount;
    }
    return direction === 'asc' ? comparison : -comparison;
  });
}

function calculateEarnings(transactions: TransactionRecord[], period: EarningsPeriod): number {
  const now = new Date();
  let cutoff: Date;

  switch (period) {
    case 'daily':
      cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'yearly':
      cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
    default:
      return transactions
        .filter(tx => tx.type === 'rebalance' || tx.type === 'withdrawal')
        .reduce((sum, tx) => sum + tx.amount, 0);
  }

  return transactions
    .filter(tx => {
      const txDate = new Date(tx.timestamp);
      return txDate >= cutoff && (tx.type === 'rebalance' || tx.type === 'withdrawal');
    })
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function exportToCSV(transactions: TransactionRecord[]): void {
  const rows = transactions.map(tx => [
    tx.type,
    tx.amount.toString(),
    transactionAsset(tx),
    tx.txHash,
    tx.timestamp,
    tx.status,
  ]);

  const csvContent = [ACTIVITY_COLUMNS, ...rows]
    .map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `neurowealth-transactions-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions }) => {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [assetFilter, setAssetFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [earningsPeriod, setEarningsPeriod] = useState<EarningsPeriod>('all');

  const assets = useMemo(() => [...new Set(transactions.map(transactionAsset))].sort(), [transactions]);

  const filteredTransactions = useMemo(() => {
    const filtered = filterTransactions(transactions, typeFilter, assetFilter, fromDate, toDate);
    return sortTransactions(filtered, sortField, sortDirection);
  }, [transactions, typeFilter, assetFilter, fromDate, toDate, sortField, sortDirection]);

  const earnings = useMemo(() => {
    return calculateEarnings(transactions, earningsPeriod);
  }, [transactions, earningsPeriod]);

  if (transactions.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-slate-400 text-sm">
        No transaction history found for this account.
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Transaction History</h3>
          <p className="text-xs text-slate-400">On-chain Soroban vault events</p>
        </div>
        <button
          type="button"
          onClick={() => exportToCSV(filteredTransactions)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-slate-800/30 rounded-xl">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            aria-label="Transaction type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FilterType)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <option value="all">All Types</option>
            <option value="deposit">Deposits</option>
            <option value="withdrawal">Withdrawals</option>
            <option value="rebalance">Rebalances</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Sort:</span>
          <select
            aria-label="Sort transactions"
            value={`${sortField}-${sortDirection}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split('-');
              setSortField(field as SortField);
              setSortDirection(dir as SortDirection);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <option value="timestamp-desc">Newest First</option>
            <option value="timestamp-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
            <option value="amount-asc">Lowest Amount</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          Asset
          <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} className={FILTER_CLASS}>
            <option value="">All assets</option>
            {assets.map(asset => <option key={asset} value={asset}>{asset}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          From (UTC)
          <input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)} className={FILTER_CLASS} />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          To (UTC)
          <input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} className={FILTER_CLASS} />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">Earnings:</span>
          <select
            aria-label="Earnings period"
            value={earningsPeriod}
            onChange={(e) => setEarningsPeriod(e.target.value as EarningsPeriod)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <option value="daily">24h</option>
            <option value="weekly">7d</option>
            <option value="monthly">30d</option>
            <option value="yearly">1y</option>
            <option value="all">All Time</option>
          </select>
          <span className="text-sm font-semibold text-emerald-400">
            {earnings.toLocaleString()} USDC
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {ACTIVITY_COLUMNS.map(column => (
                <th key={column} scope="col" className={`py-3 px-4 ${column === 'Status' ? 'text-right' : ''}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
            {filteredTransactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-900/40 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {tx.type === 'deposit' && (
                      <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <ArrowDownLeft size={14} />
                      </span>
                    )}
                    {tx.type === 'withdrawal' && (
                      <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <ArrowUpRight size={14} />
                      </span>
                    )}
                    {tx.type === 'rebalance' && (
                      <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                        <RefreshCw size={14} />
                      </span>
                    )}
                    <span className="capitalize font-sans font-medium text-slate-200">{tx.type}</span>
                  </div>
                </td>
                <td className="py-3 px-4 font-semibold text-white">
                  {tx.amount.toLocaleString()}
                </td>
                <td className="py-3 px-4">{transactionAsset(tx)}</td>
                <td className="py-3 px-4 text-slate-400">
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-emerald-400 transition-colors"
                  >
                    <span>{tx.txHash}</span>
                    <ExternalLink size={12} />
                  </a>
                </td>
                <td className="py-3 px-4 text-slate-400">{tx.timestamp}</td>
                <td className="py-3 px-4 text-right">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredTransactions.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          No transactions match the selected filter.
        </div>
      )}
    </div>
  );
};
