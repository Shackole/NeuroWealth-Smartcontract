'use client';

import React from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ExternalLink } from 'lucide-react';
import { TransactionRecord } from '@/lib/database';

export interface TransactionTableProps {
  transactions?: TransactionRecord[];
  onOpenExplorer?: (hash: string) => void;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions = [],
  onOpenExplorer
}) => {
  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'deposit':
        return <ArrowDownLeft size={16} className="text-emerald-400" aria-hidden="true" />;
      case 'withdraw':
        return <ArrowUpRight size={16} className="text-indigo-400" aria-hidden="true" />;
      case 'rebalance':
        return <RefreshCw size={16} className="text-amber-400" aria-hidden="true" />;
      default:
        return <ArrowDownLeft size={16} className="text-slate-400" aria-hidden="true" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Transaction History</h3>
          <p className="text-xs text-slate-400">On-chain vault operations recorded on Stellar testnet</p>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Total: {transactions.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left text-sm text-slate-200" aria-label="Transaction History">
          <caption className="sr-only">Detailed list of vault deposit, withdraw, and rebalance transactions</caption>
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-mono">
            <tr>
              <th scope="col" className="py-3 px-4">Type</th>
              <th scope="col" className="py-3 px-4">Amount</th>
              <th scope="col" className="py-3 px-4">Protocol / Target</th>
              <th scope="col" className="py-3 px-4">Timestamp</th>
              <th scope="col" className="py-3 px-4">Status</th>
              <th scope="col" className="py-3 px-4 text-right">Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500" aria-live="polite">
                  No transactions found for this account.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-800">
                        {getIcon(tx.type)}
                      </div>
                      <span className="capitalize">{tx.type}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-white font-bold">
                    {tx.type === 'withdraw' ? '-' : '+'}{tx.amount.toFixed(2)} USDC
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 capitalize">
                    {tx.protocol || 'Vault'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">
                    {new Date(tx.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => onOpenExplorer && onOpenExplorer(tx.tx_hash)}
                      aria-label={`View transaction ${tx.tx_hash.slice(0, 8)} on explorer`}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors text-xs font-mono"
                    >
                      <span>{tx.tx_hash.slice(0, 6)}...{tx.tx_hash.slice(-4)}</span>
                      <ExternalLink size={12} aria-hidden="true" />
                    </button>
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
