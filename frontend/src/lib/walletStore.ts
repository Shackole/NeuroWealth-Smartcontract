'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NetworkType = 'testnet' | 'mainnet' | 'unknown';

export interface WalletState {
  publicKey: string | null;
  network: NetworkType;
  xlmBalance: string | null;
  isConnecting: boolean;
  isFreighterInstalled: boolean;
  networkMismatch: boolean;
  error: string | null;
  /** Changes whenever the account/network context changes. */
  revision: number;

  setPublicKey: (key: string | null) => void;
  setNetwork: (network: NetworkType) => void;
  setXlmBalance: (balance: string | null) => void;
  setIsConnecting: (val: boolean) => void;
  setIsFreighterInstalled: (val: boolean) => void;
  setNetworkMismatch: (val: boolean) => void;
  setError: (err: string | null) => void;
  disconnect: () => void;
}

const EXPECTED_NETWORK: NetworkType =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as NetworkType) ?? 'testnet';

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      publicKey: null,
      network: 'unknown',
      xlmBalance: null,
      isConnecting: false,
      isFreighterInstalled: false,
      networkMismatch: false,
      error: null,
      revision: 0,

      setPublicKey: (key) => set((state) => key === state.publicKey ? {} : ({
        publicKey: key,
        xlmBalance: null,
        error: null,
        revision: state.revision + 1,
      })),
      setNetwork: (network) => set((state) => network === state.network ? {} : ({
        network,
        xlmBalance: null,
        error: null,
        networkMismatch: network !== 'unknown' && network !== EXPECTED_NETWORK,
        revision: state.revision + 1,
      })),
      setXlmBalance: (balance) => set({ xlmBalance: balance }),
      setIsConnecting: (val) => set({ isConnecting: val }),
      setIsFreighterInstalled: (val) => set({ isFreighterInstalled: val }),
      setNetworkMismatch: (val) => set({ networkMismatch: val }),
      setError: (err) => set({ error: err }),

      disconnect: () =>
        set((state) => ({
          publicKey: null,
          xlmBalance: null,
          network: 'unknown',
          networkMismatch: false,
          error: null,
          isConnecting: false,
          revision: state.revision + 1,
        })),
    }),
    {
      name: 'neurowealth-wallet',
      // Only persist the last-used address as a hint for auto-reconnect
      partialize: (state) => ({ publicKey: state.publicKey }),
    }
  )
);
