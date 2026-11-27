import assert from 'node:assert/strict';
import { it } from 'node:test';
import { queryNotificationBatch } from './alertEngine';

it('captures one inclusive upper cutoff and carries later observations into the next batch', async () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 8, 26, 5, 0, seconds));
    const rows = [0, 9, 10, 11].map((seconds) => ({
        protocol: 'blend',
        apy_bps: 850,
        recorded_at: at(seconds),
    }));
    const db = {
        async query(sql: string, [after, cutoff]: [Date, Date]) {
            assert.match(sql, /WHERE recorded_at > \$1 AND recorded_at <= \$2/);
            return { rows: rows.filter(({ recorded_at }) => recorded_at > after && recorded_at <= cutoff) };
        },
    } as unknown as NonNullable<Parameters<typeof queryNotificationBatch>[1]>;

    let clockReads = 0;
    const first = await queryNotificationBatch(at(0), db, () => at(10 + clockReads++));
    assert.equal(clockReads, 1);
    assert.deepEqual(first.cutoff, at(10));
    assert.deepEqual(first.observations, [rows[1], rows[2]]);

    const second = await queryNotificationBatch(first.cutoff, db, () => at(12));
    assert.deepEqual(second.observations, [rows[3]]);
});
