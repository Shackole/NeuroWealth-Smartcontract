import { useWalletStore } from '../walletStore';

describe('wallet account context', () => {
  it('clears account-scoped balance and errors when the connected account changes', () => {
    useWalletStore.getState().setPublicKey('GACCOUNTONE');
    useWalletStore.getState().setXlmBalance('12.5');
    useWalletStore.getState().setError('old account error');
    const before = useWalletStore.getState().revision;

    useWalletStore.getState().setPublicKey('GACCOUNTTWO');

    const state = useWalletStore.getState();
    expect(state.publicKey).toBe('GACCOUNTTWO');
    expect(state.xlmBalance).toBeNull();
    expect(state.error).toBeNull();
    expect(state.revision).toBe(before + 1);
  });

  it('clears private account state when disconnected', () => {
    useWalletStore.getState().setPublicKey('GACCOUNTONE');
    useWalletStore.getState().setNetwork('testnet');
    useWalletStore.getState().setXlmBalance('12.5');

    useWalletStore.getState().disconnect();

    const state = useWalletStore.getState();
    expect(state.publicKey).toBeNull();
    expect(state.xlmBalance).toBeNull();
    expect(state.network).toBe('unknown');
    expect(state.networkMismatch).toBe(false);
  });
});
