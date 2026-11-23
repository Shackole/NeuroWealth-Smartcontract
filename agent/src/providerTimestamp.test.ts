import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderTimestamp } from './providerTimestamp';

test('normalizes offsets and epoch milliseconds to the same instant', () => {
  const expected = Date.UTC(2026, 0, 1, 1, 30);
  for (const value of [expected, '2026-01-01T01:30:00Z', '2026-01-01T07:00:00+05:30', '2025-12-31T20:30:00-05:00']) {
    assert.equal(normalizeProviderTimestamp(value), expected);
  }
});

test('rejects malformed timestamps and observations without a usable time', () => {
  for (const value of [undefined, null, '', NaN, Infinity, '2026-01-01', '2026-01-01T01:30:00',
    '2026-02-30T01:30:00Z', '2026-01-01T01:30:00+24:00', 'invalid']) {
    assert.equal(normalizeProviderTimestamp(value), undefined);
  }
});
