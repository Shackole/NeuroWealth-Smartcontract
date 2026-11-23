export interface QueueJobKey {
  id: string;
  timestamp: number;
}

export function encodeQueueCursor(key: QueueJobKey): string {
  return Buffer.from(JSON.stringify([key.timestamp, key.id])).toString('base64url');
}

export function decodeQueueCursor(cursor: string): QueueJobKey {
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(cursor)) throw new Error('Invalid cursor');
  const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error('Invalid cursor');
  const [timestamp, id] = decoded;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || typeof id !== 'string' || !id) {
    throw new Error('Invalid cursor');
  }
  const key = { timestamp, id };
  if (encodeQueueCursor(key) !== cursor) throw new Error('Invalid cursor');
  return key;
}

function compareKeys(a: QueueJobKey, b: QueueJobKey): number {
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;

  // Bull's generated IDs increase numerically, including across digit boundaries.
  // Dead-letter IDs preserve the original transaction ID with a dlq: prefix.
  const aSequence = /^(?:dlq:)?([1-9]\d*|0)$/.exec(a.id)?.[1];
  const bSequence = /^(?:dlq:)?([1-9]\d*|0)$/.exec(b.id)?.[1];
  if (aSequence !== undefined && bSequence !== undefined) {
    if (aSequence.length !== bSequence.length) return bSequence.length - aSequence.length;
    if (aSequence !== bSequence) return aSequence < bSequence ? 1 : -1;
  }
  if (aSequence === undefined && bSequence !== undefined) return 1;
  if (aSequence !== undefined && bSequence === undefined) return -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

export function paginateQueueJobs<T extends QueueJobKey>(
  jobs: readonly T[],
  limit: number,
  after?: QueueJobKey,
): { jobs: T[]; nextCursor: string | null } {
  const distinct = new Map(jobs.map((job) => [job.id, job]));
  const page = [...distinct.values()]
    .filter((job) => !after || compareKeys(job, after) > 0)
    .sort(compareKeys)
    .slice(0, limit + 1);
  const hasMore = page.length > limit;
  if (hasMore) page.pop();
  return {
    jobs: page,
    nextCursor: hasMore ? encodeQueueCursor(page[page.length - 1]) : null,
  };
}
