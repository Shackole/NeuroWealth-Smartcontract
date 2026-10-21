import { pool } from './db';
import { evaluateYield } from './yieldComparison';
import { processEventForAlerts } from './alertEngine';
import logger from './logger';
import { withRetry } from './retry';
import { rpcCall, getRpcServer } from './rpcClient';

export { pool };

/** Convenience re-export for callers that still reference `server` directly. */
export const server = getRpcServer();

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';

/**
 * How far back to look when no durable checkpoint exists yet. Soroban RPC
 * retains events for a limited window; if the persisted cursor is older than
 * the oldest ledger the RPC still serves, we fall back to this window and log
 * an explicit recovery warning instead of silently skipping events.
 */
const DEFAULT_LOOKBACK_LEDGERS = Number(process.env.EVENT_LOOKBACK_LEDGERS || 1000);

let eventInterval: ReturnType<typeof setInterval> | null = null;

export function stopEventListener() {
  if (eventInterval) {
    clearInterval(eventInterval);
    eventInterval = null;
    logger.info('Event listener stopped');
  }
}

/**
 * Listens for on-chain deposit and withdraw events from the vault contract.
 * Detects new deposits within 5 seconds and triggers yield deployment.
 *
 * The last committed cursor is persisted so restarts resume ingestion from
 * where they left off rather than only from the newest ledger.
 */
export async function startEventListener() {
  if (!VAULT_CONTRACT_ID) {
    logger.warn('VAULT_CONTRACT_ID is not set. Event listener requires a contract ID to monitor.');
    return;
  }

  try {
    const latestLedgerResponse = await withRetry(
      () => rpcCall((s) => s.getLatestLedger()),
      'getLatestLedger',
    );
    const latestLedger = latestLedgerResponse.sequence;

    let startLedger = await resolveStartLedger(latestLedger);
    logger.info({ startLedger, latestLedger }, 'Starting event listener');

    eventInterval = setInterval(async () => {
      try {
        const response = await withRetry(
          () => rpcCall((s) => s.getEvents({
            startLedger,
            filters: [
              {
                type: 'contract',
                contractIds: [VAULT_CONTRACT_ID],
              }
            ],
            limit: 100,
          })),
          'getEvents',
        );

        for (const event of response.events) {
          const topics = event.topic.map(t => t.toString());
          let eventType = '';

          if (topics.some(t => t.includes('deposit'))) {
            eventType = 'deposit';
          } else if (topics.some(t => t.includes('withdraw'))) {
            eventType = 'withdraw';
          }

          if (!eventType) continue;

          logger.info({ eventType, ledger: event.ledger }, 'Detected event');

          await logEventToDb(eventType, event.id, event.ledger);

          if (eventType === 'deposit') {
            logger.info('New deposit detected, evaluating yield');
            const userStrategy = 'balanced';
            const currentProtocol = 'none';

            const decision = await evaluateYield(userStrategy, currentProtocol, 0);

            if (decision.shouldRebalance) {
              logger.info({ targetProtocol: decision.targetProtocol }, 'Rebalance needed');
            }
          }

          const alertPayload = { type: eventType, amount: 150000 };
          await processEventForAlerts(alertPayload);

          // Advance the cursor only after the event has been durably processed.
          startLedger = Math.max(startLedger, event.ledger + 1);
          await persistCheckpoint(startLedger);
        }
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : error }, 'Error polling Soroban events');
      }
    }, 5000);

  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to initialize event listener');
  }
}

/**
 * Resolve the ledger to resume ingestion from. Prefers the persisted
 * checkpoint; falls back to a bounded lookback window when no checkpoint
 * exists or the stored cursor is older than the RPC retention window.
 */
async function resolveStartLedger(latestLedger: number): Promise<number> {
  const checkpoint = await loadCheckpoint();

  if (checkpoint === null) {
    const fallback = Math.max(1, latestLedger - DEFAULT_LOOKBACK_LEDGERS);
    logger.warn(
      { startLedger: fallback, latestLedger },
      'No event ingestion checkpoint found; recovering with bounded lookback window',
    );
    return fallback;
  }

  if (checkpoint > latestLedger) {
    logger.warn(
      { checkpoint, latestLedger },
      'Persisted checkpoint is ahead of latest ledger; resetting to latest ledger',
    );
    return latestLedger;
  }

  if (checkpoint < latestLedger - DEFAULT_LOOKBACK_LEDGERS) {
    const fallback = Math.max(1, latestLedger - DEFAULT_LOOKBACK_LEDGERS);
    logger.warn(
      { checkpoint, startLedger: fallback, latestLedger },
      'Persisted checkpoint is older than the RPC retention window; recovering with bounded lookback',
    );
    return fallback;
  }

  return checkpoint;
}

async function loadCheckpoint(): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const result = await pool.query(
      'SELECT last_ledger FROM event_ingestion_checkpoint WHERE id = $1',
      ['vault'],
    );
    if (result.rows.length === 0) return null;
    const value = Number(result.rows[0].last_ledger);
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to load event ingestion checkpoint');
    return null;
  }
}

async function persistCheckpoint(lastLedger: number) {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      'INSERT INTO event_ingestion_checkpoint (id, last_ledger, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()',
      ['vault', lastLedger],
    );
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to persist event ingestion checkpoint');
  }
}

async function logEventToDb(type: string, eventId: string, ledger: number) {
  try {
    if (process.env.DATABASE_URL) {
      await pool.query(
        'INSERT INTO vault_events (event_id, event_type, ledger_sequence, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
        [eventId, type, ledger]
      );
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Database logging failed');
  }
}
