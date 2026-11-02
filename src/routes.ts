// Saved routes (a GPX track with a name) and where on it you are. No DOM and no storage here, so it is all testable.
// A route only shows progress: it follows the treadmill's own distance counter and never writes to the treadmill,
// neither speed nor incline. What comes from a file or a backup is checked point by point (readRoute).

import { newWorkoutId } from './workouts';

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
}

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

export const newRouteId = newWorkoutId;

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
