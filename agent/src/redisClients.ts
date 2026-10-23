import type { Redis } from 'ioredis';

const clients = new Set<Redis>();

export function registerRedisClient<T extends Redis>(client: T): T {
  clients.add(client);
  client.once('end', () => clients.delete(client));
  return client;
}

export async function closeRedisClients(): Promise<void> {
  const results = await Promise.allSettled(
    [...clients].map(async (client) => {
      if (client.status === 'wait' || client.status === 'close' || client.status === 'end') {
        client.disconnect();
        clients.delete(client);
        return;
      }

      await client.quit();
      clients.delete(client);
    }),
  );

  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to close Redis client connections');
  }
}
