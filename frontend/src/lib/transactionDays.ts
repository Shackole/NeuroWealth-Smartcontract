/** Bucket instants by their calendar date in an IANA time zone. */
export function groupTransactionsByDay<T extends { timestamp: string }>(
  transactions: readonly T[],
  timeZone: string,
) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const days = new Map<string, { key: string; instant: Date | null; transactions: T[] }>();

  for (const transaction of transactions) {
    const date = new Date(transaction.timestamp);
    const valid = Number.isFinite(date.getTime());
    const parts = valid ? formatter.formatToParts(date) : [];
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    const key = valid ? `${part('year')}-${part('month')}-${part('day')}` : 'unknown';
    const day = days.get(key);
    if (day) {
      day.transactions.push(transaction);
    } else {
      days.set(key, { key, instant: valid ? date : null, transactions: [transaction] });
    }
  }

  return [...days.values()];
}
