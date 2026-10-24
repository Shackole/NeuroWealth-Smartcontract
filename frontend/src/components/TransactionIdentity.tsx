'use client';

import React from 'react';
import { useWalletStore } from '@/lib/walletStore';

interface TransactionIdentityProps {
  publicKey: string;
}

/** Persistent identity context shown beside financial confirmations. */
export function TransactionIdentity({ publicKey }: TransactionIdentityProps) {
  const network = useWalletStore((state) => state.network);
  const networkLabel = network === 'unknown' ? 'Network not confirmed' : network;

  return (
    <section
      aria-label="Transaction account and network"
      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-300">Signing account · Freighter</span>
        <span className="rounded-full border border-slate-600 px-2 py-0.5 font-semibold text-slate-200">
          {networkLabel}
        </span>
      </div>
      <p className="mt-1 break-all font-mono leading-relaxed text-slate-400" title={publicKey}>
        {publicKey}
      </p>
    </section>
  );
}
