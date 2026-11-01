import { describe, expect, it } from 'vitest';
import { MemoryRunStore } from './run-store';
import { buildRun } from './runs';

const T0 = Date.UTC(2026, 9, 26, 7, 0, 0);
const run = (min: number, speed = 3) => buildRun([{ ts: T0 + min * 60_000, speed }, { ts: T0 + (min + 2) * 60_000, speed }], 'ble')!;

describe('MemoryRunStore (fallback without IndexedDB)', () => {
  it('lists newest first, the backup oldest first, put replaces by id', async () => {
    const store = new MemoryRunStore();
    await store.put(run(0));
    await store.put(run(60));
    await store.put(run(0, 4));
    expect((await store.list()).map(r => r.start)).toEqual([T0 + 3_600_000, T0]);
    expect((await store.all()).map(r => r.summary.maxKmh)).toEqual([4, 3]);
    expect(await store.track(String(T0))).toEqual(run(0, 4).track);
    expect(store.persistent).toBe(false);
  });

  it('delete and clear', async () => {
    const store = new MemoryRunStore();
    await store.put(run(0));
    await store.put(run(60));
    await store.delete(String(T0));
    expect((await store.list()).map(r => r.start)).toEqual([T0 + 3_600_000]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});
