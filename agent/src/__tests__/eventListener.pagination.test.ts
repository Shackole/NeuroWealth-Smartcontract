import { drainEventPages } from '../eventListener';

type FixtureEvent = { id: string; eventType: 'deposit' | 'withdraw'; ledger: number };

describe('Soroban event cursor pagination', () => {
  it('processes every event when one busy ledger spans multiple pages', async () => {
    const fixture = Array.from({ length: 102 }, (_, index): FixtureEvent => ({
      id: `ledger-900-event-${index}`,
      eventType: index % 2 ? 'withdraw' : 'deposit',
      ledger: 900,
    }));
    const sideEffects: string[] = [];
    const pages = [fixture.slice(0, 100), fixture.slice(100)];
    const cursors = ['cursor-page-1', 'cursor-page-2'];

    await drainEventPages(
      900,
      undefined,
      async (_ledger, cursor) => {
        const pageIndex = cursor ? 1 : 0;
        return { events: pages[pageIndex], cursor: cursors[pageIndex], pageLength: pages[pageIndex].length };
      },
      async (events) => events,
      async (event) => { sideEffects.push(event.id); },
    );

    expect(sideEffects).toHaveLength(102);
    expect(new Set(sideEffects).size).toBe(102);
    expect(sideEffects).toEqual(fixture.map(({ id }) => id));
  });

  it('resumes from the last durable page cursor after an interrupted page commit', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index): FixtureEvent => ({
      id: `first-${index}`, eventType: 'deposit', ledger: 901,
    }));
    const secondPage: FixtureEvent[] = [
      { id: 'second-0', eventType: 'withdraw', ledger: 901 },
      { id: 'second-1', eventType: 'deposit', ledger: 901 },
    ];
    const durableIds = new Set<string>();
    const effects: string[] = [];
    let committedCursor: string | null = null;
    let failSecondPage = true;
    const fetchPage = async (_ledger: number, cursor?: string) => cursor
      ? { events: secondPage, cursor: 'cursor-page-2', pageLength: 2 }
      : { events: firstPage, cursor: 'cursor-page-1', pageLength: 100 };
    const commitPage = async (events: FixtureEvent[], _ledger: number, cursor: string | null) => {
      if (cursor === 'cursor-page-2' && failSecondPage) {
        failSecondPage = false;
        throw new Error('injected database failure');
      }
      const fresh = events.filter((event) => !durableIds.has(event.id));
      fresh.forEach((event) => durableIds.add(event.id));
      committedCursor = cursor;
      return fresh;
    };

    await expect(drainEventPages(901, undefined, fetchPage, commitPage, async (event) => { effects.push(event.id); }))
      .rejects.toThrow('injected database failure');
    expect(committedCursor).toBe('cursor-page-1');
    await drainEventPages(901, committedCursor ?? undefined, fetchPage, commitPage, async (event) => { effects.push(event.id); });

    expect(durableIds.size).toBe(102);
    expect(effects).toHaveLength(102);
    expect(new Set(effects).size).toBe(102);
    expect(committedCursor).toBe('cursor-page-2');
  });
});
