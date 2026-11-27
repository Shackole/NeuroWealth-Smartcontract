/**
 * Queue monitoring router — GET /api/queue/stats
 *
 * Returns current depth and counts for the main transaction queue and the
 * dead-letter queue.  No authentication required (internal dashboard use).
 */

import { Router, Request, Response } from 'express';
import { decodeQueueCursor, paginateQueueJobs, type QueueJobKey } from './queuePagination';
import Bull from 'bull';
import { readQueueStats, QUEUE_NAME, DLQ_NAME } from './queueStats';
import logger from './logger';

export function createQueueMonitor(redisUrl: string) {
  const queueRouter = Router();
  const transactions = new Bull(QUEUE_NAME, redisUrl);
  const deadLetter = new Bull(DLQ_NAME, redisUrl);
  const getQueueStats = () => readQueueStats(transactions, deadLetter);

  for (const queue of [transactions, deadLetter]) {
    queue.on('error', (err: Error) => logger.error({ err, queue: queue.name }, 'Queue monitor error'));
  }

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
      const source = queue === 'transactions' ? transactions : deadLetter;
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

  queueRouter.get('/api/queue/stats', async (_req: Request, res: Response) => {
    try {
      res.json(await getQueueStats());
    } catch (err) {
      logger.error({ err }, 'Failed to fetch queue stats');
      res.status(503).json({ error: 'Queue stats unavailable' });
    }
  });

  return {
    router: queueRouter,
    refresh: getQueueStats,
    close: () => Promise.all([transactions.close(), deadLetter.close()]),
  };
}
