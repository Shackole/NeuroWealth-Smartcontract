/**
 * Queue monitoring router — GET /api/queue/stats
 *
 * Returns current depth and counts for the main transaction queue and the
 * dead-letter queue.  No authentication required (internal dashboard use).
 */

import { Router, Request, Response } from 'express';
import { deadLetterQueue, getQueueStats, transactionQueue } from './transactionQueue';
import { decodeQueueCursor, paginateQueueJobs, type QueueJobKey } from './queuePagination';
import logger from './logger';

const queueRouter = Router();

/**
 * GET /api/queue/stats
 *
 * Response shape:
 * ```json
 * {
 *   "queue": "transactions",
 *   "waiting": 3,
 *   "active": 1,
 *   "completed": 120,
 *   "failed": 2,
 *   "delayed": 0,
 *   "paused": false,
 *   "deadLetter": {
 *     "queue": "transactions:failed",
 *     "waiting": 2,
 *     "failed": 0
 *   }
 * }
 * ```
 */
queueRouter.get('/api/queue/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, 'Failed to fetch queue stats');
    res.status(503).json({ error: 'Queue stats unavailable', detail: message });
  }
});

/**
 * GET /api/queue/jobs?queue=transactions&limit=50&cursor=...
 * Supports transactions and dead-letter queues. Reuse the cursor with the same
 * queue to continue in descending enqueue timestamp and job ID order.
 */
queueRouter.get('/api/queue/jobs', async (req: Request, res: Response) => {
  const { queue = 'transactions', cursor, limit: rawLimit = '50' } = req.query;
  if ((queue !== 'transactions' && queue !== 'dead-letter') ||
      typeof rawLimit !== 'string' || !/^(?:[1-9][0-9]?|100)$/.test(rawLimit)) {
    res.status(400).json({ error: 'Invalid queue or limit (expected 1–100)' });
    return;
  }

  let after: QueueJobKey | undefined;
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== 'string') throw new Error('Invalid cursor');
      after = decodeQueueCursor(cursor);
    } catch {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }
  }

  try {
    const source = queue === 'transactions' ? transactionQueue : deadLetterQueue;
    // Bull's positional ranges reflect job state, so derive the seek order
    // from enqueue metadata across all retained states.
    const retained = await source.getJobs(['waiting', 'active', 'delayed', 'failed', 'completed', 'paused']);
    const jobs = retained.filter(Boolean).map(({ id, timestamp, data }) => ({
      id: String(id),
      timestamp,
      type: data.type,
    }));
    res.json(paginateQueueJobs(jobs, Number(rawLimit), after));
  } catch (err) {
    logger.error({ err, queue }, 'Failed to list queue jobs');
    res.status(503).json({ error: 'Queue listing unavailable' });
  }
});

export default queueRouter;
