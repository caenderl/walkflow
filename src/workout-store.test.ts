import { describe, expect, it } from 'vitest';
import { MemoryWorkoutStore } from './workout-store';

const w = (id: string, name: string, updated: number) => ({ id, name, steps: [{ sec: 60, speed: 3 }], updated });

describe('MemoryWorkoutStore (fallback without IndexedDB)', () => {
  it('lists by name, put replaces by id, delete removes', async () => {
    const store = new MemoryWorkoutStore();
    await store.put(w('b', 'Zebra', 1));
    await store.put(w('a', 'apple', 2));
    await store.put(w('b', 'Banana', 3));
    expect((await store.list()).map(x => x.name)).toEqual(['apple', 'Banana']);
    await store.delete('a');
    expect((await store.list()).map(x => x.id)).toEqual(['b']);
    expect(store.persistent).toBe(false);
  });

  it('keeps the week plan', async () => {
    const store = new MemoryWorkoutStore();
    expect(await store.plan()).toBeNull();
    await store.setPlan({ minutes: [30, 0, 0, 0, 0, 0, 0] });
    expect(await store.plan()).toEqual({ minutes: [30, 0, 0, 0, 0, 0, 0] });
  });

  it('returns copies, so edits in the UI do not change what is stored before saving', async () => {
    const store = new MemoryWorkoutStore();
    await store.put(w('a', 'A', 1));
    const [first] = await store.list();
    first!.steps.push({ sec: 5, speed: 9 });
    expect((await store.list())[0]!.steps).toHaveLength(1);
  });
});
