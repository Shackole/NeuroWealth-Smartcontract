export const AMOUNT_DECIMALS = 7;
export const AMOUNT_SCALE = 10n ** BigInt(AMOUNT_DECIMALS);
export const MAX_I128 = (1n << 127n) - 1n;

export type AmountErrorCode =
  | 'EMPTY_AMOUNT'
  | 'INVALID_FORMAT'
  | 'NEGATIVE_AMOUNT'
  | 'TOO_MANY_DECIMALS'
  | 'AMOUNT_OVERFLOW';

export class AmountCodecError extends Error {
  constructor(public readonly code: AmountErrorCode) {
    super(code);
    this.name = 'AmountCodecError';
  }
}

/** Convert a plain decimal token amount into seven-place native units exactly. */
export function parseAmountToUnits(input: string): bigint {
  const value = input.trim();
  if (!value) throw new AmountCodecError('EMPTY_AMOUNT');
  if (value.startsWith('-')) throw new AmountCodecError('NEGATIVE_AMOUNT');
  if (!/^\d+(?:\.\d*)?$/.test(value)) throw new AmountCodecError('INVALID_FORMAT');

  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > AMOUNT_DECIMALS) throw new AmountCodecError('TOO_MANY_DECIMALS');
  const units = BigInt(whole) * AMOUNT_SCALE + BigInt((fraction + '0'.repeat(AMOUNT_DECIMALS)).slice(0, AMOUNT_DECIMALS) || '0');
  if (units > MAX_I128) throw new AmountCodecError('AMOUNT_OVERFLOW');
  return units;
}

/** Format native units without converting through JavaScript Number. */
export function formatUnitsToAmount(units: bigint): string {
  if (units < 0n) throw new AmountCodecError('NEGATIVE_AMOUNT');
  if (units > MAX_I128) throw new AmountCodecError('AMOUNT_OVERFLOW');
  const whole = units / AMOUNT_SCALE;
  const fraction = (units % AMOUNT_SCALE).toString().padStart(AMOUNT_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
