import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AmountCodecError, formatUnitsToAmount, parseAmountToUnits } from '../src/lib/amountCodec';

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), '../shared/financial-amount-vectors.json'), 'utf8'));

test('frontend amount codec matches the shared exact precision vectors', () => {
  for (const vector of vectors.valid) {
    const units = parseAmountToUnits(vector.input);
    expect(units.toString()).toBe(vector.units);
    expect(parseAmountToUnits(formatUnitsToAmount(units))).toBe(units);
  }
});

test('frontend amount codec returns the shared stable rejection codes', () => {
  for (const vector of vectors.invalid) {
    try {
      parseAmountToUnits(vector.input);
      throw new Error(`Expected ${vector.input} to be rejected`);
    } catch (error) {
      expect(error).toBeInstanceOf(AmountCodecError);
      expect((error as AmountCodecError).code).toBe(vector.code);
    }
  }
});
