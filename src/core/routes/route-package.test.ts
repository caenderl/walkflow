import { describe, expect, it } from 'vitest';
import { PACKAGE_FORMAT, PACKAGE_MAX_CHARS, packageFileName, packageFromRoute, readPackage, serializePackage } from './route-package';
import { SAMPLE_NAMES, SAMPLE_PLACE, SAMPLE_SOURCE, SAMPLE_TEXTS, sampleRoute } from './sample-route';
import { analyzeRoute, readRoute, type Route, type Waypoint } from './routes';

const base = (over: Partial<Route> = {}): Route => ({
  id: 'abc', name: 'Park loop', updated: 5, country: 'DE', defaultSpeed: 4,
  points: [{ lat: 52.5, lon: 13.4 }, { lat: 52.501, lon: 13.401 }, { lat: 52.502, lon: 13.4 }],
  ...over,
});
const read = (text: string) => readPackage(text, 'new-id', 1234);
const pkg = (over: Record<string, unknown> = {}) => JSON.stringify({
  format: PACKAGE_FORMAT, version: 1, name: { und: 'Loop' }, points: [[52.5, 13.4], [52.501, 13.401]], ...over,
});

describe('the revision of a package', () => {
  it('is written when the route has one, and left out otherwise', () => {
    expect(packageFromRoute(base({ revision: 2 })).revision).toBe(2);
    expect(Object.keys(packageFromRoute(base()))).not.toContain('revision');
  });

  it('comes right after the format version in the file', () => {
    expect(Object.keys(packageFromRoute(base({ revision: 2 }))).slice(0, 3)).toEqual(['format', 'version', 'revision']);
  });

  it('is read into the route', () => {
    const res = read(pkg({ revision: 4 }));
    expect(res.ok && res.route.revision).toBe(4);
  });

  it('a package without one has none (it counts as the first)', () => {
    const res = read(pkg());
    expect(res.ok && 'revision' in res.route).toBe(false);
  });

  it('a revision that is not a whole number from 1 makes the package invalid, so a wrong number never passes as another', () => {
    for (const revision of [0, -1, 1.5, 100000, '2', null]) expect(read(pkg({ revision })), String(revision)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('survives an export and a read', () => {
    const res = read(serializePackage(packageFromRoute(base({ revision: 7 }))));
    expect(res.ok && res.route.revision).toBe(7);
  });
});

describe('waypoints in a package', () => {
  const wps: Waypoint[] = [
    { lat: 52.5005, lon: 13.4005, name: { en: 'Bridge', de: 'Brücke' }, text: { en: 'A fine view.', de: 'Eine schöne Aussicht.' } },
    { lat: 52.501, lon: 13.401, name: { und: 'Mein Punkt' } },
  ];

  it('are written as `at`, a name and a text, after the description and before the points', () => {
    const p = packageFromRoute(base({ waypoints: wps }));
    expect(p.waypoints).toEqual([
      { at: [52.5005, 13.4005], name: { en: 'Bridge', de: 'Brücke' }, text: { en: 'A fine view.', de: 'Eine schöne Aussicht.' } },
      { at: [52.501, 13.401], name: { und: 'Mein Punkt' } },
    ]);
    const keys = Object.keys(p);
    expect(keys.indexOf('waypoints')).toBe(keys.length - 2);
    expect(keys.at(-1)).toBe('points');
  });

  it('are left out when the route has none', () => {
    expect(Object.keys(packageFromRoute(base()))).not.toContain('waypoints');
    expect(Object.keys(packageFromRoute(base({ waypoints: [] })))).not.toContain('waypoints');
  });

  it('are written with the place on one line, so a change shows line by line in a review', () => {
    const text = serializePackage(packageFromRoute(base({ waypoints: wps })));
    expect(text).toContain('"at": [52.5005, 13.4005]');
    expect(text).toContain('"at": [52.501, 13.401]');
  });

  it('are rounded to 6 decimals like the points', () => {
    expect(packageFromRoute(base({ waypoints: [{ lat: 52.123456789, lon: 13.987654321, name: { en: 'P' } }] })).waypoints![0]!.at).toEqual([52.123457, 13.987654]);
  });

  it('are read back as waypoints of the route', () => {
    const res = read(serializePackage(packageFromRoute(base({ waypoints: wps }))));
    expect(res.ok && res.route.waypoints).toEqual(wps);
  });

  it('that cannot be read are left out, not a reason to refuse the package', () => {
    const res = read(pkg({ waypoints: [
      { at: [52.5, 13.4], name: { en: 'Good' } },
      { at: [52.5], name: { en: 'One number' } },
      { at: 'x', name: { en: 'Not a place' } },
      { name: { en: 'No place' } },
      { at: [52.5, 13.4] },
      'nonsense',
    ] }));
    expect(res.ok && res.route.waypoints).toEqual([{ lat: 52.5, lon: 13.4, name: { en: 'Good' } }]);
  });

  it('a package whose waypoints are not a list has none', () => {
    const res = read(pkg({ waypoints: { at: [52.5, 13.4], name: { en: 'x' } } }));
    expect(res.ok && 'waypoints' in res.route).toBe(false);
  });

  it('come out byte for byte the same when read and written again', () => {
    const text = serializePackage(packageFromRoute(base({ waypoints: wps })));
    const again = read(text);
    expect(again.ok && serializePackage(packageFromRoute(again.route))).toBe(text);
  });
});

describe('packageFromRoute', () => {
  it('writes the format, the version and the points as [lat, lon]', () => {
    const p = packageFromRoute(base());
    expect(p).toMatchObject({ format: 'walkflow-route', version: 1, name: { und: 'Park loop' }, country: 'DE', defaultSpeed: 4 });
    expect(p.points).toEqual([[52.5, 13.4], [52.501, 13.401], [52.502, 13.4]]);
  });

  it('has no id and no date: the importer makes its own', () => {
    expect(Object.keys(packageFromRoute(base()))).not.toContain('id');
    expect(Object.keys(packageFromRoute(base()))).not.toContain('updated');
  });

  it('adds the elevation as a third number, rounded to 0.1 m, and the coordinates to 6 decimals', () => {
    const p = packageFromRoute(base({ points: [{ lat: 52.12345678, lon: 13.1, ele: 34.567 }, { lat: 52.2, lon: 13.2, ele: 40 }] }));
    expect(p.points).toEqual([[52.123457, 13.1, 34.6], [52.2, 13.2, 40]]);
  });

  it('puts a text of the person\'s own under "und" (language not known)', () => {
    expect(packageFromRoute(base({ description: 'Mein Weg.' })).description).toEqual({ und: 'Mein Weg.' });
  });

  it('keeps the translations of an installed package', () => {
    expect(packageFromRoute(base({ texts: { en: 'A', de: 'B' } })).description).toEqual({ en: 'A', de: 'B' });
  });

  it('writes the name as language → text: "und" for a name the person typed, every language for one with translations', () => {
    expect(packageFromRoute(base()).name).toEqual({ und: 'Park loop' });
    expect(packageFromRoute(base({ names: { en: 'Park loop', de: 'Parkrunde' } })).name).toEqual({ en: 'Park loop', de: 'Parkrunde' });
  });

  it('exports a route that came with translations with all its names, texts and places, and its source', () => {
    const p = packageFromRoute(sampleRoute('x', 0));
    expect(p.name).toEqual(SAMPLE_NAMES);
    expect(p.description).toEqual(SAMPLE_TEXTS);
    expect(p.place).toEqual(SAMPLE_PLACE);
    expect(p.source).toBe(SAMPLE_SOURCE);
    expect(p.defaultSpeed).toBe(4);
  });

  it('carries author, licence, source and tags that came with the route, so credit travels with it', () => {
    const p = packageFromRoute(base({ meta: { author: 'Ada', license: 'CC0-1.0', source: '© OpenStreetMap contributors (ODbL)', place: { en: 'Berlin', de: 'Berlin' }, tags: ['park', 'loop'] } }));
    expect(p).toMatchObject({ author: 'Ada', license: 'CC0-1.0', source: '© OpenStreetMap contributors (ODbL)', place: { en: 'Berlin', de: 'Berlin' }, tags: ['park', 'loop'] });
  });

  it('leaves out what is empty', () => {
    const p = packageFromRoute(base({ country: undefined, defaultSpeed: undefined }));
    expect(Object.keys(p)).toEqual(['format', 'version', 'name', 'points']);
  });
});

describe('serializePackage and readPackage', () => {
  it('reads back what it wrote: a route with a new id and time, everything else the same', () => {
    const r = base({ description: 'Mein Weg.', meta: { author: 'Ada', tags: ['park'] } });
    const res = read(serializePackage(packageFromRoute(r)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.route).toMatchObject({ id: 'new-id', updated: 1234, name: 'Park loop', country: 'DE', defaultSpeed: 4, description: 'Mein Weg.', meta: { author: 'Ada', tags: ['park'] } });
    expect(res.route.points).toEqual(r.points);
  });

  it('writes one point per line, so a change to a route shows up line by line in a review', () => {
    const lines = serializePackage(packageFromRoute(base())).split('\n');
    expect(lines.filter(l => /^\s+\[52\.\d+, 13\.\d+\],?$/.test(l))).toHaveLength(3);
  });

  it('turns a route with translations into a package that reads back as the same route', () => {
    const original = sampleRoute('x', 0);
    const res = read(serializePackage(packageFromRoute(original)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.route.name).toBe(original.name);
    expect(res.route.names).toEqual(original.names);
    expect(res.route.meta?.place).toEqual(original.meta?.place);
    expect(res.route.points).toHaveLength(original.points.length);
    expect(analyzeRoute(res.route).total).toBeCloseTo(analyzeRoute(original).total, 0);
    expect(res.route.texts).toEqual(original.texts);
  });

  it('keeps the elevation', () => {
    const r = base({ points: [{ lat: 52.5, lon: 13.4, ele: 30 }, { lat: 52.501, lon: 13.401, ele: 35.5 }] });
    const res = read(serializePackage(packageFromRoute(r)));
    expect(res.ok && res.route.points.map(p => p.ele)).toEqual([30, 35.5]);
  });

  it('always makes a new route: an id or date inside the file is not used', () => {
    const res = read(pkg({ id: 'taken', updated: 1 }));
    expect(res.ok && res.route.id).toBe('new-id');
    expect(res.ok && res.route.updated).toBe(1234);
  });

  it('puts "und" into the description and the other languages into the translations', () => {
    const res = read(pkg({ description: { und: 'Plain', en: 'English', de: 'Deutsch' } }));
    expect(res.ok && res.route.description).toBe('Plain');
    expect(res.ok && res.route.texts).toEqual({ en: 'English', de: 'Deutsch' });
  });

  it('shows a name in every language it has, and uses "und", else English, else the first language as the plain name', () => {
    const named = (name: Record<string, string>) => { const r = read(pkg({ name })); return r.ok ? r.route : null; };
    expect(named({ de: 'Parkrunde', und: 'Mein Park', en: 'Park loop' })?.name).toBe('Mein Park');
    expect(named({ de: 'Parkrunde', en: 'Park loop' })?.name).toBe('Park loop');
    expect(named({ fr: 'Tour du parc', de: 'Parkrunde' })?.name).toBe('Parkrunde');
    expect(named({ de: 'Parkrunde', en: 'Park loop' })?.names).toEqual({ de: 'Parkrunde', en: 'Park loop' });
  });

  it('takes any number of languages, as long as the key is a language code', () => {
    const name = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, `Name ${i}`]));
    const r = read(pkg({ name }));
    expect(r.ok && Object.keys(r.route.names ?? {})).toHaveLength(40);
  });

  it('keeps places in several languages', () => {
    const r = read(pkg({ place: { en: 'Vienna, Austria', de: 'Wien, Österreich' } }));
    expect(r.ok && r.route.meta?.place).toEqual({ en: 'Vienna, Austria', de: 'Wien, Österreich' });
  });

  it('ignores keys it does not know, so a later version can add fields', () => {
    expect(read(pkg({ difficulty: 'hard', extra: { a: 1 } })).ok).toBe(true);
  });
});

describe('readPackage refuses', () => {
  it('what is not a package: other JSON, other text, other formats', () => {
    for (const text of ['', 'not json', '[]', '{}', '{"format":"other","version":1}', '<gpx></gpx>', 'null']) {
      const res = read(text);
      expect(res, text).toEqual({ ok: false, reason: 'unreadable' });
    }
  });

  it('a package of a newer version, with that reason, so the person knows to update', () => {
    expect(read(pkg({ version: 2 }))).toEqual({ ok: false, reason: 'newer' });
  });

  it('a version that is not a whole number from 1', () => {
    for (const version of [0, -1, 1.5, '1', null]) expect(read(pkg({ version })), String(version)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a file that is too big', () => {
    expect(read(' '.repeat(PACKAGE_MAX_CHARS + 1))).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('points that are no coordinates, are too few, or are out of range', () => {
    for (const points of [[], [[1, 2]], [[1, 2], 'x'], [[1, 2], [3]], [[1, 2], [3, 'a']], [[91, 0], [0, 0]], [[0, 181], [0, 0]], 'nope', [[0, 0, 0], [0, 0.001]]]) {
      expect(read(pkg({ points })), JSON.stringify(points)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('a route shorter than 10 m', () => {
    expect(read(pkg({ points: [[52.5, 13.4], [52.50001, 13.4]] }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a name that is missing, is not language → text, or has no usable text in any language', () => {
    for (const name of [undefined, '', 'Loop', 5, [], {}, { und: '' }, { 'de-CH': 'Loop' }, { ch_fr: 'Loop' }, { EN: 'Loop' }]) {
      expect(read(pkg({ name })), JSON.stringify(name)).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('readPackage cleans what it keeps', () => {
  it('drops a damaged country, speed or text instead of refusing the route', () => {
    const res = read(pkg({ country: 'Atlantis', defaultSpeed: 99, description: 'not a map' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.route.country).toBeUndefined();
    expect(res.route.defaultSpeed).toBeUndefined();
    expect(res.route.description).toBeUndefined();
    expect(res.route.texts).toBeUndefined();
  });

  it('cuts a name that is too long, and puts it on one line', () => {
    const res = read(pkg({ name: { en: `A\nB ${'x'.repeat(200)}` } }));
    expect(res.ok && res.route.name.length).toBe(80);
    expect(res.ok && res.route.name.startsWith('A B x')).toBe(true);
  });

  it('takes control characters out of texts and cuts them to length', () => {
    const res = read(pkg({ description: { en: `A\u0000B\u001bC${'x'.repeat(2000)}` } }));
    const text = res.ok ? res.route.texts?.en ?? '' : '';
    expect(text.startsWith('ABCx')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(1000);
  });

  it('keeps only valid tags and language keys (the language alone: no country or script), and not too many tags', () => {
    const res = read(pkg({ tags: ['park', 'Not Valid', 'x'.repeat(30), 5, 'lake'], description: { 'EN': 'x', 'en': 'ok', 'de-CH': 'x', 'ch_fr': 'x', 'toolongkeyname': 'x' } }));
    expect(res.ok && res.route.meta?.tags).toEqual(['park', 'lake']);
    expect(res.ok && res.route.texts).toEqual({ en: 'ok' });
    const many = read(pkg({ tags: Array.from({ length: 30 }, (_, i) => `t${i}`) }));
    expect(many.ok && many.route.meta?.tags).toHaveLength(8);
  });

  it('cuts author, licence, place and source to a sensible length and takes them as plain text', () => {
    const res = read(pkg({ author: `Ada\u0000 ${'x'.repeat(300)}`, license: 'CC0-1.0', place: { en: 'Berlin, Germany' }, source: '© OpenStreetMap contributors (ODbL)' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.route.meta?.author?.startsWith('Ada x')).toBe(true);
    expect(res.route.meta?.author?.length).toBeLessThanOrEqual(80);
    expect(res.route.meta).toMatchObject({ license: 'CC0-1.0', place: { en: 'Berlin, Germany' }, source: '© OpenStreetMap contributors (ODbL)' });
  });

  it('what readPackage returns also passes readRoute, the check for everything that is saved', () => {
    const res = read(serializePackage(packageFromRoute(base({ meta: { tags: ['a'] }, texts: { en: 'x' } }))));
    expect(res.ok && readRoute(res.route)).not.toBeNull();
  });
});

describe('packageFileName', () => {
  it('makes a safe file name that says what it is', () => {
    expect(packageFileName('Außenalster Loop')).toBe('Außenalster-Loop.walkflow');
    expect(packageFileName('a/b\\c:*?')).toBe('a-b-c.walkflow');
    expect(packageFileName('///')).toBe('route.walkflow');
  });
});

describe('a package the app wrote comes out byte for byte the same when it is read and written again', () => {
  // This is what lets an item taken from the community be offered again with the same hash (docs/P2P.md)
  const again = (text: string) => {
    const r = readPackage(text, 'id', 1);
    return r.ok ? serializePackage(packageFromRoute(r.route)) : null;
  };

  it('for a route with translations, a place and a source, and one with a revision', () => {
    for (const route of [sampleRoute('x', 0), { ...sampleRoute('y', 0), revision: 3 }]) {
      const text = serializePackage(packageFromRoute(route));
      expect(again(text)).toBe(text);
    }
  });

  it('for a route with a name and a description of the person, elevation and credit', () => {
    const route: Route = {
      id: 'r', name: 'Mein Weg', updated: 1, defaultSpeed: 4.5, country: 'DE', description: 'Frei',
      points: [{ lat: 53.5, lon: 10, ele: 5.1 }, { lat: 53.501, lon: 10.001, ele: 6.2 }, { lat: 53.502, lon: 10.002, ele: 7 }],
      meta: { author: 'Ann', license: 'CC0-1.0', source: 'Own', tags: ['park'], place: { de: 'Hamburg' } },
    };
    const text = serializePackage(packageFromRoute(route));
    expect(again(text)).toBe(text);
  });
});
