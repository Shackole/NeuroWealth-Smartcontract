import { pool } from './db';
import { evaluateYield } from './yieldComparison';
import { processEventForAlerts } from './alertEngine';
import logger from './logger';
import { withRetry } from './retry';
import { rpcCall, getRpcServer } from './rpcClient';
import { chooseStartLedger, eventRequestPosition, isHistoricalRangeUnavailable, nextLedgerAfterWindow, parseVaultEvent, RpcVaultEvent } from './eventCursor';

export { pool };

/** Convenience re-export for callers that still reference `server` directly. */
export const server = getRpcServer();

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const POLL_INTERVAL_MS = 5000;
const EVENT_LIMIT = 100;

let eventInterval: ReturnType<typeof setInterval> | null = null;
let activePoll: Promise<void> | null = null;

export function stopEventListener() {
  if (eventInterval) {
    clearInterval(eventInterval);
    eventInterval = null;
    logger.info('Event listener stopped');
  }
}

interface EventCheckpoint {
  nextLedger: number;
  cursor: string | null;
  recoveryRequired: boolean;
}

async function loadCheckpoint(): Promise<EventCheckpoint | null> {
  if (!process.env.DATABASE_URL) return null;
  const result = await pool.query(
    'SELECT next_ledger, pagination_cursor, recovery_required FROM event_listener_checkpoints WHERE network = $1 AND contract_id = $2',
    [NETWORK, VAULT_CONTRACT_ID],
  );
  const row = result.rows[0];
  return row ? { nextLedger: Number(row.next_ledger), cursor: row.pagination_cursor, recoveryRequired: row.recovery_required } : null;
}

async function saveCheckpoint(nextLedger: number, recoveryRequired = false, cursor: string | null = null): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await pool.query(
    `INSERT INTO event_listener_checkpoints (network, contract_id, next_ledger, pagination_cursor, recovery_required, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (network, contract_id) DO UPDATE SET
       next_ledger = EXCLUDED.next_ledger,
       pagination_cursor = EXCLUDED.pagination_cursor,
       recovery_required = event_listener_checkpoints.recovery_required OR EXCLUDED.recovery_required,
       updated_at = NOW()`,
    [NETWORK, VAULT_CONTRACT_ID, nextLedger, cursor, recoveryRequired],
  );
}

async function logEventToDb(type: string, eventId: string, ledger: number): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await pool.query(
    `INSERT INTO vault_events (event_id, event_type, ledger_sequence, created_at)
     VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
    [eventId, type, ledger],
  );
}

async function processValidEvent(event: { eventType: 'deposit' | 'withdraw'; id: string; ledger: number }) {
  await logEventToDb(event.eventType, event.id, event.ledger);
  if (event.eventType === 'deposit') {
    const decision = await evaluateYield('balanced', 'none', 0);
    if (decision.shouldRebalance) logger.info({ targetProtocol: decision.targetProtocol }, 'Rebalance needed');
  }
  await processEventForAlerts({ type: event.eventType, amount: 150000 });
}

/**
 * Polls from a durable network/contract checkpoint. Malformed events are logged
 * and skipped individually; failures processing valid events leave the cursor
 * before that ledger so the event can be replayed on the next poll.
 */
export async function startEventListener() {
  if (eventInterval) return;
  if (!VAULT_CONTRACT_ID) {
    logger.warn('VAULT_CONTRACT_ID is not set. Event listener requires a contract ID to monitor.');
    return;
  }
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is not set. Event listener requires durable checkpoints before it can start.');
    return;
  }

  try {
    const [latest, checkpoint] = await Promise.all([
      withRetry(() => rpcCall((s) => s.getLatestLedger()), 'getLatestLedger'),
      loadCheckpoint(),
    ]);
    let nextLedger = chooseStartLedger(latest.sequence, checkpoint?.nextLedger);
    let paginationCursor = checkpoint?.cursor ?? null;
    if (checkpoint?.recoveryRequired) {
      logger.error({ network: NETWORK, contractId: VAULT_CONTRACT_ID, nextLedger }, 'Event history recovery is still required');
    }
    await saveCheckpoint(nextLedger, false, paginationCursor);
    logger.info({ nextLedger, resumed: !!checkpoint }, 'Starting event listener');

    const poll = async () => {
      if (activePoll) return activePoll;
      activePoll = (async () => {
        try {
          const raw = await withRetry(
            () => rpcCall((s) => s.getEvents({
              ...eventRequestPosition(nextLedger, paginationCursor, EVENT_LIMIT),
              filters: [{ type: 'contract', contractIds: [VAULT_CONTRACT_ID] }],
            })),
            'getEvents',
          );
          const response = raw as unknown as { events?: RpcVaultEvent[]; latestLedger?: number; oldestLedger?: number };
          const events = Array.isArray(response.events) ? response.events : [];

          if (Number.isSafeInteger(response.oldestLedger) && Number(response.oldestLedger) > nextLedger) {
            const oldest = Number(response.oldestLedger);
            paginationCursor = null;
            await saveCheckpoint(oldest, true, paginationCursor);
            logger.error({ requestedLedger: nextLedger, oldestAvailableLedger: oldest, network: NETWORK }, 'EVENT_HISTORY_EXPIRED: recovery required');
            nextLedger = oldest;
          }

          let processingFailed = false;
          for (const rawEvent of events) {
            const event = parseVaultEvent(rawEvent);
            if (!event) {
              logger.warn({ eventId: rawEvent?.id, ledger: rawEvent?.ledger }, 'Skipping malformed or unsupported vault event');
              if (typeof rawEvent?.id === 'string') {
                paginationCursor = rawEvent.id;
                await saveCheckpoint(nextLedger, false, paginationCursor);
              }
              continue;
            }
            try {
              await processValidEvent(event);
              nextLedger = Math.max(nextLedger, event.ledger);
              paginationCursor = event.id;
              await saveCheckpoint(nextLedger, false, paginationCursor);
            } catch (error) {
              processingFailed = true;
              logger.error({ eventId: event.id, ledger: event.ledger, error: error instanceof Error ? error.message : error }, 'Vault event processing failed; checkpoint retained for replay');
              break;
            }
          }

          if (!processingFailed) {
            if (events.length >= EVENT_LIMIT && response.cursor) {
              paginationCursor = response.cursor;
              await saveCheckpoint(nextLedger, false, paginationCursor);
              return;
            }
            const advanced = nextLedgerAfterWindow(nextLedger, events, response.latestLedger);
            if (advanced > nextLedger) {
              nextLedger = advanced;
            }
            paginationCursor = null;
            await saveCheckpoint(nextLedger, false, paginationCursor);
          }
        } catch (error) {
          if (isHistoricalRangeUnavailable(error)) {
            const expiredFrom = nextLedger;
            try {
              const latest = await withRetry(() => rpcCall((s) => s.getLatestLedger()), 'getLatestLedger after expired history');
              nextLedger = latest.sequence;
              paginationCursor = null;
              await saveCheckpoint(nextLedger, true, paginationCursor);
              logger.error({ requestedLedger: expiredFrom, latestLedger: latest.sequence, network: NETWORK }, 'EVENT_HISTORY_EXPIRED: checkpoint moved to current history; operator recovery required');
            } catch (recoveryError) {
              logger.error({ requestedLedger: expiredFrom, error: recoveryError instanceof Error ? recoveryError.message : recoveryError }, 'Event history expired and the current ledger could not be loaded; checkpoint retained');
            }
          } else {
            logger.error({ error: error instanceof Error ? error.message : error }, 'Error polling Soroban events');
          }
        }
      })().finally(() => { activePoll = null; });
      return activePoll;
    };

    eventInterval = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    void poll();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to initialize event listener');
  }
}
