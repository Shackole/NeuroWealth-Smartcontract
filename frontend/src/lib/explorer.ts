import { Networks } from '@stellar/stellar-sdk';

const selectedNetwork =
  process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE ||
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ||
  'testnet';

/** Returns a Stellar Expert URL for a valid transaction hash on a supported network. */
export function getExplorerUrl(
  txHash: string | null | undefined,
  network = selectedNetwork,
): string | undefined {
  if (txHash?.length !== 64 || !/^[0-9a-f]+$/i.test(txHash)) return undefined;

  const name = network.trim().toLowerCase();
  switch (name) {
    case 'mainnet':
    case 'stellar mainnet':
    case 'public':
    case Networks.PUBLIC.toLowerCase():
      return `https://stellar.expert/explorer/public/tx/${txHash}`;
    case 'testnet':
    case 'stellar testnet':
    case Networks.TESTNET.toLowerCase():
      return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    default:
      return undefined;
  }
}
