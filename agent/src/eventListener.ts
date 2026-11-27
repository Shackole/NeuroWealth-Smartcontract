import { pool } from './db';
import { evaluateYield } from './yieldComparison';
import { processEventForAlerts } from './alertEngine';
import logger from './logger';
import { setListenerHealth } from './healthState';
import { eventRequestPosition } from './eventCursor';
import { withRetry } from './retry';
import { rpcCall, getRpcServer } from './rpcClient';
import {
  observeEventLedger,
  recordEventCheckpoint,
  recordEventProcessingFailure,
} from './operationalMetrics';

export { pool };

/** Convenience re-export for callers that still reference `server` directly. */
export const server = getRpcServer();

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const EVENT_PAGE_LIMIT = 1000;

let eventInterval: ReturnType<typeof setInterval> | null = null;
let lastProcessedLedger = 0;

export function getLastProcessedLedger(): number {
  return lastProcessedLedger;
}

export function setLastProcessedLedger(ledger: number): void {
  if (Number.isInteger(ledger) && ledger >= 0) {
    lastProcessedLedger = ledger;
  }
}

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
 * When `checkpointLedger` is provided (e.g., restored after a Redis/DB recovery),
 * resumes from `checkpointLedger + 1` instead of skipping missed ledgers.
 */
export async function startEventListener(checkpointLedger?: number) {
  if (!VAULT_CONTRACT_ID) {
    logger.warn('VAULT_CONTRACT_ID is not set. Event listener requires a contract ID to monitor.');
    return;
  }

  if (eventInterval) return;

  let startLedger: number | undefined;
  let polling = false;
  const filters = [{ type: 'contract' as const, contractIds: [VAULT_CONTRACT_ID] }];

  let transportFailed = false;

  async function transport<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      setListenerHealth('transport', 'ok');
      return result;
    } catch (error) {
      transportFailed = true;
      setListenerHealth('transport', 'error');
      throw error;
    }
  }

  async function initialize(): Promise<number> {
    const latest = await transport(() => withRetry(
      () => rpcCall((server) => server.getLatestLedger()),
      'getLatestLedger',
    ));
    observeEventLedger(latest.sequence);
    const firstLedger = checkpointLedger && checkpointLedger > 0
      ? checkpointLedger + 1
      : latest.sequence;
    logger.info({ startLedger: firstLedger }, 'Starting event listener');
    return firstLedger;
  }

  const poll = async () => {
    if (polling) return;
    polling = true;
    transportFailed = false;
    try {
      if (startLedger === undefined) startLedger = await initialize();
      const windowStart = startLedger;
      const fetchPage = (cursor?: string) => transport(async () => {
        const page = await withRetry(
          () => rpcCall((server) => server.getEvents({
            ...eventRequestPosition(windowStart, cursor ?? null, EVENT_PAGE_LIMIT),
            filters,
          })),
          cursor ? 'getEvents page' : 'getEvents',
        );
        if (page.events.length === EVENT_PAGE_LIMIT && !page.events[EVENT_PAGE_LIMIT - 1]?.cursor) {
          throw new Error('Full RPC event page returned no continuation cursor');
        }
        return page;
      });
      const firstPage = await fetchPage();
      let latestLedger = firstPage.latestLedger;
      observeEventLedger(latestLedger);
      let page = firstPage;

      while (true) {
        for (const event of page.events) {
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
        }

        if (page.events.length < EVENT_PAGE_LIMIT) break;
        page = await fetchPage(page.events[page.events.length - 1].cursor);
        latestLedger = Math.max(latestLedger, page.latestLedger);
        observeEventLedger(latestLedger);
      }
      // The successful getEvents response covers the scanned range even when
      // the vault emitted no matching events in that range.
      startLedger = Math.max(startLedger, latestLedger + 1);
      recordEventCheckpoint(latestLedger, latestLedger);
      setListenerHealth('processing', 'ok');
    } catch (error) {
      if (!transportFailed) {
        setListenerHealth('processing', 'error');
        recordEventProcessingFailure();
      }
      logger.error({ error: error instanceof Error ? error.message : error }, 'Error polling Soroban events');
    } finally {
      polling = false;
    }
  };

  polling = true;
  eventInterval = setInterval(poll, 5000);
  try {
    startLedger = await initialize();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to initialize event listener');
  } finally {
    polling = false;
  }
}

async function logEventToDb(type: string, eventId: string, ledger: number) {
  if (process.env.DATABASE_URL) {
    await pool.query(
      'INSERT INTO vault_events (event_id, event_type, ledger_sequence, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
      [eventId, type, ledger],
    );
  }
}
