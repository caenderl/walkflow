// Saved routes (a GPX track with a name) and where on it you are. No DOM and no storage here, so it is all testable.
// A route only shows progress: it follows the treadmill's own distance counter and never writes to the treadmill,
// neither speed nor incline. What comes from a file or a backup is checked point by point (readRoute).

import { isCountryCode } from './country';
import type { ProgramStep } from '../training/program';
import { newId } from '../id';

export interface RoutePoint {
  lat: number;
  lon: number;
  /** Metres above sea level. A route has elevations for all points or for none. */
  ele?: number;
}

export interface Route {
  id: string;
  name: string;
  points: RoutePoint[];
  /** Unix ms of the last change */
  updated: number;
  /** Country of the start (ISO 3166-1 alpha-2). '' = looked up, none found; missing = not looked up yet. */
  country?: string;
  /** Walking speed in km/h that goes with this route; the duration follows from it. Missing = DEFAULT_WALK_SPEED. */
  defaultSpeed?: number;
  /** Optional text about the route, plain text, in whatever language the person wrote it in */
  description?: string;
  /** Key of the example route this is (src/core/routes/route-examples.ts). While it has no description of its own, the example's text is shown in the language of the app. */
  example?: string;
  /** The name in several languages (language code → name), from a route package; `name` is the plain one for where no language fits (routeName). */
  names?: Record<string, string>;
  /** Texts in several languages (language code → text), from a route package. While it has no description of its own, the one in the language of the app is shown. */
  texts?: Record<string, string>;
  /** Where the route comes from and what it is about; travels with the route when it is exported again */
  meta?: RouteMeta;
  /** The person has switched on sharing this route with the community */
  shared?: true;
  /** Taken from the community: the SHA-256 of the package text as it arrived (lower-case hex). It is passed on while the package the app writes for the route is still byte-identical (core/share/community.ts). */
  communityHash?: string;
}

export interface RouteMeta {
  /** Language code → where it is, for browsing */
  place?: Record<string, string>;
  author?: string;
  /** Free text, e.g. an SPDX identifier */
  license?: string;
  /** Where the track comes from, e.g. the attribution of the data */
  source?: string;
  /** For filtering: lower-case words */
  tags?: string[];
}

/** A bound only so that nothing stored or read is unbounded; a package holds as many languages as it likes below it */
export const ROUTE_LANGS_MAX = 64;
export const ROUTE_TAGS_MAX = 8;
export const ROUTE_META_MAX = 80;
export const ROUTE_SOURCE_MAX = 200;
/** A language, as its ISO 639 code (en, de, fr, gsw …): no country or script (no de-CH, no ch_fr). "und" = not known. */
export const LANG_KEY = /^[a-z]{2,3}$/;
export const TAG_KEY = /^[a-z0-9-]{1,24}$/;

/** Plain text: control characters out (a line break stays), cut to length; '' if nothing is left */
export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max).trim() : '';
}

/** Language code → plain text, as many languages as there are (up to ROUTE_LANGS_MAX); undefined if nothing usable is left */
export function readLangMap(v: unknown, max: number, oneLine = false): Record<string, string> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (Object.keys(out).length >= ROUTE_LANGS_MAX) break;
    const clean = cleanText(value, max);
    const text = oneLine ? clean.replace(/\s+/g, ' ') : clean;
    if (LANG_KEY.test(key) && text) out[key] = text;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The plain name of a route with names in several languages: the one without a language, else English, else the first */
export function plainName(names: Readonly<Record<string, string>>): string | undefined {
  const key = ['und', 'en', ...Object.keys(names).sort()].find(k => names[k]);
  return key ? names[key] : undefined;
}

/** Who made it and under which terms: author, licence, source and tags of a route or a workout. Plain text, cut to length. */
export interface Credit {
  author?: string;
  /** Free text, e.g. an SPDX identifier */
  license?: string;
  /** Where it comes from, e.g. the attribution of the data */
  source?: string;
  /** For filtering: lower-case words */
  tags?: string[];
}

export function readCredit(v: unknown): Credit {
  const credit: Credit = {};
  if (!isObject(v)) return credit;
  for (const key of ['author', 'license'] as const) {
    const text = cleanText(v[key], ROUTE_META_MAX).replace(/\s+/g, ' ');
    if (text) credit[key] = text;
  }
  const source = cleanText(v.source, ROUTE_SOURCE_MAX).replace(/\s+/g, ' ');
  if (source) credit.source = source;
  if (Array.isArray(v.tags)) {
    const tags = [...new Set(v.tags.filter((t): t is string => typeof t === 'string' && TAG_KEY.test(t)))].slice(0, ROUTE_TAGS_MAX);
    if (tags.length) credit.tags = tags;
  }
  return credit;
}

function readMeta(v: unknown): RouteMeta | undefined {
  if (!isObject(v)) return undefined;
  const meta: RouteMeta = {};
  const place = readLangMap(v.place, ROUTE_META_MAX, true);
  if (place) meta.place = place;
  Object.assign(meta, readCredit(v));
  return Object.keys(meta).length ? meta : undefined;
}

export const ROUTE_SPEED_MIN = 0.5;
export const ROUTE_SPEED_MAX = 20;
export const DEFAULT_WALK_SPEED = 3;
export const ROUTE_DESCRIPTION_MAX = 1000;

/** The walking speed of a route in km/h */
export const routeSpeed = (r: Route): number => r.defaultSpeed ?? DEFAULT_WALK_SPEED;

export const ROUTE_MAX_POINTS = 5000;
export const ROUTE_NAME_MAX = 80;
/** Anything shorter is a point, not a route */
export const ROUTE_MIN_METERS = 10;
const ELE_MIN = -500;
const ELE_MAX = 9000;
/** Elevation changes below this are GPS noise and do not count as climbing */
const ASCENT_HYSTERESIS = 3;
const GRADE_WINDOW = 100;
const GRADE_MIN_AHEAD = 10;
const EARTH_RADIUS = 6_371_008.8;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine) */
export function distanceBetween(a: RoutePoint, b: RoutePoint): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface RouteStats {
  /** Metres from the start to each point */
  cum: number[];
  total: number;
  hasElevation: boolean;
  /** Metres climbed / descended, with GPS noise filtered out; 0 without elevations */
  ascent: number;
  descent: number;
  min?: number;
  max?: number;
}

export function analyzeRoute(route: Route): RouteStats {
  const pts = route.points;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + distanceBetween(pts[i - 1]!, pts[i]!));
  const total = cum.at(-1) ?? 0;
  const hasElevation = pts.length > 0 && pts.every(p => p.ele !== undefined);
  if (!hasElevation) return { cum, total, hasElevation, ascent: 0, descent: 0 };
  let ascent = 0, descent = 0, ref = pts[0]!.ele!, min = ref, max = ref;
  for (const p of pts) {
    const e = p.ele!;
    min = Math.min(min, e);
    max = Math.max(max, e);
    const d = e - ref;
    if (d >= ASCENT_HYSTERESIS) { ascent += d; ref = e; } else if (d <= -ASCENT_HYSTERESIS) { descent -= d; ref = e; }
  }
  return { cum, total, hasElevation, ascent, descent, min, max };
}

export interface RoutePosition {
  /** Metres from the start, kept within the route */
  meters: number;
  fraction: number;
  done: boolean;
  lat: number;
  lon: number;
  ele?: number;
}

/** Index of the segment [i, i+1] that contains `meters` (within 0..total) */
function segmentAt(cum: readonly number[], meters: number): number {
  let lo = 0, hi = cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid]! <= meters) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function pointAt(route: Route, stats: RouteStats, meters: number): RoutePosition {
  const pts = route.points;
  const m = Number.isFinite(meters) ? Math.min(Math.max(meters, 0), stats.total) : 0;
  const i = segmentAt(stats.cum, m);
  const a = pts[i]!, b = pts[i + 1] ?? a;
  const len = (stats.cum[i + 1] ?? stats.cum[i]!) - stats.cum[i]!;
  const f = len > 0 ? (m - stats.cum[i]!) / len : 0;
  const pos: RoutePosition = {
    meters: m,
    fraction: stats.total > 0 ? m / stats.total : 0,
    done: m >= stats.total,
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
  };
  if (stats.hasElevation) pos.ele = a.ele! + (b.ele! - a.ele!) * f;
  return pos;
}

/** Slope over the next 100 m (less near the end) in percent; undefined without elevations or in the last 10 m */
export function gradeAhead(route: Route, stats: RouteStats, meters: number, window = GRADE_WINDOW): number | undefined {
  if (!stats.hasElevation) return undefined;
  const here = pointAt(route, stats, meters);
  const there = pointAt(route, stats, here.meters + window);
  const run = there.meters - here.meters;
  if (run < GRADE_MIN_AHEAD) return undefined;
  return ((there.ele! - here.ele!) / run) * 100;
}

/** `count` elevations evenly spread over the distance, ends included; null without elevations */
export function elevationSeries(route: Route, stats: RouteStats, count: number): number[] | null {
  if (!stats.hasElevation || count < 2) return null;
  return Array.from({ length: count }, (_, k) => pointAt(route, stats, (stats.total * k) / (count - 1)).ele!);
}

// ---------- What is read from outside ----------

const isCoord = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

export function readRoute(v: unknown): Route | null {
  if (!isObject(v)) return null;
  const { id, name, points, updated } = v;
  if (typeof id !== 'string' || !id || id.length > 64) return null;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > ROUTE_NAME_MAX) return null;
  if (typeof updated !== 'number' || !Number.isFinite(updated)) return null;
  if (!Array.isArray(points) || points.length < 2 || points.length > ROUTE_MAX_POINTS) return null;
  const out: RoutePoint[] = [];
  let withEle = 0;
  for (const p of points as unknown[]) {
    if (!isObject(p) || !isCoord(p.lat, 90) || !isCoord(p.lon, 180)) return null;
    if (p.ele === undefined) {
      out.push({ lat: p.lat, lon: p.lon });
      continue;
    }
    if (typeof p.ele !== 'number' || !Number.isFinite(p.ele) || p.ele < ELE_MIN || p.ele > ELE_MAX) return null;
    withEle++;
    out.push({ lat: p.lat, lon: p.lon, ele: p.ele });
  }
  if (withEle !== 0 && withEle !== out.length) return null;
  const route: Route = { id, name: trimmed, points: out, updated };
  // A damaged country is dropped, not a reason to lose the route: it is looked up again
  if (v.country === '' || isCountryCode(v.country)) route.country = v.country;
  if (typeof v.defaultSpeed === 'number' && Number.isFinite(v.defaultSpeed) && v.defaultSpeed >= ROUTE_SPEED_MIN && v.defaultSpeed <= ROUTE_SPEED_MAX) route.defaultSpeed = v.defaultSpeed;
  const description = cleanText(v.description, ROUTE_DESCRIPTION_MAX);
  if (description) route.description = description;
  if (typeof v.example === 'string' && /^[a-z0-9-]{1,40}$/.test(v.example)) route.example = v.example;
  const names = readLangMap(v.names, ROUTE_NAME_MAX, true);
  if (names) route.names = names;
  const texts = readLangMap(v.texts, ROUTE_DESCRIPTION_MAX);
  if (texts) route.texts = texts;
  const meta = readMeta(v.meta);
  if (meta) route.meta = meta;
  if (v.shared === true) route.shared = true;
  if (typeof v.communityHash === 'string' && /^[0-9a-f]{64}$/.test(v.communityHash)) route.communityHash = v.communityHash;
  return analyzeRoute(route).total >= ROUTE_MIN_METERS ? route : null;
}

/** Valid routes in order of first appearance; with the same id the later one wins. */
export function readRoutes(v: unknown): { routes: Route[]; invalid: number } {
  if (!Array.isArray(v)) return { routes: [], invalid: 0 };
  const byId = new Map<string, Route>();
  let invalid = 0;
  for (const item of v) {
    const r = readRoute(item);
    if (r) byId.set(r.id, r); else invalid++;
  }
  return { routes: [...byId.values()], invalid };
}

export const newRouteId = newId;

// ---------- Progress ----------

/**
 * Metres walked since the start (or the last restart), taken from the treadmill's distance counter. Like the
 * program runner it adds up positive changes only: a counter that goes back (reset, new session) is a new starting
 * point and takes nothing off.
 */
export class DistanceTracker {
  private last: number | undefined;
  private sum = 0;

  get covered(): number { return this.sum; }

  update(distance: number | undefined): number {
    if (distance === undefined || !Number.isFinite(distance)) return this.sum;
    if (this.last !== undefined && distance > this.last) this.sum += distance - this.last;
    this.last = distance;
    return this.sum;
  }

  /** Back to 0 at the current reading */
  reset(): void { this.sum = 0; }
}

// ---------- Walking a route ----------

/** The most a single workout step may cover (the same bound as for saved workouts) */
const WALK_MAX_METERS = 100_000;

/**
 * A route walk is a workout of one distance step over the whole route at the speed the person chose. The speed never
 * comes from the file. null = no usable speed or a route too long for a step.
 */
export function walkSteps(stats: RouteStats, kmh: number): ProgramStep[] | null {
  if (!Number.isFinite(kmh) || kmh <= 0) return null;
  const meters = Math.round(stats.total);
  return meters > 0 && meters <= WALK_MAX_METERS ? [{ meters, speed: kmh }] : null;
}

/** Seconds a distance takes at a constant speed; 0 without a usable speed */
export function walkSeconds(meters: number, kmh: number): number {
  return Number.isFinite(kmh) && kmh > 0 ? meters / (kmh / 3.6) : 0;
}

/** Whole minutes (rounded up) a distance still takes at a constant speed; 0 when nothing is left or the speed is unusable */
export function minutesLeft(metersLeft: number, kmh: number): number {
  return metersLeft > 0 ? Math.ceil(walkSeconds(metersLeft, kmh) / 60) : 0;
}
