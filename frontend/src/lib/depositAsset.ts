export const DEPOSIT_ASSET = 'USDC';

export function getDepositAsset(value: unknown): typeof DEPOSIT_ASSET | '' {
  return typeof value === 'string' && value.toUpperCase() === DEPOSIT_ASSET
    ? DEPOSIT_ASSET
    : '';
}
