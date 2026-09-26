import { Page } from '@playwright/test';

/**
 * Pre-funded Stellar testnet account address.
 * Testnet funds can be verified or funded via Stellar Friendbot.
 */
export const TESTNET_PREFUNDED_ACCOUNT =
  process.env.STELLAR_TESTNET_ACCOUNT ||
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export interface FreighterMockOptions {
  publicKey?: string;
  autoApprove?: boolean;
}

/**
 * Injects a window.freighter stub into the browser context before page load.
 * This stub mocks the Freighter browser extension API and auto-approves transactions.
 */
export async function injectFreighterMock(
  page: Page,
  options: FreighterMockOptions = {}
): Promise<void> {
  const publicKey = options.publicKey || TESTNET_PREFUNDED_ACCOUNT;
  const autoApprove = options.autoApprove !== false;

  await page.addInitScript(
    ({ mockPublicKey, shouldApprove }) => {
      // Mark test environment for ultra-responsive tests
      (window as any).__PLAYWRIGHT_TEST__ = true;

      // Freighter mock implementation
      const freighterStub = {
        isConnected: async () => true,
        getPublicKey: async () => mockPublicKey,
        requestAccess: async () => mockPublicKey,
        signTransaction: async (xdr: string, opts?: any) => {
          if (!shouldApprove) {
            throw new Error('User declined transaction signing');
          }
          return xdr || 'AAAAAgAAAAD_STELLAR_TESTNET_SIGNED_XDR';
        },
        signBlob: async (blob: string) => blob,
        signAuthEntry: async (entry: string) => entry,
        getNetwork: async () => 'TESTNET',
        getNetworkDetails: async () => ({
          network: 'TESTNET',
          networkUrl: 'https://soroban-testnet.stellar.org',
          networkPassphrase: 'Test SDF Network ; September 2015',
          sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        }),
        isAllowed: async () => true,
        setAllowed: async () => true,
        getUserInfo: async () => ({
          publicKey: mockPublicKey,
        }),
      };

      (window as any).freighter = freighterStub;

      // Handle window.postMessage for @stellar/freighter-api background communication
      window.addEventListener('message', (event) => {
        if (
          event.data &&
          event.data.source === 'FREIGHTER_EXTERNAL_MSG_REQUEST'
        ) {
          const { messageId, type, transactionXdr } = event.data;
          const responsePayload: any = {
            source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE',
            messageId,
            messagedId: messageId,
          };

          if (type === 'REQUEST_CONNECTION_STATUS') {
            responsePayload.isConnected = true;
          } else if (
            type === 'REQUEST_PUBLIC_KEY' ||
            type === 'REQUEST_ACCESS'
          ) {
            responsePayload.publicKey = mockPublicKey;
          } else if (
            type === 'REQUEST_TRANSACTION_SIGN' ||
            type === 'REQUEST_SIGN_TRANSACTION'
          ) {
            if (shouldApprove) {
              responsePayload.signedTransaction =
                transactionXdr || 'AAAAAgAAAAD_STELLAR_TESTNET_SIGNED_XDR';
            } else {
              responsePayload.error = 'User rejected transaction';
            }
          }

          window.postMessage(responsePayload, window.location.origin);
        }
      });
    },
    { mockPublicKey: publicKey, shouldApprove: autoApprove }
  );
}
