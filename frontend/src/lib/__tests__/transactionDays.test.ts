import { groupTransactionsByDay } from '../transactionDays';

describe('groupTransactionsByDay', () => {
  it('uses the new local midnight offset after spring-forward', () => {
    const transactions = [
      { timestamp: '2025-03-09T04:59:59Z' },
      { timestamp: '2025-03-09T05:00:00Z' },
      { timestamp: '2025-03-09T07:00:00Z' },
      { timestamp: '2025-03-10T03:59:59Z' },
      { timestamp: '2025-03-10T04:00:00Z' },
    ];
    const days = groupTransactionsByDay(transactions, 'America/New_York');

    expect(days.map(({ key, transactions: rows }) => [key, rows])).toEqual([
      ['2025-03-08', transactions.slice(0, 1)],
      ['2025-03-09', transactions.slice(1, 4)],
      ['2025-03-10', transactions.slice(4)],
    ]);
  });

  it('keeps both occurrences of the repeated hour on the same day after fall-back', () => {
    const transactions = [
      { timestamp: '2025-11-02T05:30:00Z' },
      { timestamp: '2025-11-02T06:30:00Z' },
      { timestamp: '2025-11-03T04:59:59Z' },
      { timestamp: '2025-11-03T05:00:00Z' },
    ];
    const days = groupTransactionsByDay(transactions, 'America/New_York');

    expect(days.map(({ key, transactions: rows }) => [key, rows])).toEqual([
      ['2025-11-02', transactions.slice(0, 3)],
      ['2025-11-03', transactions.slice(3)],
    ]);
  });
});
