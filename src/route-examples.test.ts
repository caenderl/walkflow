import { describe, expect, it } from 'vitest';
import { adoptExample, descriptionAfterEdit, exampleRoute, examplesToSeed, markSeeded, readSeeded, routeDescription, ROUTE_EXAMPLES, type RouteExample } from './route-examples';
import { analyzeRoute, distanceBetween, readRoute, ROUTE_NAME_MAX, type Route } from './routes';

describe('ROUTE_EXAMPLES', () => {
  it('has at least one example, with unique keys', () => {
    expect(ROUTE_EXAMPLES.length).toBeGreaterThan(0);
    expect(new Set(ROUTE_EXAMPLES.map(e => e.key)).size).toBe(ROUTE_EXAMPLES.length);
  });

  it('turns every example into a route that passes the same check as an import', () => {
    for (const ex of ROUTE_EXAMPLES) {
      const route = readRoute(exampleRoute(ex, 'new-id', 1234));
      expect(route, ex.key).not.toBeNull();
      expect(route!.id).toBe('new-id');
      expect(route!.name).toBe(ex.name);
      expect(route!.updated).toBe(1234);
    }
  });

  it('keeps every example to a walkable length: no marathon', () => {
    for (const ex of ROUTE_EXAMPLES) {
      const total = analyzeRoute(exampleRoute(ex, 'x', 0)).total;
      expect(total, ex.key).toBeGreaterThan(500);
      expect(total, ex.key).toBeLessThan(10_000);
    }
  });

  it('names the place and where the data comes from', () => {
    for (const ex of ROUTE_EXAMPLES) {
      expect(ex.name.length, ex.key).toBeLessThanOrEqual(ROUTE_NAME_MAX);
      expect(ex.place.trim(), ex.key).not.toBe('');
      expect(ex.source, ex.key).toContain('OpenStreetMap');
    }
  });

  it('carries the country of the example into the route', () => {
    const ex = ROUTE_EXAMPLES.find(e => e.key === 'central-park-reservoir')!;
    expect(ex.country).toBe('US');
    expect(exampleRoute(ex, 'x', 0).country).toBe('US');
  });

  it('comes with a walking speed, and its description is the catalogue\'s, not a saved copy', () => {
    const ex = ROUTE_EXAMPLES.find(e => e.key === 'central-park-reservoir')!;
    expect(ex.defaultSpeed).toBeGreaterThan(0);
    const route = exampleRoute(ex, 'x', 0);
    expect(route.defaultSpeed).toBe(ex.defaultSpeed);
    expect(route.example).toBe(ex.key);
    expect('description' in route).toBe(false);
    expect(readRoute(route)?.example).toBe(ex.key);
  });

  it('has a description in every language of the app', () => {
    for (const ex of ROUTE_EXAMPLES) for (const l of ['en', 'de', 'fr'] as const) expect(ex.description[l].trim(), `${ex.key} ${l}`).not.toBe('');
  });

  it('gives each route its own copy of the points, so a route cannot change the example', () => {
    const ex = ROUTE_EXAMPLES[0]!;
    const a = exampleRoute(ex, 'a', 0), b = exampleRoute(ex, 'b', 0);
    a.points[0]!.lat = 0;
    expect(b.points[0]!.lat).toBe(ex.points[0]![0]);
    expect(ex.points[0]![0]).not.toBe(0);
  });

  it('has the Central Park reservoir loop as a closed loop of about 2.5 km', () => {
    const ex = ROUTE_EXAMPLES.find(e => e.key === 'central-park-reservoir')!;
    expect(ex).toBeDefined();
    const route = exampleRoute(ex, 'x', 0);
    const total = analyzeRoute(route).total;
    expect(total).toBeGreaterThan(2400);
    expect(total).toBeLessThan(2700);
    expect(distanceBetween(route.points[0]!, route.points.at(-1)!)).toBeLessThan(5);
  });
});

describe('seeding the library', () => {
  const ex = (key: string, name = key): RouteExample => ({ key, name, place: 'p', country: 'US', defaultSpeed: 4, description: { en: 'a', de: 'b', fr: 'c' }, previousDescriptions: [], source: '© OpenStreetMap contributors', points: [[0, 0], [0, 0.01]] });
  const examples = [ex('a', 'Route A'), ex('b', 'Route B')];

  it('readSeeded reads a list of keys and nothing else', () => {
    expect(readSeeded(null)).toEqual([]);
    expect(readSeeded('')).toEqual([]);
    expect(readSeeded('not json')).toEqual([]);
    expect(readSeeded('{"a":1}')).toEqual([]);
    expect(readSeeded('["a", 2, null, "b"]')).toEqual(['a', 'b']);
  });

  it('puts every example in a library that has never had them', () => {
    expect(examplesToSeed([], [], examples).map(e => e.key)).toEqual(['a', 'b']);
  });

  it('does not bring back an example that was seeded before, so a deleted one stays deleted', () => {
    expect(examplesToSeed(['a'], [], examples).map(e => e.key)).toEqual(['b']);
    expect(examplesToSeed(['a', 'b'], [], examples)).toEqual([]);
  });

  it('does not add a second copy of a route the library already has under that name', () => {
    expect(examplesToSeed([], ['Route B', 'other'], examples).map(e => e.key)).toEqual(['a']);
  });

  it('markSeeded records every current example, once', () => {
    expect(markSeeded([], examples)).toEqual(['a', 'b']);
    expect(markSeeded(['a', 'old'], examples)).toEqual(['a', 'old', 'b']);
  });

  it('the real examples are all seeded into an empty library', () => {
    expect(examplesToSeed([], []).map(e => e.key)).toEqual(ROUTE_EXAMPLES.map(e => e.key));
  });
});


describe('routeDescription', () => {
  const ex = ROUTE_EXAMPLES[0]!;
  const base = exampleRoute(ex, 'x', 0);

  it('shows an example route\'s text in the current language, and tells which language it is', () => {
    expect(routeDescription(base, 'de')).toEqual({ text: ex.description.de, lang: 'de' });
    expect(routeDescription(base, 'fr')).toEqual({ text: ex.description.fr, lang: 'fr' });
  });

  it('shows a text the person wrote as it is, without a language', () => {
    expect(routeDescription({ ...base, description: 'Mein Weg.' }, 'en')).toEqual({ text: 'Mein Weg.', lang: null });
    expect(routeDescription({ ...base, example: undefined, description: 'Mein Weg.' }, 'fr')).toEqual({ text: 'Mein Weg.', lang: null });
  });

  it('has nothing for a route without text and for an example that is not in the catalogue', () => {
    expect(routeDescription({ ...base, example: undefined }, 'en')).toBeNull();
    expect(routeDescription({ ...base, example: 'gone' }, 'en')).toBeNull();
  });
});

describe('descriptionAfterEdit', () => {
  const ex = ROUTE_EXAMPLES[0]!;
  const base = exampleRoute(ex, 'x', 0);

  it('keeps the example text (and its translation) when the field was left as it was shown', () => {
    expect(descriptionAfterEdit(base, ex.description.de, 'de')).toEqual({ example: ex.key });
    expect(descriptionAfterEdit(base, `  ${ex.description.de}\n`, 'de')).toEqual({ example: ex.key });
  });

  it('makes the text the person\'s own once it was changed or cleared', () => {
    expect(descriptionAfterEdit(base, 'Mein Weg.', 'de')).toEqual({ description: 'Mein Weg.' });
    expect(descriptionAfterEdit(base, '', 'de')).toEqual({});
  });

  it('takes the text as it is for a route that is not an example', () => {
    const own = { ...base, example: undefined, description: 'Alt' };
    expect(descriptionAfterEdit(own, 'Neu', 'en')).toEqual({ description: 'Neu' });
    expect(descriptionAfterEdit(own, ex.description.en, 'en')).toEqual({ description: ex.description.en });
  });
});


describe('adoptExample', () => {
  const ex = ROUTE_EXAMPLES[0]!;
  const copy = (over: Partial<Route> = {}): Route => ({ ...exampleRoute(ex, 'mine', 5), example: undefined, defaultSpeed: undefined, country: undefined, ...over });

  it('turns an old copy of an example, saved before routes knew their example, into that example', () => {
    const r = adoptExample(copy(), ex);
    expect(r).toMatchObject({ id: 'mine', example: ex.key, defaultSpeed: ex.defaultSpeed });
    expect('description' in r!).toBe(false);
  });

  it('recognises the copy by name, start and length, so a GPX import of the example counts too', () => {
    const nudged = copy({ points: ex.points.map(([lat, lon]) => ({ lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 })).filter((_, i) => i % 2 === 0 || i === ex.points.length - 1) });
    expect(adoptExample(nudged, ex)).not.toBeNull();
  });

  it('drops a description that is one of the example\'s own texts, old or current, and keeps one the person wrote', () => {
    expect(adoptExample(copy({ description: ex.description.fr }), ex)).not.toHaveProperty('description');
    expect(adoptExample(copy({ description: ex.previousDescriptions[0]! }), ex)).not.toHaveProperty('description');
    expect(adoptExample(copy({ description: 'Mein Weg.' }), ex)).toMatchObject({ description: 'Mein Weg.', example: ex.key });
  });

  it('keeps a walking speed the person has set', () => {
    expect(adoptExample(copy({ defaultSpeed: 5.5 }), ex)?.defaultSpeed).toBe(5.5);
  });

  it('leaves everything else alone: another name, another track, an example already', () => {
    expect(adoptExample(copy({ name: 'Anderer Weg' }), ex)).toBeNull();
    expect(adoptExample(copy({ points: ex.points.slice(0, 20).map(([lat, lon]) => ({ lat, lon })) }), ex)).toBeNull();
    expect(adoptExample(copy({ points: ex.points.map(([lat, lon]) => ({ lat: lat + 1, lon, })) }), ex)).toBeNull();
    expect(adoptExample(copy({ example: ex.key }), ex)).toBeNull();
    expect(adoptExample(copy({ example: 'other' }), ex)).toBeNull();
  });
});
