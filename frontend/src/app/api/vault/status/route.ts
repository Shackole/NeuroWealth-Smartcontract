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
  availability: 'available' | 'unavailable';
  mode: 'normal' | 'pause' | 'emergency' | 'recovery' | 'unknown';
  /** Whether the vault is currently paused */
  paused: boolean;
  deposits_allowed: boolean | null;
  withdrawals_allowed: boolean | null;
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

  if (!agentUrl) return unavailableStatus();
  try {
    const res = await fetch(`${agentUrl}/api/vault/status`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const json = await res.json() as Partial<VaultStatus>;
      const paused = json.paused ?? false;
      const acceptedModes = ['normal', 'pause', 'emergency', 'recovery', 'unknown'] as const;
      const mode = acceptedModes.includes(json.mode as typeof acceptedModes[number])
        ? json.mode as VaultStatus['mode']
        : paused ? 'pause' : 'normal';
      const defaultCapability = paused ? false : mode === 'normal' ? true : null;
      return {
        availability: 'available',
        mode,
        paused,
        deposits_allowed: json.deposits_allowed ?? defaultCapability,
        withdrawals_allowed: json.withdrawals_allowed ?? defaultCapability,
        reason: json.reason ?? null,
        expected_resume: json.expected_resume ?? null,
      };
    }
  } catch {
    // Report unavailable instead of presenting an unverified live state.
  }
  return unavailableStatus();
}

function unavailableStatus(): VaultStatus {
  return {
    availability: 'unavailable',
    mode: 'unknown',
    paused: false,
    deposits_allowed: null,
    withdrawals_allowed: null,
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
    const fallback: VaultStatus = cachedStatus ?? unavailableStatus();
    return NextResponse.json(fallback, {
      status: 200,
      headers: { 'X-Vault-Status-Source': 'fallback-cache' },
    });
  }
}
