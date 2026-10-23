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

const DECIMALS = 7;
const SCALE = 10_000_000n;
const MAX_I128 = (1n << 127n) - 1n;

export function parseAmountToUnits(input: string): bigint {
  const value = input.trim();
  if (!value) throw new AmountCodecError('EMPTY_AMOUNT');
  if (value.startsWith('-')) throw new AmountCodecError('NEGATIVE_AMOUNT');
  if (!/^\d+(?:\.\d*)?$/.test(value)) throw new AmountCodecError('INVALID_FORMAT');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > DECIMALS) throw new AmountCodecError('TOO_MANY_DECIMALS');
  const units = BigInt(whole) * SCALE + BigInt((fraction + '0'.repeat(DECIMALS)).slice(0, DECIMALS) || '0');
  if (units > MAX_I128) throw new AmountCodecError('AMOUNT_OVERFLOW');
  return units;
}

export function formatUnitsToAmount(units: bigint): string {
  if (units < 0n) throw new AmountCodecError('NEGATIVE_AMOUNT');
  if (units > MAX_I128) throw new AmountCodecError('AMOUNT_OVERFLOW');
  const whole = units / SCALE;
  const fraction = (units % SCALE).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
