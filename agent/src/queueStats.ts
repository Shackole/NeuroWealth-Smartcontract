import { setQueueMetrics } from './operationalMetrics';

export const QUEUE_NAME = 'transactions';
export const DLQ_NAME = 'transactions:failed';

export interface QueueStats {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  deadLetter: {
    queue: string;
    waiting: number;
    failed: number;
  };
  oldestPendingAgeSeconds: number;
}

interface DeadLetterQueueReader {
  getWaitingCount(): Promise<number>;
  getFailedCount(): Promise<number>;
}

interface QueueReader extends DeadLetterQueueReader {
  getActiveCount(): Promise<number>;
  getCompletedCount(): Promise<number>;
  getDelayedCount(): Promise<number>;
  isPaused(): Promise<boolean>;
  getJobs(types: Array<'waiting' | 'delayed'>, start: number, end: number): Promise<Array<{ timestamp: number }>>;
  getWaiting(): Promise<Array<{ data?: { type?: unknown } }>>;
  getActive(): Promise<Array<{ data?: { type?: unknown } }>>;
}

export async function readQueueStats(
  transactionQueue: QueueReader,
  deadLetterQueue: DeadLetterQueueReader,
): Promise<QueueStats> {
  const [waiting, active, completed, failed, delayed, isPaused, pendingJobs, waitingJobs, activeJobs] =
    await Promise.all([
      transactionQueue.getWaitingCount(),
      transactionQueue.getActiveCount(),
      transactionQueue.getCompletedCount(),
      transactionQueue.getFailedCount(),
      transactionQueue.getDelayedCount(),
      transactionQueue.isPaused(),
      transactionQueue.getJobs(['waiting', 'delayed'], 0, 0),
      transactionQueue.getWaiting(),
      transactionQueue.getActive(),
    ]);

  const [dlqWaiting, dlqFailed] = await Promise.all([
    deadLetterQueue.getWaitingCount(),
    deadLetterQueue.getFailedCount(),
  ]);

  const now = Date.now();
  const oldestPendingAgeSeconds = pendingJobs.reduce(
    (oldest, job) => Math.max(oldest, Math.max(0, now - job.timestamp) / 1000),
    0,
  );
  setQueueMetrics({
    pending: waiting + delayed,
    oldestPendingAgeSeconds,
    activeWorkers: active,
    deadLetterJobs: dlqWaiting,
    waitingJobs,
    activeJobs,
  });

  return {
    queue: QUEUE_NAME,
    waiting,
    active,
    completed,
    failed,
    delayed,
    oldestPendingAgeSeconds,
    paused: isPaused,
    deadLetter: {
      queue: DLQ_NAME,
      waiting: dlqWaiting,
      failed: dlqFailed,
    },
  };
}
