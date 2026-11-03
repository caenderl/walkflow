import { describe, expect, it } from 'vitest';
import { exampleRoute, ROUTE_EXAMPLES } from '../routes/route-examples';
import { readRoute, type Route } from '../routes/routes';
import { readWorkout, type Workout } from '../training/workouts';
import { itemId, localHashes, offeredItems, readCommunityItem, routeText, workoutText } from './community';
import { sha256Hex } from './hash';

const route = (over: Partial<Route> = {}): Route => ({
  id: 'r1', name: 'Alster loop', updated: 1, country: 'DE',
  points: [{ lat: 53.55, lon: 10, ele: 5 }, { lat: 53.552, lon: 10.002, ele: 6 }, { lat: 53.554, lon: 10.004, ele: 7 }],
  meta: { place: { en: 'Hamburg', de: 'Hamburg, Deutschland' }, tags: ['lake'] },
  ...over,
});
const workout = (over: Partial<Workout> = {}): Workout => ({ id: 'w1', name: 'Easy', updated: 1, steps: [{ sec: 120, speed: 2 }, { meters: 400, speed: 4 }], ...over });

describe('offeredItems', () => {
  it('offers nothing that is neither switched on nor taken from the community', async () => {
    expect(await offeredItems([route()], [workout()], 'en')).toEqual([]);
  });

  it('offers what the person switched on, as the file the app would export, with what the list shows', async () => {
    const r = route({ shared: true, names: { en: 'Alster loop', de: 'Alsterrunde' } });
    const [item] = await offeredItems([r], [], 'de');
    expect(item).toMatchObject({ kind: 'route', name: 'Alsterrunde', place: 'Hamburg, Deutschland', country: 'DE', tags: ['lake'], text: routeText(r) });
    expect(item!.sha256).toBe(await sha256Hex(routeText(r)));
    expect(item!.id).toBe(itemId(item!.sha256));
    expect(item!.chars).toBe(routeText(r).length);
  });

  it('names and places an item in the language of the room, and falls back to the plain name', async () => {
    const r = route({ shared: true, names: { en: 'Alster loop', de: 'Alsterrunde' } });
    expect((await offeredItems([r], [], 'en'))[0]!.name).toBe('Alster loop');
    expect((await offeredItems([r], [], 'fr'))[0]).toMatchObject({ name: 'Alster loop', place: 'Hamburg' });
    expect((await offeredItems([route({ shared: true })], [], 'de'))[0]!.name).toBe('Alster loop');
  });

  it('offers a workout like a route, with its name in the language of the room', async () => {
    const w = workout({ shared: true, names: { en: 'Easy', de: 'Leicht' }, meta: { tags: ['easy'] } });
    const [item] = await offeredItems([], [w], 'de');
    expect(item).toMatchObject({ kind: 'workout', name: 'Leicht', tags: ['easy'], text: workoutText(w) });
    expect(item).not.toHaveProperty('place');
  });

  it('offers an item taken from the community while the file the app writes is the one that arrived', async () => {
    const r = route();
    const arrived = routeText(r);
    const taken = { ...r, communityHash: await sha256Hex(arrived) };
    expect(await offeredItems([taken], [], 'en')).toHaveLength(1);
    const w = workout();
    expect(await offeredItems([], [{ ...w, communityHash: await sha256Hex(workoutText(w)) }], 'en')).toHaveLength(1);
  });

  it('stops offering an item from the community once it has been changed: it is the person\'s own now', async () => {
    const r = route();
    const taken = { ...r, communityHash: await sha256Hex(routeText(r)) };
    expect(await offeredItems([{ ...taken, description: 'My own notes' }], [], 'en')).toEqual([]);
    expect(await offeredItems([{ ...taken, defaultSpeed: 5 }], [], 'en')).toEqual([]);
    const w = workout();
    const takenW = { ...w, communityHash: await sha256Hex(workoutText(w)) };
    expect(await offeredItems([], [{ ...takenW, steps: [{ sec: 130, speed: 2 }] }], 'en')).toEqual([]);
  });

  it('offers a changed item again if the person switches it on, as the file it is now', async () => {
    const r = route();
    const edited = { ...r, communityHash: await sha256Hex(routeText(r)), description: 'Mine', shared: true as const };
    const [item] = await offeredItems([edited], [], 'en');
    expect(item!.sha256).toBe(await sha256Hex(routeText(edited)));
    expect(item!.sha256).not.toBe(edited.communityHash);
  });

  it('is not fooled by a hash that is not the file: a marked item whose hash is another one is not offered', async () => {
    expect(await offeredItems([{ ...route(), communityHash: 'a'.repeat(64) }], [], 'en')).toEqual([]);
  });

  it('offers a file once, however many copies of it there are', async () => {
    const items = await offeredItems([route({ id: 'a', shared: true }), route({ id: 'b', shared: true })], [], 'en');
    expect(items).toHaveLength(1);
  });

  it('offers an example route with its place and its source, as the file every device writes for it', async () => {
    const ex = ROUTE_EXAMPLES[0]!;
    const r = { ...exampleRoute(ex, 'x', 0), shared: true as const };
    const [item] = await offeredItems([r], [], 'en');
    expect(item).toMatchObject({ kind: 'route', name: ex.names.en, place: ex.place.en });
    const again = await offeredItems([{ ...exampleRoute(ex, 'another-id', 99), shared: true as const }], [], 'en');
    expect(again[0]!.sha256).toBe(item!.sha256);
  });

  it('keeps the items apart by kind', async () => {
    const items = await offeredItems([route({ shared: true })], [workout({ shared: true })], 'en');
    expect(items.map(i => i.kind)).toEqual(['route', 'workout']);
  });
});

describe('localHashes', () => {
  it('has the hash of every route and workout of the library, shared or not', async () => {
    const r = route(), w = workout();
    const hashes = await localHashes([r], [w]);
    expect(hashes).toEqual(new Set([await sha256Hex(routeText(r)), await sha256Hex(workoutText(w))]));
  });

  it('is what an item taken from the community arrives as, so it is known as already here', async () => {
    const text = routeText(route());
    const read = await readCommunityItem('route', text, 1);
    if (!read.ok || read.kind !== 'route') throw new Error('not read');
    expect((await localHashes([read.route], [])).has(await sha256Hex(text))).toBe(true);
  });

  it('is empty for an empty library', async () => {
    expect((await localHashes([], [])).size).toBe(0);
  });
});

describe('readCommunityItem', () => {
  it('reads a route that arrived into a new route and marks it as taken from the community', async () => {
    const text = routeText(route());
    const read = await readCommunityItem('route', text, 5000);
    expect(read).toMatchObject({ ok: true, kind: 'route', route: { name: 'Alster loop', updated: 5000, communityHash: await sha256Hex(text) } });
    expect(read.ok && read.kind === 'route' && read.route.id).not.toBe('r1');
    expect(read.ok && read.kind === 'route' && read.route.shared).toBeUndefined();
  });

  it('does the same for a workout', async () => {
    const text = workoutText(workout({ names: { en: 'Easy', de: 'Leicht' } }));
    const read = await readCommunityItem('workout', text, 5000);
    expect(read).toMatchObject({ ok: true, kind: 'workout', workout: { name: 'Easy', communityHash: await sha256Hex(text) } });
  });

  it('passes a taken item on again with the very hash it arrived with, so nobody ends up with a copy that differs', async () => {
    for (const text of [routeText(route()), routeText({ ...exampleRoute(ROUTE_EXAMPLES[0]!, 'x', 0) })]) {
      const read = await readCommunityItem('route', text, 1);
      expect(read.ok && read.kind === 'route').toBe(true);
      if (!read.ok || read.kind !== 'route') continue;
      const [item] = await offeredItems([read.route], [], 'en');
      expect(item!.sha256).toBe(await sha256Hex(text));
      expect(item!.text).toBe(text);
    }
    const wtext = workoutText(workout({ names: { en: 'Easy', de: 'Leicht' }, texts: { en: 'Short.' }, meta: { author: 'Ann', tags: ['easy'] } }));
    const wread = await readCommunityItem('workout', wtext, 1);
    if (!wread.ok || wread.kind !== 'workout') throw new Error('not read');
    expect((await offeredItems([], [wread.workout], 'en'))[0]!.text).toBe(wtext);
  });

  it('saves a package that the app would write differently, but does not mark it: it would be another file for everyone else', async () => {
    const compact = JSON.stringify({ format: 'walkflow-route', version: 1, name: { en: 'Made elsewhere' }, points: [[53.55, 10], [53.552, 10.002], [53.554, 10.004]] });
    const read = await readCommunityItem('route', compact, 1);
    expect(read).toMatchObject({ ok: true, kind: 'route', route: { name: 'Made elsewhere' } });
    expect(read.ok && read.kind === 'route' && read.route.communityHash).toBeUndefined();
    const wcompact = JSON.stringify({ format: 'walkflow-workout', version: 1, name: { en: 'Elsewhere' }, steps: [{ sec: 60, speed: 2 }] });
    const wread = await readCommunityItem('workout', wcompact, 1);
    expect(wread.ok && wread.kind === 'workout' && wread.workout.communityHash).toBeUndefined();
    expect(wread.ok).toBe(true);
  });

  it('refuses a file that is not of the kind it was offered as', async () => {
    expect(await readCommunityItem('workout', routeText(route()), 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(await readCommunityItem('route', workoutText(workout()), 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(await readCommunityItem('route', 'not a package', 1)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('passes on the reasons the readers give', async () => {
    const newer = JSON.stringify({ format: 'walkflow-route', version: 99, name: { en: 'x' }, points: [] });
    expect(await readCommunityItem('route', newer, 1)).toEqual({ ok: false, reason: 'newer' });
    const bad = JSON.stringify({ format: 'walkflow-workout', version: 1, name: { en: 'x' }, steps: [{ sec: 60, speed: 99 }] });
    expect(await readCommunityItem('workout', bad, 1)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('what is stored with a route or workout', () => {
  it('keeps the switch and a hash that is a hash, and drops the rest', () => {
    const r = readRoute({ ...route(), shared: true, communityHash: 'ab'.repeat(32) });
    expect(r).toMatchObject({ shared: true, communityHash: 'ab'.repeat(32) });
    const w = readWorkout({ ...workout(), shared: true, communityHash: 'ab'.repeat(32) });
    expect(w).toMatchObject({ shared: true, communityHash: 'ab'.repeat(32) });
    for (const bad of ['', 'AB'.repeat(32), 'ab'.repeat(31), 5, null, 'zz'.repeat(32)]) {
      expect(readRoute({ ...route(), communityHash: bad }), String(bad)).not.toHaveProperty('communityHash');
      expect(readWorkout({ ...workout(), communityHash: bad }), String(bad)).not.toHaveProperty('communityHash');
    }
    for (const bad of [false, 'true', 1, null]) {
      expect(readRoute({ ...route(), shared: bad })).not.toHaveProperty('shared');
      expect(readWorkout({ ...workout(), shared: bad })).not.toHaveProperty('shared');
    }
  });
});
