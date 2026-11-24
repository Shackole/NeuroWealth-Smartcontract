import assert from 'node:assert/strict';
import { storeDeliveryReceipt } from './deliveryReceipts';

async function main(): Promise<void> {
  const records = new Map<string, { rank: number; status: string; writes: number }>();
  const evaluate: Parameters<typeof storeDeliveryReceipt>[0] = async (
    _script, keyCount, key, rank, status, retentionSeconds,
  ) => {
    assert.equal(keyCount, 1);
    assert.equal(retentionSeconds, 30 * 24 * 60 * 60);
    const current = records.get(key);
    if (!current || rank > current.rank) {
      records.set(key, { rank, status, writes: (current?.writes ?? 0) + 1 });
    }
  };

  const firstSid = 'SM00000000000000000000000000000001';
  for (const status of ['delivered', 'sent', 'delivered', 'queued', 'undelivered']) {
    await storeDeliveryReceipt(evaluate, firstSid, status);
  }
  const firstKey = `whatsapp:delivery:${firstSid}`;
  assert.equal(records.get(firstKey)?.status, 'delivered');
  assert.equal(records.get(firstKey)?.writes, 1);

  for (const status of ['read', 'delivered', 'read', 'unknown']) {
    await storeDeliveryReceipt(evaluate, firstSid, status);
  }
  assert.equal(records.get(firstKey)?.status, 'read');
  assert.equal(records.get(firstKey)?.writes, 2);

  const secondSid = 'SM00000000000000000000000000000002';
  for (const status of ['queued', 'failed', 'sent', 'undelivered', 'delivered', 'read']) {
    await storeDeliveryReceipt(evaluate, secondSid, status);
  }
  assert.equal(records.get(`whatsapp:delivery:${secondSid}`)?.status, 'read');
  assert.equal(records.size, 2);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
