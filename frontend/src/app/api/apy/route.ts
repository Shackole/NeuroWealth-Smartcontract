import { NextResponse } from 'next/server';

/**
 * GET /api/apy
 *
 * Returns real-time APY data for each yield protocol and the vault's
 * currently active strategy.
 *
 * Response shape:
 *   { blend: number, dex: number, current: number, updatedAt: string }
 *
 * In production the agent backend / Blend / DEX adapters would be queried.
 * The static values below are replaced by live calls once the backend
 * yield-aggregator endpoint is wired up.
 */

export interface ApyData {
  /** Blend protocol APY (percentage, e.g. 5.2 = 5.2%) */
  blend: number;
  /** DEX liquidity pool APY */
  dex: number;
  /** Currently deployed strategy APY (whichever protocol is active) */
  current: number;
  /** ISO-8601 timestamp of when this data was last refreshed */
  updatedAt: string;
}

// Cache so parallel SWR requests in the same second return the same value
let cachedData: ApyData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute server-side cache

async function fetchLiveApyData(): Promise<ApyData> {
  // -------------------------------------------------------------------
  // TODO: Replace this stub with real calls to the Blend APY endpoint
  //       and the DEX pool stats once the backend aggregator is live.
  //       Example:
  //         const blend = await fetchBlendApy(process.env.BLEND_POOL_ADDRESS);
  //         const dex   = await fetchDexApy(process.env.DEX_POOL_ADDRESS);
  // -------------------------------------------------------------------

  const agentMetricsUrl = process.env.AGENT_METRICS_URL;

  if (agentMetricsUrl) {
    const res = await fetch(`${agentMetricsUrl}/apy`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const json = await res.json() as { blend?: number; dex?: number; current?: number };
      return {
        blend: json.blend ?? 5.2,
        dex: json.dex ?? 9.1,
        current: json.current ?? 8.4,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // Fallback / demo values that match the README strategy ranges
  return {
    blend: 5.2,
    dex: 9.1,
    current: 8.4,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const now = Date.now();

    if (!cachedData || now > cacheExpiry) {
      cachedData = await fetchLiveApyData();
      cacheExpiry = now + CACHE_TTL_MS;
    }

    return NextResponse.json(cachedData, {
      headers: {
        // Allow the CDN / browser to cache for up to 60 s
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[/api/apy] Failed to fetch APY data:', err);

    // Return stale cache if we have it, else a safe default
    const fallback: ApyData = cachedData ?? {
      blend: 5.2,
      dex: 9.1,
      current: 8.4,
      updatedAt: new Date(0).toISOString(), // epoch signals "stale"
    };

    return NextResponse.json(fallback, {
      status: 200, // still 200 so the client shows cached data
      headers: { 'X-APY-Source': 'fallback-cache' },
    });
  }
}
