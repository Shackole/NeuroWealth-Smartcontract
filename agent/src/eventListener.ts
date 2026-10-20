import { pool } from './db';
import { evaluateYield } from './yieldComparison';
import { processEventForAlerts } from './alertEngine';
import logger from './logger';
import { withRetry } from './retry';
import { rpcCall, getRpcServer } from './rpcClient';

export { pool };
export const server = getRpcServer();

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const PAGE_SIZE = 100;
let eventInterval: ReturnType<typeof setInterval> | null = null;
let pollInProgress = false;

export function stopEventListener() {
  if (eventInterval) clearInterval(eventInterval);
  eventInterval = null;
  logger.info('Event listener stopped');
}

/**
 * Scan events by RPC cursor. Event rows and the cursor are committed together,
 * so a restart can replay a page without repeating its durable event claim.
 */
export async function startEventListener() {
  if (!VAULT_CONTRACT_ID) {
    logger.warn('VAULT_CONTRACT_ID is not set. Event listener requires a contract ID to monitor.');
    return;
  }

  try {
    await ensureEventTables();
    eventInterval = setInterval(() => { void pollEventPages(); }, 5000);
    await pollEventPages();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to initialize event listener');
  }
}

async function ensureEventTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      ledger_sequence BIGINT NOT NULL,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE vault_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_event_checkpoints (
      contract_id TEXT PRIMARY KEY,
      start_ledger BIGINT NOT NULL,
      cursor TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const latest = await withRetry(() => rpcCall((s) => s.getLatestLedger()), 'getLatestLedger');
  // Start at the current ledger for a new installation; thereafter always resume
  // from the last committed RPC cursor and ledger.
  await pool.query(
    'INSERT INTO vault_event_checkpoints (contract_id, start_ledger) VALUES ($1, $2) ON CONFLICT (contract_id) DO NOTHING',
    [VAULT_CONTRACT_ID, latest.sequence],
  );
}

async function pollEventPages() {
  if (pollInProgress) return;
  pollInProgress = true;
  try {
    const checkpoint = await pool.query<{ start_ledger: string; cursor: string | null }>(
      'SELECT start_ledger, cursor FROM vault_event_checkpoints WHERE contract_id = $1',
      [VAULT_CONTRACT_ID],
    );
    if (!checkpoint.rows[0]) throw new Error('Event checkpoint is missing');
    await processPendingEvents();
    await drainEventPages(
      Number(checkpoint.rows[0].start_ledger),
      checkpoint.rows[0].cursor ?? undefined,
      async (startLedger, cursor) => {
        const response = await withRetry(
          () => rpcCall((s) => s.getEvents({
          startLedger,
          ...(cursor ? { cursor } : {}),
          filters: [{ type: 'contract', contractIds: [VAULT_CONTRACT_ID] }],
          limit: PAGE_SIZE,
          })),
          'getEvents',
        );
        const events = response.events.flatMap((event) => {
          const topics = event.topic.map((topic) => topic.toString());
          const eventType = topics.some((topic) => topic.includes('deposit'))
            ? 'deposit'
            : topics.some((topic) => topic.includes('withdraw')) ? 'withdraw' : null;
          return eventType ? [{ eventType, id: event.id, ledger: event.ledger } as const] : [];
        });
        return { events, cursor: response.cursor, pageLength: response.events.length };
      },
      persistEventPage,
      processClaimedEvent,
    );
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Error polling Soroban events');
  } finally {
    pollInProgress = false;
  }
}

/** Cursor loop separated from RPC and storage so pagination/restart behavior can be covered with fixtures. */
export async function drainEventPages<T extends { eventType: 'deposit' | 'withdraw'; id: string; ledger: number }>(
  initialLedger: number,
  initialCursor: string | undefined,
  fetchPage: (ledger: number, cursor?: string) => Promise<{ events: T[]; cursor?: string; pageLength: number }>,
  commitPage: (events: T[], ledger: number, cursor: string | null) => Promise<T[]>,
  processEvent: (event: T) => Promise<void>,
): Promise<void> {
  let ledger = initialLedger;
  let cursor = initialCursor;
  while (true) {
    const page = await fetchPage(ledger, cursor);
    for (const event of page.events) ledger = Math.max(ledger, event.ledger);
    const nextCursor = page.cursor || cursor;
    const newlyCommitted = await commitPage(page.events, ledger, nextCursor ?? null);
    for (const event of newlyCommitted) await processEvent(event);
    if (!page.cursor || page.cursor === cursor || page.pageLength < PAGE_SIZE) return;
    cursor = page.cursor;
  }
}

async function persistEventPage(
  events: Array<{ eventType: 'deposit' | 'withdraw'; id: string; ledger: number }>,
  ledger: number,
  cursor: string | null,
): Promise<Array<{ eventType: 'deposit' | 'withdraw'; id: string; ledger: number }>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const newlyClaimed = [] as Array<{ eventType: 'deposit' | 'withdraw'; id: string; ledger: number }>;
    for (const event of events) {
      const inserted = await client.query(
        'INSERT INTO vault_events (event_id, event_type, ledger_sequence) VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
        [event.id, event.eventType, event.ledger],
      );
      if (inserted.rowCount === 1) newlyClaimed.push(event);
    }
    await client.query(
      'UPDATE vault_event_checkpoints SET start_ledger = GREATEST(start_ledger, $2), cursor = COALESCE($3, cursor), updated_at = NOW() WHERE contract_id = $1',
      [VAULT_CONTRACT_ID, ledger, cursor],
    );
    await client.query('COMMIT');
    return newlyClaimed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function handleClaimedEvent(type: 'deposit' | 'withdraw', id: string, ledger: number) {
  logger.info({ eventType: type, eventId: id, ledger }, 'Detected event');
  if (type === 'deposit') {
    const decision = await evaluateYield('balanced', 'none', 0);
    if (decision.shouldRebalance) logger.info({ targetProtocol: decision.targetProtocol }, 'Rebalance needed');
  }
  await processEventForAlerts({ type, amount: 0, eventId: id, ledger });
}

async function processClaimedEvent(event: { eventType: 'deposit' | 'withdraw'; id: string; ledger: number }) {
  await handleClaimedEvent(event.eventType, event.id, event.ledger);
  await pool.query('UPDATE vault_events SET processed_at = NOW() WHERE event_id = $1 AND processed_at IS NULL', [event.id]);
}

async function processPendingEvents() {
  const pending = await pool.query<{ event_id: string; event_type: 'deposit' | 'withdraw'; ledger_sequence: string }>(
    'SELECT event_id, event_type, ledger_sequence FROM vault_events WHERE processed_at IS NULL ORDER BY ledger_sequence, event_id LIMIT 500',
  );
  for (const event of pending.rows) {
    await processClaimedEvent({ eventType: event.event_type, id: event.event_id, ledger: Number(event.ledger_sequence) });
  }
}
