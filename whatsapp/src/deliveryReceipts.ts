// A receipt with stronger evidence of delivery supersedes any earlier state.
// Distinct ranks also resolve conflicting terminal receipts in a fixed order.
const statusRanks = new Map<string, number>([
  ['accepted', 1],
  ['scheduled', 2],
  ['queued', 3],
  ['sending', 4],
  ['sent', 5],
  ['canceled', 6],
  ['failed', 7],
  ['undelivered', 8],
  ['delivered', 9],
  ['read', 10],
]);

export const DELIVERY_STATUS_PATH = '/api/whatsapp/delivery-status';

export function deliveryReceiptRank(status: string): number | undefined {
  return statusRanks.get(status);
}

const ADVANCE_STATUS = `
local previous = tonumber(redis.call('HGET', KEYS[1], 'rank')) or 0
local incoming = tonumber(ARGV[1])
if incoming > previous then
  redis.call('HSET', KEYS[1], 'rank', incoming, 'status', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
`;

type RedisEval = (
  script: string,
  keyCount: number,
  key: string,
  rank: number,
  status: string,
  retentionSeconds: number,
) => Promise<unknown>;

export async function storeDeliveryReceipt(
  evaluate: RedisEval,
  messageSid: string,
  status: string,
): Promise<void> {
  const rank = deliveryReceiptRank(status);
  if (rank === undefined) return;

  await evaluate(
    ADVANCE_STATUS, 1, `whatsapp:delivery:${messageSid}`,
    rank, status, 30 * 24 * 60 * 60,
  );
}
