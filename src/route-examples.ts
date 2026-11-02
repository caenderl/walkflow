// Example routes that come with the app, so the routes view is not empty on the first start. Each one is put into the
// person's own library once (with a new id, like a GPX import) and is an ordinary route from then on: it can be
// deleted, and a deleted one does not come back.
// Track data is from OpenStreetMap, so it carries the attribution the licence asks for. A track in OpenStreetMap has no
// elevations, so these routes have none either.

import type { Lang } from './i18n';
import { analyzeRoute, type Route } from './routes';

export interface RouteExample {
  key: string;
  name: string;
  place: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  /** Walking speed in km/h; the duration of the route follows from it */
  defaultSpeed: number;
  /** A line or two about the route, in each language of the app. The route keeps only the key; the text is shown in the language of the app (routeDescription). */
  description: Record<Lang, string>;
  /** Texts this example was saved with in earlier versions, so a copy that still has one counts as unchanged */
  previousDescriptions: readonly string[];
  /** Where the track comes from, shown next to it */
  source: string;
  /** [latitude, longitude] */
  points: readonly (readonly [number, number])[];
}

const OSM = '© OpenStreetMap contributors (ODbL)';

export const ROUTE_EXAMPLES: readonly RouteExample[] = [
  {
    key: 'central-park-reservoir',
    name: 'Central Park Reservoir Loop',
    place: 'New York, USA',
    country: 'US',
    defaultSpeed: 4,
    description: {
      en: 'The Stephanie and Fred Shuman Running Track, 2.54 km (1.58 miles) around the Jacqueline Kennedy Onassis Reservoir in Central Park, between 86th and 96th Street. The reservoir was built from 1858 to 1862 and taken out of service as a water supply in 1993. It was renamed in 1994 after Jacqueline Kennedy Onassis, who jogged here.',
      de: 'Die Stephanie and Fred Shuman Running Track, 2,54 km (1,58 Meilen) rund um das Jacqueline Kennedy Onassis Reservoir im Central Park, zwischen der 86. und der 96. Straße. Das Becken wurde von 1858 bis 1862 gebaut und 1993 als Wasserspeicher außer Betrieb genommen. 1994 wurde es nach Jacqueline Kennedy Onassis benannt, die hier joggte.',
      fr: 'Le Stephanie and Fred Shuman Running Track, 2,54 km (1,58 mile) autour du réservoir Jacqueline Kennedy Onassis, dans Central Park, entre la 86e et la 96e Rue. Le réservoir a été construit de 1858 à 1862 et mis hors service comme réserve d’eau en 1993. Il porte depuis 1994 le nom de Jacqueline Kennedy Onassis, qui y faisait son jogging.',
    },
    previousDescriptions: [
      'The well-known loop around the Jacqueline Kennedy Onassis Reservoir in Central Park, New York, about 2.5 km.',
      'Die bekannte Runde um das Jacqueline Kennedy Onassis Reservoir im Central Park in New York, rund 2,5 km.',
      'Le célèbre tour du réservoir Jacqueline Kennedy Onassis dans Central Park, à New York, environ 2,5 km.',
    ],
    // OpenStreetMap way 179679714 "Stephanie and Fred Shuman Reservoir Running Track", simplified to within 1 m
    source: OSM,
    points: [
      [40.782163, -73.962538], [40.782071, -73.962314], [40.782008, -73.962056], [40.781989, -73.961865],
      [40.782002, -73.961569], [40.78204, -73.961366], [40.782125, -73.961126], [40.782232, -73.96094],
      [40.78232, -73.960834], [40.782436, -73.96072], [40.786376, -73.957851], [40.786505, -73.957776],
      [40.786695, -73.957733], [40.78702, -73.957758], [40.787622, -73.95772], [40.788067, -73.957575],
      [40.788361, -73.957444], [40.788439, -73.957436], [40.78862, -73.957465], [40.788764, -73.957549],
      [40.788851, -73.957649], [40.788938, -73.957802], [40.788998, -73.958044], [40.788998, -73.958242],
      [40.788973, -73.958378], [40.788849, -73.958673], [40.788759, -73.958952], [40.788696, -73.959258],
      [40.788675, -73.959573], [40.788686, -73.959831], [40.788733, -73.96011], [40.78879, -73.960332],
      [40.78895, -73.960777], [40.788972, -73.961057], [40.788959, -73.961292], [40.788916, -73.961491],
      [40.788854, -73.961655], [40.788737, -73.961852], [40.788581, -73.962013], [40.788466, -73.962164],
      [40.78839, -73.962307], [40.788333, -73.96249], [40.788307, -73.962772], [40.788335, -73.963035],
      [40.788337, -73.963229], [40.78829, -73.963661], [40.788274, -73.964022], [40.788292, -73.964235],
      [40.788349, -73.964576], [40.788349, -73.964825], [40.788325, -73.965019], [40.788288, -73.965192],
      [40.78822, -73.965406], [40.788092, -73.965673], [40.787985, -73.965828], [40.787749, -73.966063],
      [40.787537, -73.966191], [40.7874, -73.966242], [40.785346, -73.966717], [40.785127, -73.966707],
      [40.784955, -73.96658], [40.784828, -73.966432], [40.784587, -73.966097], [40.784303, -73.965533],
      [40.784142, -73.965088], [40.783987, -73.96447], [40.783929, -73.964302], [40.783823, -73.964057],
      [40.783678, -73.963809], [40.783483, -73.963569], [40.783276, -73.963383], [40.783158, -73.9633],
      [40.782901, -73.963176], [40.782612, -73.963087], [40.782469, -73.962999], [40.782358, -73.962893],
      [40.782306, -73.962816], [40.782163, -73.962538],
    ],
  },
];

/** A route for the library: its own copy of the points, a new id. Its description is the example's, in the language of the app, until the person writes their own. */
export function exampleRoute(example: RouteExample, id: string, now: number): Route {
  return { id, name: example.name, updated: now, country: example.country, defaultSpeed: example.defaultSpeed, example: example.key, points: example.points.map(([lat, lon]) => ({ lat, lon })) };
}

/**
 * The text to show for a route. A text the person wrote is shown as it is (it has no language we know); the text of an
 * example route follows the language of the app, and says which one it is, for the lang attribute of the element.
 */
export function routeDescription(r: Route, lang: Lang, examples: readonly RouteExample[] = ROUTE_EXAMPLES): { text: string; lang: Lang | null } | null {
  if (r.description) return { text: r.description, lang: null };
  const ex = r.example ? examples.find(e => e.key === r.example) : undefined;
  return ex ? { text: ex.description[lang], lang } : null;
}

/**
 * What to store after the description was edited. An example route whose field was left as shown stays an example (its
 * text keeps following the language); any other text, or an empty one, is the person's own from then on.
 */
export function descriptionAfterEdit(r: Route, typed: string, lang: Lang, examples: readonly RouteExample[] = ROUTE_EXAMPLES): { description?: string; example?: string } {
  const shown = r.example && !r.description ? routeDescription(r, lang, examples) : null;
  if (shown && typed.trim() === shown.text.trim()) return { example: r.example! };
  return typed.trim() ? { description: typed } : {};
}

/**
 * A route in the library that is a copy of an example made before routes knew their example (the person copied it by
 * hand, or an earlier version saved it with a text): it becomes that example, so its text follows the language and it
 * has the example's walking speed. Recognised by name, start and length. A text the person wrote stays; one speed the
 * person has set stays. null = nothing to change.
 */
export function adoptExample(r: Route, example: RouteExample): Route | null {
  if (r.example !== undefined || r.name !== example.name) return null;
  const first = example.points[0]!, start = r.points[0]!;
  if (Math.abs(start.lat - first[0]) > 0.001 || Math.abs(start.lon - first[1]) > 0.001) return null;
  const total = analyzeRoute(exampleRoute(example, r.id, r.updated)).total;
  if (Math.abs(analyzeRoute(r).total - total) > total * 0.02) return null;
  const own = r.description !== undefined && ![...Object.values(example.description), ...example.previousDescriptions].includes(r.description);
  const { description: _old, ...rest } = r;
  return { ...rest, ...(own ? { description: r.description } : {}), example: example.key, defaultSpeed: r.defaultSpeed ?? example.defaultSpeed };
}

/** localStorage key: the keys of the examples that were put into the library already */
export const SEEDED_STORAGE_KEY = 'walkflow.exampleRoutes';

/** The stored list of keys; anything else (missing, damaged) counts as empty */
export function readSeeded(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
}

/** The examples to put into the library now: not seeded before, and not already there under the same name */
export function examplesToSeed(seeded: readonly string[], existingNames: readonly string[], examples: readonly RouteExample[] = ROUTE_EXAMPLES): RouteExample[] {
  return examples.filter(e => !seeded.includes(e.key) && !existingNames.includes(e.name));
}

/** The list to store afterwards: every current example counts as seeded, whether it was added or already there */
export function markSeeded(seeded: readonly string[], examples: readonly RouteExample[] = ROUTE_EXAMPLES): string[] {
  return [...new Set([...seeded, ...examples.map(e => e.key)])];
}
