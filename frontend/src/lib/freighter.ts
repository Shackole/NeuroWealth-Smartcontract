import {
  isConnected as checkFreighterConnected,
  getPublicKey as getFreighterPublicKey,
  signTransaction as signFreighterTx,
  getNetwork as getFreighterNetwork,
} from '@stellar/freighter-api';
import type { NetworkType } from './walletStore';

export interface FreighterWalletState {
  isConnected: boolean;
  publicKey: string | null;
  error: string | null;
}

/**
 * Checks if Freighter extension is installed in the user's browser.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    // getPublicKey throws or returns empty if not installed;
    // isConnected returns false/true depending on approval state.
    const result = await checkFreighterConnected();
    return typeof result === 'boolean';
  } catch {
    return false;
  }
}

/**
 * Detects the network currently selected in Freighter.
 */
export async function getFreighterNetworkType(): Promise<NetworkType> {
  try {
    const net = await getFreighterNetwork();
    // Freighter returns e.g. "TESTNET", "PUBLIC", "STANDALONE" etc.
    if (typeof net === 'string') {
      const normalized = net.toLowerCase();
      if (normalized.includes('test') || normalized.includes('testnet')) return 'testnet';
      if (normalized.includes('public') || normalized.includes('mainnet')) return 'mainnet';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Requests wallet connection from Freighter and returns the active public key.
 * Non-custodial signing model - private keys never enter web app.
 */
export async function connectFreighterWallet(): Promise<{
  publicKey: string | null;
  network: NetworkType;
  error: string | null;
}> {
  try {
    const installed = await isFreighterInstalled();
    if (!installed) {
      return {
        publicKey: null,
        network: 'unknown',
        error: 'not_installed',
      };
    }

    const key = await getFreighterPublicKey();
    if (!key) {
      return { publicKey: null, network: 'unknown', error: 'no_key' };
    }

    const network = await getFreighterNetworkType();

    return { publicKey: key, network, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to connect Freighter wallet:', message);
    return { publicKey: null, network: 'unknown', error: message };
  }
}

/**
 * Signs a XDR transaction string using Freighter extension.
 */
export async function signWithFreighter(
  xdr: string,
  networkPassphrase?: string
): Promise<string | null> {
  try {
    const signedXdr = await signFreighterTx(xdr, {
      networkPassphrase:
        networkPassphrase ?? 'Test SDF Network ; September 2015',
    });
    return signedXdr;
  } catch (err) {
    console.error('User rejected or failed transaction signing:', err);
    return null;
  }
}

/**
 * Fetch the native XLM balance for a Stellar address using the Horizon REST API.
 * Returns "—" on failure so the UI always has something to display.
 */
export async function fetchXlmBalance(publicKey: string): Promise<string> {
  try {
    const horizon =
      process.env.NEXT_PUBLIC_HORIZON_URL ??
      'https://horizon-testnet.stellar.org';
    const response = await fetch(`${horizon}/accounts/${publicKey}`);
    if (!response.ok) return '—';
    const data: { balances?: Array<{ asset_type: string; balance: string }> } =
      await response.json();
    const native = data.balances?.find((b) => b.asset_type === 'native');
    if (!native) return '0';
    return parseFloat(native.balance).toFixed(2);
  } catch {
    return '—';
  }
}
