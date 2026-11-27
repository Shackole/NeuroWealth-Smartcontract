'use client';

import { useState } from 'react';

export function AccountAddress({ address }: { address: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');

  async function copyAddress() {
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(address);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div>
      <p className="select-all break-all font-mono text-slate-400">{address}</p>
      <button
        type="button"
        disabled={status === 'copying'}
        onClick={copyAddress}
        className="mt-2 min-h-[32px] rounded px-2 text-emerald-400 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {status === 'failed' ? 'Retry copying address' : status === 'copying' ? 'Copying…' : 'Copy address'}
      </button>
      <p role="status" className="mt-1">
        {status === 'copied' && 'Address copied.'}
        {status === 'failed' && 'Could not copy the address. Retry or select the full address above to copy it manually.'}
      </p>
    </div>
  );
}
