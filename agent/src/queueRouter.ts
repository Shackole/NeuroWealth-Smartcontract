/**
 * Queue monitoring router — GET /api/queue/stats
 *
 * Returns current depth and counts for the main transaction queue and the
 * dead-letter queue.  No authentication required (internal dashboard use).
 */

import { Router, Request, Response } from 'express';
import Bull from 'bull';
import { readQueueStats, QUEUE_NAME, DLQ_NAME } from './queueStats';
import { renderOperationalMetrics } from './operationalMetrics';
import logger from './logger';

export function createQueueMonitor(redisUrl: string) {
  const queueRouter = Router();
  const transactions = new Bull(QUEUE_NAME, redisUrl);
  const deadLetter = new Bull(DLQ_NAME, redisUrl);
  const getQueueStats = () => readQueueStats(transactions, deadLetter);

  for (const queue of [transactions, deadLetter]) {
    queue.on('error', (err: Error) => logger.error({ err, queue: queue.name }, 'Queue monitor error'));
  }

  queueRouter.get('/api/queue/stats', async (_req: Request, res: Response) => {
    try {
      res.json(await getQueueStats());
    } catch (err) {
      logger.error({ err }, 'Failed to fetch queue stats');
      res.status(503).json({ error: 'Queue stats unavailable' });
    }
  });

  queueRouter.get('/metrics', async (_req: Request, res: Response) => {
    try {
      await getQueueStats();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(renderOperationalMetrics());
    } catch (err) {
      logger.error({ err }, 'Failed to collect operational metrics');
      res.sendStatus(503);
    }
  });

  return {
    router: queueRouter,
    close: () => Promise.all([transactions.close(), deadLetter.close()]),
  };
}
