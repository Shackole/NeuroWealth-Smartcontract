import { NextResponse } from 'next/server';

/**
 * GET /api/stats
 *
 * Returns platform-level statistics for the public landing page.
 * Responses are revalidated every 60 seconds (ISR-compatible).
 *
 * Shape: { tvl: number; avgApy: number; users: number; updatedAt: string }
 */

export interface PlatformStats {
  /** Total value locked in USDC */
  tvl: number;
  /** Platform-wide average APY (percentage, e.g. 8.4 = 8.4%) */
  avgApy: number;
  /** Number of active vault users */
  users: number;
  /** ISO-8601 timestamp */
  updatedAt: string;
}

// Server-side cache (shared across concurrent requests within same instance)
let cachedStats: PlatformStats | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

async function fetchStats(): Promise<PlatformStats> {
  const agentUrl = process.env.AGENT_METRICS_URL;

  if (agentUrl) {
    try {
      const res = await fetch(`${agentUrl}/api/metrics/snapshot`, {
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const json = await res.json() as {
          totalValueLocked?: number;
          averageApy?: number;
          activeUsers?: number;
        };
        return {
          tvl: json.totalValueLocked ?? 2_840_000,
          avgApy: json.averageApy ?? 8.4,
          users: json.activeUsers ?? 1247,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // fall through to static fallback
    }
  }

  // Demo / fallback values
  return {
    tvl: 2_840_000,
    avgApy: 8.4,
    users: 1247,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const now = Date.now();
    if (!cachedStats || now > cacheExpiry) {
      cachedStats = await fetchStats();
      cacheExpiry = now + CACHE_TTL_MS;
    }

    return NextResponse.json(cachedStats, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[/api/stats] Failed to fetch stats:', err);
    const fallback: PlatformStats = cachedStats ?? {
      tvl: 2_840_000,
      avgApy: 8.4,
      users: 1247,
      updatedAt: new Date(0).toISOString(),
    };
    return NextResponse.json(fallback, {
      status: 200,
      headers: { 'X-Stats-Source': 'fallback-cache' },
    });
  }
}
