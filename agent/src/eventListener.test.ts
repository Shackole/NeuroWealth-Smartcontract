/**
 * Unit tests for the Stellar vault event listener (#26)
 * Fully standalone — no live Redis / DB / Stellar SDK needed.
 */

import assert from 'assert';

// ── Event topic constants (mirrors topics.rs symbol_short! values) ────────────
const EVENT_TOPICS = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  REBALANCE: 'rebalance',
  HARVEST: 'harvest',
  PAUSED: 'paused',
  UNPAUSED: 'unpaused',
  UPGRADE_SCHEDULED: 'upg_sched',
  EMERGENCY_PAUSED: 'emerg',
  REBALANCE_FAILED: 'reb_fail',
  COMPOUND: 'compound',
} as const;

type VaultEventType = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];

// ── Mirror the production classifyEvent function ──────────────────────────────
function classifyEvent(topics: string[]): VaultEventType | null {
  for (const topic of topics) {
    if (topic.includes(EVENT_TOPICS.DEPOSIT)) return EVENT_TOPICS.DEPOSIT;
    if (topic.includes(EVENT_TOPICS.WITHDRAW)) return EVENT_TOPICS.WITHDRAW;
    if (
      topic.includes(EVENT_TOPICS.REBALANCE) &&
      !topic.includes('fail') &&
      !topic.includes('cd')
    )
      return EVENT_TOPICS.REBALANCE;
    if (topic.includes(EVENT_TOPICS.HARVEST)) return EVENT_TOPICS.HARVEST;
    if (topic.includes(EVENT_TOPICS.UPGRADE_SCHEDULED))
      return EVENT_TOPICS.UPGRADE_SCHEDULED;
    if (topic.includes(EVENT_TOPICS.EMERGENCY_PAUSED))
      return EVENT_TOPICS.EMERGENCY_PAUSED;
    if (topic.includes(EVENT_TOPICS.UNPAUSED)) return EVENT_TOPICS.UNPAUSED;
    if (topic.includes(EVENT_TOPICS.PAUSED)) return EVENT_TOPICS.PAUSED;
    if (topic.includes(EVENT_TOPICS.REBALANCE_FAILED))
      return EVENT_TOPICS.REBALANCE_FAILED;
    if (topic.includes(EVENT_TOPICS.COMPOUND)) return EVENT_TOPICS.COMPOUND;
  }
  return null;
}

// ── Exponential back-off helper (mirrors production logic) ───────────────────
function computeBackoffMs(attempt: number, baseMs = 2000, maxMs = 60000): number {
  return Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', (err as Error).message);
    failed++;
  }
}

console.log('\nEvent Listener — unit tests\n');

// Topic classification
test('classifies deposit topic', () => {
  assert.strictEqual(classifyEvent(['deposit', 'GABC…']), 'deposit');
});

test('classifies withdraw topic', () => {
  assert.strictEqual(classifyEvent(['withdraw', 'GABC…']), 'withdraw');
});

test('classifies rebalance topic', () => {
  assert.strictEqual(classifyEvent(['rebalance']), 'rebalance');
});

test('classifies harvest topic', () => {
  assert.strictEqual(classifyEvent(['harvest']), 'harvest');
});

test('classifies paused topic', () => {
  assert.strictEqual(classifyEvent(['paused']), 'paused');
});

test('classifies unpaused topic', () => {
  assert.strictEqual(classifyEvent(['unpaused']), 'unpaused');
});

test('classifies upgrade_scheduled topic (upg_sched)', () => {
  assert.strictEqual(classifyEvent(['upg_sched']), 'upg_sched');
});

test('classifies emergency paused topic (emerg)', () => {
  assert.strictEqual(classifyEvent(['emerg']), 'emerg');
});

test('classifies rebalance_failed topic (reb_fail)', () => {
  assert.strictEqual(classifyEvent(['reb_fail']), 'reb_fail');
});

test('classifies compound topic', () => {
  assert.strictEqual(classifyEvent(['compound']), 'compound');
});

test('returns null for unknown topic', () => {
  assert.strictEqual(classifyEvent(['own_init', 'GABC…']), null);
});

test('returns null for empty topics array', () => {
  assert.strictEqual(classifyEvent([]), null);
});

test('prefers deposit over withdraw when both present', () => {
  assert.strictEqual(classifyEvent(['deposit', 'withdraw']), 'deposit');
});

test('does not confuse rebalance_cooldown (reb_cd) with rebalance', () => {
  assert.notStrictEqual(classifyEvent(['reb_cd']), 'rebalance');
});

// Back-off logic
test('back-off doubles on each attempt', () => {
  assert.strictEqual(computeBackoffMs(1), 2000);
  assert.strictEqual(computeBackoffMs(2), 4000);
  assert.strictEqual(computeBackoffMs(3), 8000);
});

test('back-off is capped at maxMs', () => {
  assert.strictEqual(computeBackoffMs(100), 60000);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
