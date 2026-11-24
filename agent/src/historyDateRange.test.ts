import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseHistoryDateRange } from './historyDateRange';

it('accepts both inclusive size boundaries', () => {
  assert.deepEqual(parseHistoryDateRange('2024-02-29', '2024-02-29'), {
    kind: 'explicit', startDate: '2024-02-29', endDate: '2024-02-29',
  });
  assert.deepEqual(parseHistoryDateRange('2025-01-01', '2025-12-31'), {
    kind: 'explicit', startDate: '2025-01-01', endDate: '2025-12-31',
  });
});

it('rejects oversized, reversed, incomplete and invalid date ranges', () => {
  assert.deepEqual(parseHistoryDateRange('2025-01-01', '2026-01-01'), { kind: 'invalid' });
  assert.deepEqual(parseHistoryDateRange('2025-01-02', '2025-01-01'), { kind: 'invalid' });
  assert.deepEqual(parseHistoryDateRange('2025-01-02', undefined), { kind: 'invalid' });
  assert.deepEqual(parseHistoryDateRange('2025-02-29', '2025-03-01'), { kind: 'invalid' });
  assert.deepEqual(parseHistoryDateRange(undefined, undefined), { kind: 'default' });
});
