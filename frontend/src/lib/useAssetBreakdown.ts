'use client';

import useSWR from 'swr';

export interface AssetBreakdownData {
  /** USDC idle in the vault (not deployed), in human-readable USDC (e.g. 100.5) */
  idle: number;
  /** USDC deployed to the active protocol, in human-readable USDC */
  deployed: number;
  /** Total (idle + deployed), convenience field */
  total: number;
  /** Raw bigint values (7-decimal Stellar units) */
  raw: { idle: bigint; deployed: bigint };
  updatedAt: string | null;
  source: string;
}

const DECIMAL_PLACES = 7;
const SCALE = 10 ** DECIMAL_PLACES;

async function fetcher(url: string): Promise<AssetBreakdownData> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Asset breakdown fetch failed: ${res.status}`);
  const json = await res.json() as { idle: string; deployed: string; updatedAt?: string };
  const idle = BigInt(json.idle);
  const deployed = BigInt(json.deployed);
  return {
    idle: Number(idle) / SCALE,
    deployed: Number(deployed) / SCALE,
    total: (Number(idle) + Number(deployed)) / SCALE,
    raw: { idle, deployed },
    updatedAt: json.updatedAt ?? null,
    source: res.headers.get('X-Breakdown-Source') ?? 'Soroban vault RPC',
  };
}

interface UseAssetBreakdownOptions {
  /** Poll interval in ms (default: 30 000 — 30 seconds) */
  refreshInterval?: number;
}

/**
 * Fetches vault asset breakdown from `/api/asset-breakdown` using a single
 * RPC call (`get_asset_breakdown`) instead of two separate calls.
 *
 * This is the frontend companion to Issue #59.
 *
 * @example
 * ```tsx
 * const { idle, deployed, total, isLoading } = useAssetBreakdown();
 * ```
 */
export function useAssetBreakdown(options: UseAssetBreakdownOptions = {}) {
  const { refreshInterval = 30_000 } = options;

  const { data, error, isLoading, isValidating, mutate } = useSWR<AssetBreakdownData>(
    '/api/asset-breakdown',
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  return {
    idle: data?.idle ?? 0,
    deployed: data?.deployed ?? 0,
    total: data?.total ?? 0,
    raw: data?.raw ?? { idle: 0n, deployed: 0n },
    updatedAt: data?.updatedAt ?? null,
    source: data?.source ?? 'Soroban vault RPC',
    hasData: Boolean(data),
    isLoading,
    isValidating,
    error: error ?? null,
    refresh: () => mutate(),
  };
}
