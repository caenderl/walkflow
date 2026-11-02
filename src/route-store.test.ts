import { describe, expect, it } from 'vitest';
import { MemoryRouteStore } from './route-store';

const r = (id: string, name: string) => ({ id, name, points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }], updated: 1 });

describe('MemoryRouteStore (fallback without IndexedDB)', () => {
  it('lists by name, put replaces by id, delete removes', async () => {
    const store = new MemoryRouteStore();
    await store.put(r('b', 'Zebra'));
    await store.put(r('a', 'apple'));
    await store.put(r('b', 'Banana'));
    expect((await store.list()).map(x => x.name)).toEqual(['apple', 'Banana']);
    await store.delete('a');
    expect((await store.list()).map(x => x.id)).toEqual(['b']);
    expect(store.persistent).toBe(false);
  });

  it('returns copies, so edits do not change what is stored', async () => {
    const store = new MemoryRouteStore();
    await store.put(r('a', 'A'));
    const [first] = await store.list();
    first!.points.push({ lat: 5, lon: 5 });
    first!.name = 'changed';
    const [again] = await store.list();
    expect(again!.points).toHaveLength(2);
    expect(again!.name).toBe('A');
  });
});
