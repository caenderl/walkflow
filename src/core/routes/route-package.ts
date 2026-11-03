// The route package: one JSON file that holds a route with what goes with it (texts in several languages, place, credit,
// tags), so it can be shared, kept in a catalogue and installed. Format "walkflow-route", version 1; the format is
// described in docs/ROUTE-PACKAGE.md. No DOM and no storage here.
//
// A package is data and never code. Reading one checks everything (readRoute) and makes a new route: an id or a date
// inside the file is not used, so an import can never replace a route that is already there.

import { exampleRoute, ROUTE_EXAMPLES, type RouteExample } from './route-examples';
import { plainName, readLangMap, readRoute, ROUTE_NAME_MAX, type Route, type RouteMeta } from './routes';

export const PACKAGE_FORMAT = 'walkflow-route';
export const PACKAGE_VERSION = 1;
/** A package of a few thousand points is well below this */
export const PACKAGE_MAX_CHARS = 2_000_000;
/** Language key for a text whose language is not known (a text the person wrote) */
export const UNDETERMINED = 'und';

export type PackagePoint = [lat: number, lon: number] | [lat: number, lon: number, ele: number];

export interface RoutePackage {
  format: typeof PACKAGE_FORMAT;
  version: number;
  /** Language code → name; at least one. "und" for a name whose language is not known (a name the person typed). */
  name: Record<string, string>;
  /** Language code → where it is */
  place?: Record<string, string>;
  /** ISO 3166-1 alpha-2 */
  country?: string;
  /** km/h; a suggestion, the speed limit of the person still applies */
  defaultSpeed?: number;
  tags?: string[];
  author?: string;
  license?: string;
  source?: string;
  /** Language code → text; "und" for a text without a known language */
  description?: Record<string, string>;
  points: PackagePoint[];
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** The package of a route; an example route brings its texts in every language, its place and its source. */
export function packageFromRoute(r: Route, examples: readonly RouteExample[] = ROUTE_EXAMPLES): RoutePackage {
  const ex = r.example ? examples.find(e => e.key === r.example) : undefined;
  const description: Record<string, string> | undefined = r.description ? { [UNDETERMINED]: r.description } : ex ? { ...ex.description } : r.texts ? { ...r.texts } : undefined;
  const meta: RouteMeta = { ...(ex ? { place: { ...ex.place }, source: ex.source } : {}), ...r.meta };
  const name: Record<string, string> = r.names ? { ...r.names } : ex ? { ...ex.names } : { [UNDETERMINED]: r.name };
  const pkg: RoutePackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    name,
    ...(meta.place ? { place: meta.place } : {}),
    ...(r.country ? { country: r.country } : {}),
    ...(r.defaultSpeed !== undefined ? { defaultSpeed: r.defaultSpeed } : {}),
    ...(meta.tags ? { tags: [...meta.tags] } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.license ? { license: meta.license } : {}),
    ...(meta.source ? { source: meta.source } : {}),
    ...(description ? { description } : {}),
    points: r.points.map((p): PackagePoint => (p.ele === undefined ? [round(p.lat, 6), round(p.lon, 6)] : [round(p.lat, 6), round(p.lon, 6), round(p.ele, 1)])),
  };
  return pkg;
}

/** The package of an example, as it would be kept in a catalogue */
export const examplePackage = (ex: RouteExample): RoutePackage => packageFromRoute(exampleRoute(ex, 'example', 0), [ex]);

/** JSON with one point per line, so a change to a route shows line by line in a review */
export function serializePackage(p: RoutePackage): string {
  const { points, ...head } = p;
  const lines = points.map(pt => `    ${JSON.stringify(pt).replace(/,/g, ', ')}`);
  return `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "points": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export type PackageResult =
  | { ok: true; route: Route }
  | { ok: false; reason: 'unreadable' | 'tooLarge' | 'newer' | 'invalid' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads the text of a package file into a new route with the given id and time. */
export function readPackage(text: string, id: string, now: number): PackageResult {
  if (text.length > PACKAGE_MAX_CHARS) return { ok: false, reason: 'tooLarge' };
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: 'unreadable' }; }
  if (!isObject(v) || v.format !== PACKAGE_FORMAT) return { ok: false, reason: 'unreadable' };
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return { ok: false, reason: 'invalid' };
  if (v.version > PACKAGE_VERSION) return { ok: false, reason: 'newer' };
  // The names in every language; the plain name of the route is the one without a language, else English, else the first
  const names = readLangMap(v.name, ROUTE_NAME_MAX, true);
  const name = names && plainName(names);
  if (!names || !name) return { ok: false, reason: 'invalid' };
  if (!Array.isArray(v.points)) return { ok: false, reason: 'invalid' };

  const points: { lat: number; lon: number; ele?: number }[] = [];
  for (const pt of v.points as unknown[]) {
    if (!Array.isArray(pt) || (pt.length !== 2 && pt.length !== 3) || !pt.every(n => typeof n === 'number')) return { ok: false, reason: 'invalid' };
    points.push(pt.length === 3 ? { lat: pt[0] as number, lon: pt[1] as number, ele: pt[2] as number } : { lat: pt[0] as number, lon: pt[1] as number });
  }

  // "und" is a text without a known language: it is the description, the others are translations
  const texts = isObject(v.description) ? { ...v.description } : undefined;
  const own = texts?.[UNDETERMINED];
  if (texts) delete texts[UNDETERMINED];

  const route = readRoute({
    id, name, names, updated: now, points,
    country: v.country, defaultSpeed: v.defaultSpeed,
    description: own, texts,
    meta: { place: v.place, author: v.author, license: v.license, source: v.source, tags: v.tags },
  });
  return route ? { ok: true, route } : { ok: false, reason: 'invalid' };
}

/** The name of the file to save a package as */
export function packageFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'route'}.walkflow`;
}
