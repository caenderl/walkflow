// The route package: one JSON file that holds a route with what goes with it (texts in several languages, place, credit,
// tags), so it can be shared, kept in a catalogue and installed. Format "walkflow-route", version 1; the format is
// described in docs/ROUTE-PACKAGE.md. No DOM and no storage here.
//
// A package is data and never code. Reading one checks everything (readRoute) and makes a new route: an id or a date
// inside the file is not used, so an import can never replace a route that is already there.

import { isRevision, plainName, readLangMap, readRoute, ROUTE_NAME_MAX, type Route, type RouteMeta } from './routes';

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
  /** The version of this route's content, a whole number from 1 (missing = 1). Raise it when a route in the store changes: a copy with a lower one is offered an update. */
  revision?: number;
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
  /** Places along the route: where (`at`, [lat, lon]), a name and optionally a text, each in several languages */
  waypoints?: { at: [lat: number, lon: number]; name: Record<string, string>; text?: Record<string, string> }[];
  points: PackagePoint[];
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** The package of a route: its names, texts and place in every language it has them, and its credit */
export function packageFromRoute(r: Route): RoutePackage {
  const description: Record<string, string> | undefined = r.description ? { [UNDETERMINED]: r.description } : r.texts ? { ...r.texts } : undefined;
  const meta: RouteMeta = { ...r.meta };
  const name: Record<string, string> = r.names ? { ...r.names } : { [UNDETERMINED]: r.name };
  const pkg: RoutePackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    ...(r.revision !== undefined ? { revision: r.revision } : {}),
    name,
    ...(meta.place ? { place: meta.place } : {}),
    ...(r.country ? { country: r.country } : {}),
    ...(r.defaultSpeed !== undefined ? { defaultSpeed: r.defaultSpeed } : {}),
    ...(meta.tags ? { tags: [...meta.tags] } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.license ? { license: meta.license } : {}),
    ...(meta.source ? { source: meta.source } : {}),
    ...(description ? { description } : {}),
    ...(r.waypoints?.length ? { waypoints: r.waypoints.map(w => ({ at: [round(w.lat, 6), round(w.lon, 6)] as [number, number], name: { ...w.name }, ...(w.text ? { text: { ...w.text } } : {}) })) } : {}),
    points: r.points.map((p): PackagePoint => (p.ele === undefined ? [round(p.lat, 6), round(p.lon, 6)] : [round(p.lat, 6), round(p.lon, 6), round(p.ele, 1)])),
  };
  return pkg;
}

/** JSON with one point per line, so a change to a route shows line by line in a review */
export function serializePackage(p: RoutePackage): string {
  const { points, ...head } = p;
  const lines = points.map(pt => `    ${JSON.stringify(pt).replace(/,/g, ', ')}`);
  // A waypoint's `at` on one line, like a point
  const text = JSON.stringify(head, null, 2).replace(/"at": \[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '"at": [$1, $2]');
  return `${text.slice(0, -2)},\n  "points": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export type PackageResult =
  | { ok: true; route: Route }
  | { ok: false; reason: 'unreadable' | 'tooLarge' | 'newer' | 'invalid' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `at` is [lat, lon]; what cannot be read is left out here and again in readRoute */
function readPackageWaypoints(v: unknown): unknown[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return (v as unknown[]).map(w => (isObject(w) && Array.isArray(w.at) && w.at.length === 2 ? { lat: w.at[0], lon: w.at[1], name: w.name, text: w.text } : null)).filter(w => w !== null);
}

/** Reads the text of a package file into a new route with the given id and time. */
export function readPackage(text: string, id: string, now: number): PackageResult {
  if (text.length > PACKAGE_MAX_CHARS) return { ok: false, reason: 'tooLarge' };
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: 'unreadable' }; }
  if (!isObject(v) || v.format !== PACKAGE_FORMAT) return { ok: false, reason: 'unreadable' };
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return { ok: false, reason: 'invalid' };
  if (v.version > PACKAGE_VERSION) return { ok: false, reason: 'newer' };
  if (v.revision !== undefined && !isRevision(v.revision)) return { ok: false, reason: 'invalid' };
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
    id, name, names, updated: now, points, revision: v.revision,
    country: v.country, defaultSpeed: v.defaultSpeed,
    description: own, texts, waypoints: readPackageWaypoints(v.waypoints),
    meta: { place: v.place, author: v.author, license: v.license, source: v.source, tags: v.tags },
  });
  return route ? { ok: true, route } : { ok: false, reason: 'invalid' };
}

/** The name of the file to save a package as */
export function packageFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'route'}.walkflow`;
}
