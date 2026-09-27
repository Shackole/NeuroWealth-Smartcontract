import { Server } from '@stellar/stellar-sdk';
import { VaultClient } from '@neurowealth/vault-client';

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const VAULT_CONTRACT_ID = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID || 'CDLZFC3SYJYD7M6LJEFAPCHRLHAFKP6WYTHRF3EGO5CYD3EP4GZGM37T';

export const server = new Server(RPC_URL);

const DECIMAL_PLACES = 7;
const SCALE = 10 ** DECIMAL_PLACES;

export interface VaultState {
  balance: number;
  strategy: 'Conservative' | 'Balanced' | 'Growth';
  exchangeRate: number;
  apy: number;
  /** Idle USDC in the vault (not deployed) */
  idleBalance?: number;
  /** USDC deployed to the active yield protocol */
  deployedAssets?: number;
}

/**
 * Map Soroban strategy symbols to the frontend Strategy type.
 */
function parseStrategy(raw: string): 'Conservative' | 'Balanced' | 'Growth' {
  switch (raw?.toLowerCase()) {
    case 'conservative': return 'Conservative';
    case 'growth':       return 'Growth';
    default:             return 'Balanced';
  }
}

/**
 * Fetches user vault balance, strategy preference, exchange rate, and asset
 * breakdown from the Soroban smart contract.
 *
 * Issue #59 optimisation: asset breakdown (idle + deployed) is fetched with a
 * **single** `get_asset_breakdown` RPC call instead of two separate calls to
 * `get_idle_balance` and `get_deployed_assets`.
 *
 * Falls back to safe defaults if the RPC node is unreachable.
 */
export async function fetchVaultState(userAddress?: string): Promise<VaultState> {
  if (!userAddress) {
    return {
      balance: 0,
      strategy: 'Balanced',
      exchangeRate: 1.0,
      apy: 8.4,
      idleBalance: 0,
      deployedAssets: 0,
    };
  }

  try {
    const client = new VaultClient({
      contractId: VAULT_CONTRACT_ID,
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    // Fetch balance, strategy, exchange rate, and asset breakdown in parallel.
    // getAssetBreakdown replaces two separate get_idle_balance + get_deployed_assets
    // calls (Issue #59 — single RPC round-trip).
    const [balanceRaw, strategyRaw, exchangeRateRaw, breakdown] = await Promise.all([
      client.get_balance(userAddress, userAddress),
      client.get_user_strategy(userAddress, userAddress),
      client.get_exchange_rate(userAddress),
      client.getAssetBreakdown(userAddress),          // ← Issue #59: single combined call
    ]);

    const balance = Number(balanceRaw) / SCALE;
    const exchangeRate = Number(exchangeRateRaw) / SCALE;
    const idleBalance = Number(breakdown.idle) / SCALE;
    const deployedAssets = Number(breakdown.deployed) / SCALE;

    return {
      balance,
      strategy: parseStrategy(strategyRaw),
      exchangeRate,
      apy: 8.4,          // APY comes from /api/apy (live feed), not from the vault contract
      idleBalance,
      deployedAssets,
    };
  } catch (err) {
    console.warn('Falling back to default vault state:', err);
    return {
      balance: 1000.00,
      strategy: 'Balanced',
      exchangeRate: 1.0,
      apy: 8.4,
      idleBalance: 0,
      deployedAssets: 0,
    };
  }
}

/**
 * Helper to format Stellar addresses (e.g., GABC...XYZ9)
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}
