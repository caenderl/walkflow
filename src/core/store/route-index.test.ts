import { describe, expect, it } from 'vitest';
import { PACKAGE_MAX_CHARS, serializePackage, type RoutePackage } from '../routes/route-package';
import { sha256Hex } from '../share/hash';
import {
  entryFromPackage, filterRoutes, parseIndex, serializeIndex, storeFacets, storeState, storeFileUrl, storeIndexUrl, verifyDownload,
  type StoreRoute,
} from './route-index';

const pkg = (over: Partial<RoutePackage> = {}): RoutePackage => ({
  format: 'walkflow-route',
  version: 1,
  name: { en: 'Harbour loop', de: 'Hafenrunde' },
  place: { en: 'Hamburg', de: 'Hamburg' },
  country: 'DE',
  tags: ['city', 'flat'],
  points: [[53.54, 9.98], [53.55, 9.98], [53.55, 9.99]],
  ...over,
});

const entry = (over: Partial<StoreRoute> = {}): StoreRoute => ({
  file: 'harbour-loop.walkflow',
  revision: 1,
  sha256: 'a'.repeat(64),
  chars: 500,
  length: 1800,
  name: { en: 'Harbour loop', de: 'Hafenrunde' },
  place: { en: 'Hamburg' },
  country: 'DE',
  tags: ['city'],
  ...over,
});

const indexText = (routes: unknown[], version: number = 1) => JSON.stringify({ version, routes });

describe('entryFromPackage', () => {
  it('describes a package file: hash and length of the text, length of the route, names, place, country, tags', async () => {
    const text = serializePackage(pkg());
    const r = await entryFromPackage('harbour-loop.walkflow', text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.sha256).toBe(await sha256Hex(text));
    expect(r.entry.chars).toBe(text.length);
    expect(r.entry.file).toBe('harbour-loop.walkflow');
    expect(r.entry.revision).toBe(1);
    expect(r.entry.name).toEqual({ en: 'Harbour loop', de: 'Hafenrunde' });
    expect(r.entry.place).toEqual({ en: 'Hamburg', de: 'Hamburg' });
    expect(r.entry.country).toBe('DE');
    expect(r.entry.tags).toEqual(['city', 'flat']);
    expect(r.entry.length).toBeGreaterThan(1000);
    expect(r.entry.length).toBeLessThan(3000);
  });

  it('leaves out what the package does not have', async () => {
    const r = await entryFromPackage('plain.walkflow', serializePackage(pkg({ place: undefined, country: undefined, tags: undefined })));
    expect(r.ok && Object.keys(r.entry).sort()).toEqual(['chars', 'file', 'length', 'name', 'revision', 'sha256']);
  });

  it('takes the revision from the package, 1 if it has none', async () => {
    const r = await entryFromPackage('rev.walkflow', serializePackage(pkg({ revision: 3 })));
    expect(r.ok && r.entry.revision).toBe(3);
  });

  it('refuses text that is not a route package, and a file name that is not allowed', async () => {
    expect(await entryFromPackage('x.walkflow', 'nonsense')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await entryFromPackage('x.walkflow', JSON.stringify({ format: 'walkflow-route', version: 1, name: { en: 'x' }, points: 'no' }))).toEqual({ ok: false, reason: 'invalid' });
    expect(await entryFromPackage('Bad Name.walkflow', serializePackage(pkg()))).toEqual({ ok: false, reason: 'fileName' });
    expect(await entryFromPackage('../x.walkflow', serializePackage(pkg()))).toEqual({ ok: false, reason: 'fileName' });
    expect(await entryFromPackage('x.json', serializePackage(pkg()))).toEqual({ ok: false, reason: 'fileName' });
  });

  it('refuses a package of a newer format', async () => {
    expect(await entryFromPackage('x.walkflow', JSON.stringify({ ...pkg(), version: 2 }))).toEqual({ ok: false, reason: 'newer' });
  });
});

describe('serializeIndex and parseIndex', () => {
  it('write the same index byte for byte whatever the order of the routes was, sorted by file', () => {
    const a = entry({ file: 'a.walkflow' }), b = entry({ file: 'b.walkflow', sha256: 'b'.repeat(64) });
    expect(serializeIndex([b, a])).toBe(serializeIndex([a, b]));
    const parsed = parseIndex(serializeIndex([b, a]));
    expect(parsed.ok && parsed.index.routes.map(r => r.file)).toEqual(['a.walkflow', 'b.walkflow']);
  });

  it('read back what was written', () => {
    const e = entry();
    const parsed = parseIndex(serializeIndex([e]));
    expect(parsed).toEqual({ ok: true, index: { version: 1, routes: [e] } });
  });

  it('an empty store is a valid index', () => {
    expect(parseIndex(serializeIndex([]))).toEqual({ ok: true, index: { version: 1, routes: [] } });
  });

  it('refuses what is not an index', () => {
    for (const text of ['', 'nonsense', '[]', '{}', '{"version":1}', '{"version":1,"routes":{}}', '{"version":"1","routes":[]}', 'null']) {
      expect(parseIndex(text), text).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('says "newer" for an index of a later version, so the app can tell the person to update', () => {
    expect(parseIndex(indexText([], 2))).toEqual({ ok: false, reason: 'newer' });
  });

  it('refuses an index that is too large or has too many routes', () => {
    expect(parseIndex(`{"version":1,"routes":[],"pad":"${'x'.repeat(2_100_000)}"}`)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseIndex(indexText(Array.from({ length: 2001 }, (_, i) => entry({ file: `r${i}.walkflow` }))))).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['a file name with a path', { file: '../etc/passwd.walkflow' }],
    ['a file name with a slash', { file: 'a/b.walkflow' }],
    ['a file name in capitals', { file: 'A.walkflow' }],
    ['a file that is not a package', { file: 'a.json' }],
    ['a hash that is too short', { sha256: 'abc' }],
    ['a hash in capitals', { sha256: 'A'.repeat(64) }],
    ['a length of 0 characters', { chars: 0 }],
    ['more characters than a package may have', { chars: PACKAGE_MAX_CHARS + 1 }],
    ['a fractional number of characters', { chars: 10.5 }],
    ['a negative route length', { length: -1 }],
    ['no revision', { revision: undefined }],
    ['a revision of 0', { revision: 0 }],
    ['a revision that is not whole', { revision: 1.5 }],
    ['a revision above the limit', { revision: 100000 }],
    ['a route length that is not a number', { length: 'long' }],
    ['no name', { name: undefined }],
    ['an empty name', { name: {} }],
    ['a country in lower case', { country: 'de' }],
    ['tags that are not a list', { tags: 'city' }],
  ])('refuses an entry with %s', (_what, over) => {
    expect(parseIndex(indexText([{ ...entry(), ...over }]))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses two entries with the same file name', () => {
    expect(parseIndex(indexText([entry(), entry({ sha256: 'b'.repeat(64) })]))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('cuts texts to length and takes control characters out, like everything else that comes from outside', () => {
    const parsed = parseIndex(indexText([entry({ name: { en: `Harbour\u0007 ${'x'.repeat(500)}` } })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.index.routes[0]!.name.en).not.toContain('\u0007');
    expect(parsed.index.routes[0]!.name.en!.length).toBeLessThan(200);
  });

  it('ignores fields it does not know', () => {
    const parsed = parseIndex(indexText([{ ...entry(), surprise: 'x' }]));
    expect(parsed.ok && Object.keys(parsed.index.routes[0]!)).not.toContain('surprise');
  });
});

describe('verifyDownload', () => {
  it('accepts exactly the file the index describes', async () => {
    const text = serializePackage(pkg());
    const r = await entryFromPackage('x.walkflow', text);
    if (!r.ok) throw new Error('setup');
    expect(await verifyDownload(r.entry, text)).toBe(true);
  });

  it('refuses a file with other content, even of the same length', async () => {
    const text = serializePackage(pkg());
    const r = await entryFromPackage('x.walkflow', text);
    if (!r.ok) throw new Error('setup');
    expect(await verifyDownload(r.entry, text.replace('Harbour', 'Harbor_'))).toBe(false);
    expect(await verifyDownload(r.entry, `${text} `)).toBe(false);
    expect(await verifyDownload(r.entry, '')).toBe(false);
  });
});

describe('addresses', () => {
  it('index and files are below the base', () => {
    const base = 'https://raw.githubusercontent.com/walkflow-app/route-store/main';
    expect(storeIndexUrl(base)).toBe(`${base}/index.json`);
    expect(storeFileUrl(base, 'harbour-loop.walkflow')).toBe(`${base}/routes/harbour-loop.walkflow`);
  });
});

describe('filterRoutes and storeFacets', () => {
  const routes = [
    entry({ file: 'a.walkflow', name: { en: 'Harbour loop', de: 'Hafenrunde' }, place: { en: 'Hamburg' }, country: 'DE', tags: ['city'] }),
    entry({ file: 'b.walkflow', sha256: 'b'.repeat(64), name: { en: 'Lake Constance' , de: 'Bodensee' }, place: { en: 'Lindau' }, country: 'DE', tags: ['lake', 'flat'] }),
    entry({ file: 'c.walkflow', sha256: 'c'.repeat(64), name: { en: 'Coast path' }, place: { en: 'Brittany' }, country: 'FR', tags: ['coast'] }),
    entry({ file: 'd.walkflow', sha256: 'd'.repeat(64), name: { und: 'Wald' }, country: undefined, tags: undefined, place: undefined }),
  ];
  const files = (r: StoreRoute[]) => r.map(x => x.file);

  it('without a filter: everything, longest-known first is not promised, just in file order', () => {
    expect(files(filterRoutes(routes, {}))).toEqual(['a.walkflow', 'b.walkflow', 'c.walkflow', 'd.walkflow']);
  });

  it('every word has to be in a name (in any language), the place or the tags; case and accents do not matter', () => {
    expect(files(filterRoutes(routes, { text: 'hafenrunde' }))).toEqual(['a.walkflow']);
    expect(files(filterRoutes(routes, { text: 'HARBOUR hamburg' }))).toEqual(['a.walkflow']);
    expect(files(filterRoutes(routes, { text: 'lindau flat' }))).toEqual(['b.walkflow']);
    expect(files(filterRoutes(routes, { text: 'harbour lindau' }))).toEqual([]);
    expect(files(filterRoutes(routes, { text: 'brétagne' }))).toEqual([]);
    expect(files(filterRoutes(routes, { text: 'brittàny' }))).toEqual(['c.walkflow']);
    expect(files(filterRoutes(routes, { text: '  ' })).length).toBe(4);
  });

  it('by country and by tag', () => {
    expect(files(filterRoutes(routes, { country: 'DE' }))).toEqual(['a.walkflow', 'b.walkflow']);
    expect(files(filterRoutes(routes, { country: 'de' }))).toEqual(['a.walkflow', 'b.walkflow']);
    expect(files(filterRoutes(routes, { tag: 'flat' }))).toEqual(['b.walkflow']);
    expect(files(filterRoutes(routes, { country: 'DE', tag: 'city', text: 'harbour' }))).toEqual(['a.walkflow']);
  });

  it('facets count countries and tags over the whole store, most first', () => {
    expect(storeFacets(routes)).toEqual({
      countries: [{ value: 'DE', count: 2 }, { value: 'FR', count: 1 }],
      tags: [{ value: 'city', count: 1 }, { value: 'coast', count: 1 }, { value: 'flat', count: 1 }, { value: 'lake', count: 1 }],
    });
  });
});

describe('storeState: what the person has of a route in the store', () => {
  const e = entry({ file: 'a.walkflow', revision: 3 });
  const mine = (over: { id?: string; storeFile?: string; revision?: number } = {}) => ({ id: 'r1', storeFile: 'a.walkflow', revision: 3, ...over });

  it('a route that is not in the library is new', () => {
    expect(storeState(e, [])).toEqual({ kind: 'new' });
    expect(storeState(e, [mine({ storeFile: 'b.walkflow' }), { id: 'own' }])).toEqual({ kind: 'new' });
  });

  it('a copy of the same revision is current', () => {
    expect(storeState(e, [mine()])).toEqual({ kind: 'current', id: 'r1' });
  });

  it('a copy of an older revision can be updated', () => {
    expect(storeState(e, [mine({ revision: 2 })])).toEqual({ kind: 'update', id: 'r1', from: 2 });
  });

  it('a copy without a revision counts as the first', () => {
    expect(storeState(e, [mine({ revision: undefined })])).toEqual({ kind: 'update', id: 'r1', from: 1 });
    expect(storeState(entry({ file: 'a.walkflow', revision: 1 }), [mine({ revision: undefined })])).toEqual({ kind: 'current', id: 'r1' });
  });

  it('a copy that is newer than the store (someone is trying a change) is current, not something to go back from', () => {
    expect(storeState(e, [mine({ revision: 5 })])).toEqual({ kind: 'current', id: 'r1' });
  });

  it('with several copies, the one with the highest revision decides', () => {
    expect(storeState(e, [mine({ id: 'old', revision: 1 }), mine({ id: 'newer', revision: 2 })])).toEqual({ kind: 'update', id: 'newer', from: 2 });
    expect(storeState(e, [mine({ id: 'old', revision: 1 }), mine({ id: 'cur', revision: 3 })])).toEqual({ kind: 'current', id: 'cur' });
  });
});
