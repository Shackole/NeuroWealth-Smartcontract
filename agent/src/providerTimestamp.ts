/** Normalize an explicit provider instant to epoch milliseconds for freshness checks. */
export function normalizeProviderTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15 ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;

  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return undefined;

  const calendarDate = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== match[1]) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
