import { randomUUID } from 'node:crypto';

const accountTails = new Map<string, Promise<void>>();
const LOCK_TTL_MS = 120_000;
const LOCK_WAIT_MS = 55_000;

export interface RedisLockClient {
  set(key: string, value: string, expiryMode: 'PX', milliseconds: number, condition: 'NX'): Promise<'OK' | null>;
  eval(script: string, numberOfKeys: number, key: string, value: string): Promise<unknown>;
}

/** Serialize signing and submission for one sequence account without blocking other accounts. */
export async function withAccountSequenceLock<T>(
  account: string,
  operation: () => Promise<T>,
  redis?: RedisLockClient,
): Promise<T> {
  const preceding = accountTails.get(account) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  accountTails.set(account, current);

  await preceding;
  try {
    const releaseDistributed = redis ? await acquireDistributedLock(redis, account) : undefined;
    try {
      return await operation();
    } finally {
      try {
        await releaseDistributed?.();
      } catch {
        // The lease expires automatically; release failure must not turn a
        // confirmed transaction into a Bull retry.
      }
    }
  } finally {
    release();
    if (accountTails.get(account) === current) accountTails.delete(account);
  }
}

async function acquireDistributedLock(redis: RedisLockClient, account: string): Promise<() => Promise<void>> {
  const key = `stellar:sequence-lock:${account}`;
  const token = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX') === 'OK') {
      return async () => {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          key,
          token,
        );
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.floor(Math.random() * 40)));
  }
  throw new Error(`Timed out waiting for Stellar sequence lock for ${account}`);
}
