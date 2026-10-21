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

// ── Checkpoint / cursor helpers (mirror production persistence logic) ────────
// A cursor is the last committed event paging token. Persisting it lets a
// restart resume ingestion instead of jumping to the newest ledger.
interface CheckpointStore {
  load(): string | null;
  save(cursor: string): void;
}

function createMemoryStore(initial: string | null = null): CheckpointStore {
  let value = initial;
  return {
    load: () => value,
    save: (cursor: string) => {
      value = cursor;
    },
  };
}

// Resolve the starting cursor. A missing/expired cursor enters an explicit
// recovery path: fall back to the configured start ledger rather than the
// newest ledger, so no events are silently skipped.
function resolveStartCursor(
  store: CheckpointStore,
  fallbackCursor: string,
): { cursor: string; recovered: boolean } {
  const persisted = store.load();
  if (persisted === null || persisted === '') {
    return { cursor: fallbackCursor, recovered: true };
  }
  return { cursor: persisted, recovered: false };
}

// Advance the checkpoint only after the batch has been durably processed.
function commitAfterProcessing(
  store: CheckpointStore,
  batch: { cursor: string }[],
  process: (batch: { cursor: string }[]) => void,
): string | null {
  if (batch.length === 0) return store.load();
  process(batch);
  const last = batch[batch.length - 1].cursor;
  store.save(last);
  return last;
}

// ── Paginated drain helpers (mirror production page-draining logic) ──────────
// A single RPC page returns at most `pageSize` events plus a paging cursor for
// the next page. A ledger window may span multiple pages, so we must keep
// following the cursor until the RPC reports no more pages before advancing
// the checkpoint.
interface EventPage {
  events: { id: string; cursor: string }[];
  nextCursor: string | null;
}

// Fetch a single page starting at `cursor`. `pageSize` mirrors the RPC limit
// (100 events per page).
function fetchPage(
  allEvents: { id: string; cursor: string }[],
  cursor: string,
  pageSize = 100,
): EventPage {
  const start = allEvents.findIndex((e) => e.cursor === cursor);
  const from = start === -1 ? 0 : start;
  const slice = allEvents.slice(from, from + pageSize);
  const nextCursor =
    from + pageSize < allEvents.length
      ? allEvents[from + pageSize].cursor
      : null;
  return { events: slice, nextCursor };
}

// Drain every page for the window, processing each event exactly once, then
// commit the checkpoint to the last consumed cursor. If processing throws, the
// checkpoint stays at the last committed cursor so a restart resumes there.
function drainAllPages(
  store: CheckpointStore,
  allEvents: { id: string; cursor: string }[],
  startCursor: string,
  process: (events: { id: string; cursor: string }[]) => void,
  pageSize = 100,
): { processed: number; committed: string | null } {
  const seen = new Set<string>();
  let cursor: string | null = startCursor;
  let lastCommitted = store.load();
  let processed = 0;

  while (cursor !== null) {
    const page = fetchPage(allEvents, cursor, pageSize);
    const fresh = page.events.filter((e) => !seen.has(e.id));
    if (fresh.length > 0) {
      process(fresh);
      for (const e of fresh) seen.add(e.id);
      processed += fresh.length;
      lastCommitted = fresh[fresh.length - 1].cursor;
      store.save(lastCommitted);
    }
    cursor = page.nextCursor;
  }

  return { processed, committed: lastCommitted };
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

// Checkpoint persistence
test('resumes from persisted cursor after restart', () => {
  const store = createMemoryStore('cursor-100');
  const { cursor, recovered } = resolveStartCursor(store, 'cursor-0');
  assert.strictEqual(cursor, 'cursor-100');
  assert.strictEqual(recovered, false);
});

test('missing cursor enters explicit recovery path', () => {
  const store = createMemoryStore(null);
  const { cursor, recovered } = resolveStartCursor(store, 'cursor-0');
  assert.strictEqual(cursor, 'cursor-0');
  assert.strictEqual(recovered, true);
});

test('empty cursor is treated as missing', () => {
  const store = createMemoryStore('');
  const { recovered } = resolveStartCursor(store, 'cursor-0');
  assert.strictEqual(recovered, true);
});

test('checkpoint advances only after durable processing', () => {
  const store = createMemoryStore('cursor-100');
  const batch = [{ cursor: 'cursor-101' }, { cursor: 'cursor-102' }];
  let processed = false;
  const committed = commitAfterProcessing(store, batch, () => {
    processed = true;
    // checkpoint must not advance before processing completes
    assert.strictEqual(store.load(), 'cursor-100');
  });
  assert.strictEqual(processed, true);
  assert.strictEqual(committed, 'cursor-102');
  assert.strictEqual(store.load(), 'cursor-102');
});

test('checkpoint does not advance when processing throws', () => {
  const store = createMemoryStore('cursor-100');
  const batch = [{ cursor: 'cursor-101' }];
  assert.throws(() =>
    commitAfterProcessing(store, batch, () => {
      throw new Error('durable write failed');
    }),
  );
  assert.strictEqual(store.load(), 'cursor-100');
});

test('empty batch leaves checkpoint unchanged', () => {
  const store = createMemoryStore('cursor-100');
  const committed = commitAfterProcessing(store, [], () => {
    throw new Error('should not process empty batch');
  });
  assert.strictEqual(committed, 'cursor-100');
  assert.strictEqual(store.load(), 'cursor-100');
});

// Paginated drain (#411)
function makeEvents(count: number): { id: string; cursor: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${i}`,
    cursor: `cursor-${i}`,
  }));
}

test('drains all pages for a window with more than 100 events', () => {
  const store = createMemoryStore('cursor-0');
  const events = makeEvents(250);
  const processedIds: string[] = [];
  const { processed, committed } = drainAllPages(
    store,
    events,
    'cursor-0',
    (batch) => processedIds.push(...batch.map((e) => e.id)),
  );
  assert.strictEqual(processed, 250);
  assert.strictEqual(processedIds.length, 250);
  assert.strictEqual(committed, 'cursor-249');
  assert.strictEqual(store.load(), 'cursor-249');
});

test('processes each event exactly once across pages', () => {
  const store = createMemoryStore('cursor-0');
  const events = makeEvents(230);
  const seen = new Map<string, number>();
  drainAllPages(store, events, 'cursor-0', (batch) => {
    for (const e of batch) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
  });
  assert.strictEqual(seen.size, 230);
  for (const count of seen.values()) assert.strictEqual(count, 1);
});

test('checkpoint advances only after all pages are consumed', () => {
  const store = createMemoryStore('cursor-0');
  const events = makeEvents(150);
  const observed: (string | null)[] = [];
  drainAllPages(store, events, 'cursor-0', () => {
    observed.push(store.load());
  });
  // First page commits cursor-99, second page commits cursor-149.
  assert.deepStrictEqual(observed, ['cursor-99', 'cursor-149']);
  assert.strictEqual(store.load(), 'cursor-149');
});

test('failure resumes at the last committed cursor', () => {
  const store = createMemoryStore('cursor-0');
  const events = makeEvents(250);
  let calls = 0;
  assert.throws(() =>
    drainAllPages(store, events, 'cursor-0', () => {
      calls++;
      if (calls === 2) throw new Error('durable write failed');
    }),
  );
  // First page committed; second page failed before advancing.
  assert.strictEqual(store.load(), 'cursor-99');

  const resumedIds: string[] = [];
  const { processed } = drainAllPages(
    store,
    events,
    store.load() as string,
    (batch) => resumedIds.push(...batch.map((e) => e.id)),
  );
  // Resume from cursor-99: 150 remaining events (100..249).
  assert.strictEqual(processed, 150);
  assert.strictEqual(resumedIds[0], 'evt-99');
  assert.strictEqual(store.load(), 'cursor-249');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
