import { describe, expect, it } from 'vitest';
import { Directory } from './directory';
import type { OfferedItem } from './protocol';

const hash = (n: number) => n.toString(16).padStart(64, '0');
const item = (id: string, h: number, over: Partial<OfferedItem> = {}): OfferedItem => ({ id, kind: 'route', name: `Route ${h}`, chars: 100, sha256: hash(h), ...over });

describe('Directory', () => {
  it('is empty at first', () => {
    const d = new Directory();
    expect(d.list()).toEqual([]);
    expect(d.size).toBe(0);
    expect(d.facets()).toEqual({ kinds: { route: 0, workout: 0 }, countries: [], tags: [] });
  });

  it('lists what a device offers, with the device that has it', () => {
    const d = new Directory();
    d.update('p1', [item('a', 1, { place: 'Hamburg', country: 'DE', tags: ['park'] })]);
    expect(d.list()).toEqual([{ sha256: hash(1), kind: 'route', name: 'Route 1', chars: 100, place: 'Hamburg', country: 'DE', tags: ['park'], peers: ['p1'] }]);
    expect(d.size).toBe(1);
  });

  it('puts the same file from several devices into one entry, whatever id each calls it', () => {
    const d = new Directory();
    d.update('p1', [item('a', 1)]);
    d.update('p2', [item('zz', 1), item('b', 2)]);
    const list = d.list();
    expect(list).toHaveLength(2);
    expect(list.find(e => e.sha256 === hash(1))!.peers).toEqual(['p1', 'p2']);
    expect(list.find(e => e.sha256 === hash(2))!.peers).toEqual(['p2']);
  });

  it('counts a device once even if it offers the same file twice', () => {
    const d = new Directory();
    d.update('p1', [item('a', 1), item('b', 1)]);
    expect(d.list()[0]!.peers).toEqual(['p1']);
  });

  it('takes a newer offer in place of the old one', () => {
    const d = new Directory();
    d.update('p1', [item('a', 1), item('b', 2)]);
    d.update('p1', [item('b', 2), item('c', 3)]);
    expect(d.list().map(e => e.sha256).sort()).toEqual([hash(2), hash(3)]);
  });

  it('forgets a device that has left, and does nothing for one it does not know', () => {
    const d = new Directory();
    d.update('p1', [item('a', 1)]);
    d.update('p2', [item('a', 1), item('b', 2)]);
    d.remove('nobody');
    d.remove('p2');
    expect(d.list()).toHaveLength(1);
    expect(d.list()[0]!.peers).toEqual(['p1']);
    d.remove('p1');
    expect(d.size).toBe(0);
  });

  it('puts what most devices have first, then by name, then by hash', () => {
    const d = new Directory();
    d.update('p1', [item('a', 1, { name: 'Zebra' }), item('b', 2, { name: 'Äpfel' }), item('c', 3, { name: 'Birne' }), item('d', 4, { name: 'Birne' })]);
    d.update('p2', [item('a', 1, { name: 'Zebra' })]);
    expect(d.list().map(e => e.name)).toEqual(['Zebra', 'Äpfel', 'Birne', 'Birne']);
    expect(d.list().slice(2).map(e => e.sha256)).toEqual([hash(3), hash(4)]);
  });

  describe('what is shown about a file the devices describe differently', () => {
    it('takes the description most devices agree on, so one device cannot rename a file for everyone', () => {
      const d = new Directory();
      d.update('liar', [item('a', 1, { name: 'Free money', tags: ['scam'] })]);
      d.update('p2', [item('a', 1, { name: 'Alster loop' })]);
      d.update('p3', [item('a', 1, { name: 'Alster loop' })]);
      expect(d.list()[0]).toMatchObject({ name: 'Alster loop', peers: ['liar', 'p2', 'p3'] });
      expect(d.list()[0]).not.toHaveProperty('tags');
    });

    it('takes the one seen first when there is no majority', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { name: 'First' })]);
      d.update('p2', [item('a', 1, { name: 'Second' })]);
      expect(d.list()[0]!.name).toBe('First');
    });

    it('does not let a device claim another kind or length for a file the others describe', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { kind: 'workout', chars: 5 })]);
      d.update('p2', [item('a', 1)]);
      d.update('p3', [item('a', 1)]);
      expect(d.list()[0]).toMatchObject({ kind: 'route', chars: 100 });
    });

    it('follows the devices that are there now: when the first one leaves, the description may change', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { name: 'First' })]);
      d.update('p2', [item('a', 1, { name: 'Second' })]);
      d.remove('p1');
      expect(d.list()[0]!.name).toBe('Second');
    });
  });

  describe('filters', () => {
    const d = new Directory();
    d.update('p1', [
      item('a', 1, { name: 'Außenalster-Runde', place: 'Hamburg, Deutschland', country: 'DE', tags: ['lake', 'loop'] }),
      item('b', 2, { name: 'Central Park', place: 'New York', country: 'US', tags: ['park', 'loop'] }),
      item('c', 3, { kind: 'workout', name: 'Easy intervals', tags: ['intervals'] }),
    ]);
    const names = (filter: Parameters<Directory['list']>[0]) => d.list(filter).map(e => e.name).sort();

    it('by kind', () => {
      expect(names({ kind: 'workout' })).toEqual(['Easy intervals']);
      expect(names({ kind: 'route' })).toEqual(['Außenalster-Runde', 'Central Park']);
    });

    it('by country, without caring about case', () => {
      expect(names({ country: 'de' })).toEqual(['Außenalster-Runde']);
      expect(names({ country: 'FR' })).toEqual([]);
    });

    it('by tag', () => {
      expect(names({ tag: 'loop' })).toEqual(['Außenalster-Runde', 'Central Park']);
      expect(names({ tag: 'lake' })).toEqual(['Außenalster-Runde']);
    });

    it('by text in the name, the place and the tags, without caring about case or accents', () => {
      expect(names({ text: 'außen' })).toEqual(['Außenalster-Runde']);
      expect(names({ text: 'aussen' })).toEqual(['Außenalster-Runde']);
      expect(names({ text: 'ALSTER' })).toEqual(['Außenalster-Runde']);
      expect(names({ text: 'cëntral' })).toEqual(['Central Park']);
      expect(names({ text: 'HAMBURG' })).toEqual(['Außenalster-Runde']);
      expect(names({ text: 'park' })).toEqual(['Central Park']);
      expect(names({ text: 'interv' })).toEqual(['Easy intervals']);
      expect(names({ text: 'deutschland' })).toEqual(['Außenalster-Runde']);
      expect(names({ text: 'Hamburg' })).toEqual(['Außenalster-Runde']);
    });

    it('with every word of the text having to be there', () => {
      expect(names({ text: 'park new' })).toEqual(['Central Park']);
      expect(names({ text: 'park hamburg' })).toEqual([]);
    });

    it('all of them together, and an empty filter is no filter', () => {
      expect(names({ kind: 'route', tag: 'loop', country: 'US' })).toEqual(['Central Park']);
      expect(names({ kind: 'workout', tag: 'loop' })).toEqual([]);
      expect(names({ text: '  ' })).toHaveLength(3);
      expect(names({})).toHaveLength(3);
    });
  });

  describe('hiding', () => {
    it('keeps a hidden file out of the list and the filters until it is shown again', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { country: 'DE', tags: ['x'] }), item('b', 2)]);
      d.hide(hash(1));
      expect(d.list().map(e => e.sha256)).toEqual([hash(2)]);
      expect(d.facets()).toEqual({ kinds: { route: 1, workout: 0 }, countries: [], tags: [] });
      expect(d.size).toBe(1);
      expect(d.list({ includeHidden: true })).toHaveLength(2);
      d.unhide(hash(1));
      expect(d.list()).toHaveLength(2);
    });

    it('stays hidden when the device that had it leaves and comes back, or another one offers it', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1)]);
      d.hide(hash(1));
      d.remove('p1');
      d.update('p2', [item('z', 1)]);
      expect(d.list()).toEqual([]);
    });

    it('can start with a list of what was hidden before', () => {
      const d = new Directory([hash(1)]);
      d.update('p1', [item('a', 1), item('b', 2)]);
      expect(d.list().map(e => e.sha256)).toEqual([hash(2)]);
      expect(d.hidden).toEqual([hash(1)]);
    });
  });

  describe('who to ask', () => {
    it('names the devices that have a file and the id it has there, in the order they were seen', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1)]);
      d.update('p2', [item('x', 1)]);
      expect(d.candidates(hash(1))).toEqual([{ peer: 'p1', id: 'a' }, { peer: 'p2', id: 'x' }]);
      d.remove('p1');
      expect(d.candidates(hash(1))).toEqual([{ peer: 'p2', id: 'x' }]);
      expect(d.candidates(hash(9))).toEqual([]);
    });

    it('follows a device that changes the id of a file in a newer offer', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1)]);
      d.update('p1', [item('renamed', 1)]);
      expect(d.candidates(hash(1))).toEqual([{ peer: 'p1', id: 'renamed' }]);
    });

    it('keeps the order of the devices when one of them changes its offer', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1)]);
      d.update('p2', [item('b', 1)]);
      d.update('p1', [item('a', 1), item('c', 2)]);
      expect(d.candidates(hash(1)).map(c => c.peer)).toEqual(['p1', 'p2']);
    });

    it('gives the length that device announced, which is what the transfer is checked against', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { chars: 123 })]);
      expect(d.candidates(hash(1))).toEqual([{ peer: 'p1', id: 'a' }]);
      expect(d.offeredBy('p1', 'a')).toMatchObject({ chars: 123, sha256: hash(1) });
      expect(d.offeredBy('p1', 'zzz')).toBeUndefined();
      expect(d.offeredBy('nobody', 'a')).toBeUndefined();
    });
  });

  describe('facets for the filters', () => {
    it('counts the files, not the devices, per kind, country and tag, most first', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { country: 'DE', tags: ['loop', 'park'] }), item('b', 2, { country: 'US', tags: ['loop'] }), item('c', 3, { kind: 'workout' })]);
      d.update('p2', [item('a', 1, { country: 'DE', tags: ['loop', 'park'] }), item('d', 4, { country: 'DE' })]);
      expect(d.facets()).toEqual({
        kinds: { route: 3, workout: 1 },
        countries: [{ value: 'DE', count: 2 }, { value: 'US', count: 1 }],
        tags: [{ value: 'loop', count: 2 }, { value: 'park', count: 1 }],
      });
    });

    it('breaks a tie by the value', () => {
      const d = new Directory();
      d.update('p1', [item('a', 1, { tags: ['b'] }), item('b', 2, { tags: ['a'] })]);
      expect(d.facets().tags).toEqual([{ value: 'a', count: 1 }, { value: 'b', count: 1 }]);
    });
  });
});
