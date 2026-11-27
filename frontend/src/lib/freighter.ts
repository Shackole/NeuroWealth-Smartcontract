import {
  isConnected as checkFreighterConnected,
  requestAccess as requestFreighterAccess,
  signTransaction as signFreighterTx
} from '@stellar/freighter-api';

export interface FreighterWalletState {
  isConnected: boolean;
  publicKey: string | null;
  error: string | null;
}

/**
 * Checks if Freighter extension (or mock) is installed in the user's browser.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && (window as any).freighter) {
      const f = (window as any).freighter;
      if (typeof f.isConnected === 'function') {
        return Boolean(await f.isConnected());
      }
      return true;
    }
    return await checkFreighterConnected();
  } catch (err) {
    return false;
  }
}

export const FREIGHTER_TIMEOUT_MESSAGE =
  'Freighter took too long to respond. Open or enable the extension, then try again.';

async function waitForFreighter(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function detect(): Promise<boolean> {
    while (!stopped) {
      if (await isFreighterInstalled()) return true;
      if (!stopped) await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  try {
    return await Promise.race([
      detect(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 5000);
      }),
    ]);
  } finally {
    stopped = true;
    clearTimeout(timer);
  }
}

/**
 * Requests wallet access once the extension responds and returns the active public key.
 */
export async function connectFreighterWallet(
  onDetection?: (status: 'pending' | 'timeout' | 'ready') => void,
): Promise<string | null> {
  onDetection?.('pending');
  if (!(await waitForFreighter())) {
    onDetection?.('timeout');
    return null;
  }

  onDetection?.('ready');
  try {
    if (typeof window !== 'undefined' && (window as any).freighter) {
      const f = (window as any).freighter;
      if (typeof f.getPublicKey === 'function') {
        const key = await f.getPublicKey();
        if (key) return key;
      }
      if (typeof f.requestAccess === 'function') {
        const key = await f.requestAccess();
        if (key) return key;
      }
    }

    const key = await requestFreighterAccess();
    return key || null;
  } catch (err: any) {
    console.error('Failed to connect Freighter wallet:', err);
    return null;
  }
}

/**
 * Signs a XDR transaction string using Freighter extension.
 */
export async function signWithFreighter(xdr: string, networkPassphrase?: string): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && (window as any).freighter) {
      const f = (window as any).freighter;
      if (typeof f.signTransaction === 'function') {
        const signed = await f.signTransaction(xdr, {
          networkPassphrase: networkPassphrase || 'Test SDF Network ; September 2015'
        });
        if (signed) return signed;
      }
    }

    const signedXdr = await signFreighterTx(xdr, {
      networkPassphrase: networkPassphrase || 'Test SDF Network ; September 2015'
    });
    return signedXdr;
  } catch (err) {
    console.error('User rejected or failed transaction signing:', err);
    return null;
  }
}
