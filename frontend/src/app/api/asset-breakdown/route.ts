import { NextResponse } from 'next/server';
import { VaultClient } from '@neurowealth/vault-client';

/**
 * GET /api/asset-breakdown
 *
 * Returns the vault's idle and deployed USDC balances in a single RPC call
 * by using the contract's `get_asset_breakdown` function.
 *
 * This avoids two separate RPC round-trips that would be needed when calling
 * `get_idle_balance` + `get_deployed_assets` individually — the on-chain
 * optimisation described in Issue #59.
 *
 * Response shape:
 *   { idle: string, deployed: string, total: string, updatedAt: string }
 *
 * All amounts are raw i128 values (7 decimal places).
 * 1 USDC = 10_000_000 raw units.
 */

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const VAULT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID ?? 'CDLZFC3SYJYD7M6LJEFAPCHRLHAFKP6WYTHRF3EGO5CYD3EP4GZGM37T';
const SERVICE_PUBLIC_KEY =
  process.env.SERVICE_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID ?? '';

// Server-side cache — avoids hitting the RPC node on every SWR tick
let cachedBreakdown: { idle: bigint; deployed: bigint } | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 15_000; // 15 seconds

async function fetchBreakdown(): Promise<{ idle: bigint; deployed: bigint }> {
  const client = new VaultClient({
    contractId: VAULT_CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Single RPC call — replaces the two-call pattern (Issue #59)
  const breakdown = await client.getAssetBreakdown(SERVICE_PUBLIC_KEY);
  return breakdown;
}

export async function GET() {
  try {
    const now = Date.now();

    if (!cachedBreakdown || now > cacheExpiry) {
      cachedBreakdown = await fetchBreakdown();
      cacheExpiry = now + CACHE_TTL_MS;
    }

    const { idle, deployed } = cachedBreakdown;
    const total = idle + deployed;

    return NextResponse.json(
      {
        idle: idle.toString(),
        deployed: deployed.toString(),
        total: total.toString(),
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[/api/asset-breakdown] Failed to fetch asset breakdown:', err);

    // Return stale cache if available; otherwise a safe zero default
    if (cachedBreakdown) {
      const { idle, deployed } = cachedBreakdown;
      return NextResponse.json(
        {
          idle: idle.toString(),
          deployed: deployed.toString(),
          total: (idle + deployed).toString(),
          updatedAt: new Date(0).toISOString(),
        },
        {
          status: 200,
          headers: { 'X-Breakdown-Source': 'fallback-cache' },
        }
      );
    }

    // Hard fallback — all zeros
    return NextResponse.json(
      { idle: '0', deployed: '0', total: '0', updatedAt: new Date(0).toISOString() },
      { status: 200, headers: { 'X-Breakdown-Source': 'zero-default' } }
    );
  }
}
