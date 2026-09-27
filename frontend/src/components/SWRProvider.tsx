'use client';

import { SWRConfig } from 'swr';
import React from 'react';

interface SWRProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app in a global SWR configuration.
 *
 * - Shared fetch function used by all SWR hooks.
 * - Sets global error handler so unhandled SWR errors are logged once.
 * - Does NOT override per-hook config (hooks can still override these defaults).
 */
export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        fetcher: async (url: string) => {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            const err = new Error(`Fetch failed: ${res.status} ${res.statusText}`);
            throw err;
          }
          return res.json();
        },
        // Keep stale data visible during re-validation
        revalidateOnFocus: false,
        shouldRetryOnError: true,
        errorRetryCount: 3,
        onError: (err: Error) => {
          console.warn('[SWR] Unhandled error:', err.message);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
