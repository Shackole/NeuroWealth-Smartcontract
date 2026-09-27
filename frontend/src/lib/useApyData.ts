'use client';

import useSWR from 'swr';
import type { ApyData } from '@/app/api/apy/route';

/** How often SWR re-fetches APY data (5 minutes = 300 000 ms) */
const REFRESH_INTERVAL_MS = 300_000;

async function fetcher(url: string): Promise<ApyData> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`APY fetch failed: ${res.status}`);
  }
  return res.json();
}

export interface UseApyDataResult {
  /** Blend protocol APY (percentage) */
  blend: number;
  /** DEX liquidity pool APY (percentage) */
  dex: number;
  /** Currently active vault APY (percentage) */
  current: number;
  /** ISO-8601 timestamp of when the data was last refreshed */
  updatedAt: string | null;
  /** True while the first fetch is in-flight */
  isLoading: boolean;
  /** True when SWR is re-validating in the background */
  isValidating: boolean;
  /** Network or parse error, if any */
  error: Error | null;
  /** Manually trigger an immediate re-fetch */
  refresh: () => void;
}

const DEFAULT_APY: Omit<ApyData, 'updatedAt'> = {
  blend: 5.2,
  dex: 9.1,
  current: 8.4,
};

/**
 * Fetches real-time APY data from /api/apy and auto-refreshes every 5 minutes.
 *
 * - SWR keeps the last-known data visible while re-validating (stale-while-revalidate).
 * - If the backend is unreachable, the cached value is preserved and `error` is set.
 *
 * @example
 * ```tsx
 * const { current, blend, dex, updatedAt, isLoading } = useApyData();
 * ```
 */
export function useApyData(): UseApyDataResult {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApyData>(
    '/api/apy',
    fetcher,
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      // Show stale data while revalidating — never flash a blank screen
      revalidateOnFocus: false,
      // Keep previous value while background-fetching
      keepPreviousData: true,
      // On network error, keep the stale value in `data`
      onErrorRetry: (err, _key, _cfg, revalidate, { retryCount }) => {
        // Exponential back-off capped at 60 s; stop after 5 retries
        if (retryCount >= 5) return;
        setTimeout(() => revalidate({ retryCount }), Math.min(1000 * 2 ** retryCount, 60_000));
      },
    }
  );

  return {
    blend: data?.blend ?? DEFAULT_APY.blend,
    dex: data?.dex ?? DEFAULT_APY.dex,
    current: data?.current ?? DEFAULT_APY.current,
    updatedAt: data?.updatedAt ?? null,
    isLoading,
    isValidating,
    error: error ?? null,
    refresh: () => mutate(),
  };
}
