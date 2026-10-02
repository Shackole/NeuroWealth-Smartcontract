import { NextResponse } from 'next/server';

/**
 * GET /api/vault/status
 *
 * Returns the current pause state of the vault smart contract.
 * Polled every 30 seconds by the client-side VaultPauseBanner.
 *
 * Shape:
 *   { paused: boolean; reason: string | null; expected_resume: string | null }
 */

export interface VaultStatus {
  /** Whether the vault is currently paused */
  paused: boolean;
  /** Human-readable reason for the pause, or null when not paused */
  reason: string | null;
  /**
   * ISO-8601 datetime of expected resumption, or null.
   * Example: "2026-09-30T12:00:00.000Z"
   */
  expected_resume: string | null;
}

// Server-side cache — avoids hammering the RPC on every poll from every client
let cachedStatus: VaultStatus | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000;

async function fetchVaultStatus(): Promise<VaultStatus> {
  const agentUrl = process.env.AGENT_METRICS_URL;

  if (agentUrl) {
    try {
      const res = await fetch(`${agentUrl}/api/vault/status`, {
        next: { revalidate: 30 },
      });
      if (res.ok) {
        const json = await res.json() as Partial<VaultStatus>;
        return {
          paused: json.paused ?? false,
          reason: json.reason ?? null,
          expected_resume: json.expected_resume ?? null,
        };
      }
    } catch {
      // fall through to default
    }
  }

  // Default: vault is live
  return {
    paused: false,
    reason: null,
    expected_resume: null,
  };
}

export async function GET() {
  try {
    const now = Date.now();
    if (!cachedStatus || now > cacheExpiry) {
      cachedStatus = await fetchVaultStatus();
      cacheExpiry = now + CACHE_TTL_MS;
    }

    return NextResponse.json(cachedStatus, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[/api/vault/status] Failed to fetch vault status:', err);
    const fallback: VaultStatus = cachedStatus ?? {
      paused: false,
      reason: null,
      expected_resume: null,
    };
    return NextResponse.json(fallback, {
      status: 200,
      headers: { 'X-Vault-Status-Source': 'fallback-cache' },
    });
  }
}
