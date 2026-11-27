const MAX_HISTORY_DAYS = 365;
const DAY_MS = 86_400_000;

export const HISTORY_DATE_RANGE_ERROR =
  'startDate and endDate must be YYYY-MM-DD UTC dates in order, spanning at most 365 inclusive days';

type HistoryDateRange =
  | { kind: 'default' }
  | { kind: 'invalid' }
  | { kind: 'explicit'; startDate: string; endDate: string };

function utcDate(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value.startsWith('0000-')) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

export function parseHistoryDateRange(startDate: unknown, endDate: unknown): HistoryDateRange {
  if (startDate === undefined && endDate === undefined) return { kind: 'default' };

  const start = utcDate(startDate);
  const end = utcDate(endDate);
  if (start === null || end === null || end < start || end - start >= MAX_HISTORY_DAYS * DAY_MS) {
    return { kind: 'invalid' };
  }

  return { kind: 'explicit', startDate: startDate as string, endDate: endDate as string };
}
