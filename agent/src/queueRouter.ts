/**
 * Queue monitoring router — GET /api/queue/stats
 *
 * Returns current depth and counts for the main transaction queue and the
 * dead-letter queue.  No authentication required (internal dashboard use).
 */

import { Router, Request, Response } from 'express';
import { getQueueStats } from './transactionQueue';
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

export default queueRouter;
