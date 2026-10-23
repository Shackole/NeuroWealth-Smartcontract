const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseAmountToUnits, formatUnitsToAmount, AmountCodecError } = require('../dist/amount');

const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/financial-amount-vectors.json'), 'utf8'));

test('vault client amount codec matches shared exact-precision vectors', () => {
  for (const vector of vectors.valid) {
    const units = parseAmountToUnits(vector.input);
    assert.equal(units.toString(), vector.units, `raw units for ${vector.input}`);
    assert.equal(parseAmountToUnits(formatUnitsToAmount(units)), units);
  }
  for (const vector of vectors.invalid) {
    assert.throws(() => parseAmountToUnits(vector.input), (error) => {
      assert.ok(error instanceof AmountCodecError);
      assert.equal(error.code, vector.code);
      return true;
    });
  }
});
