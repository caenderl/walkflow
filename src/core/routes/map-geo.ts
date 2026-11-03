// What the map needs from a route, as plain data: no map library here, so it is testable without a browser.

import type { RoutePoint } from './routes';

/** [longitude, latitude], the order maps use */
export type LngLat = [number, number];

/** South-west and north-east corner */
export function routeBounds(points: readonly RoutePoint[]): [LngLat, LngLat] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    if (p.lon < w) w = p.lon;
    if (p.lon > e) e = p.lon;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return [[w, s], [e, n]];
}

export interface RouteLine {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'LineString'; coordinates: LngLat[] };
}

export function routeLine(points: readonly RoutePoint[]): RouteLine {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map(p => [p.lon, p.lat] as LngLat) } };
}

const OUTLINE_MAX_POINTS = 120;

export interface RouteOutline {
  /** SVG path data, north up, inside a square of `size` */
  d: string;
  start: [number, number];
  end: [number, number];
}

/**
 * The shape of a route as a small drawing, worked out from its points alone (no map, no request). Longitude is scaled by
 * the latitude so the shape is not stretched; it is fitted into a square with `pad` free all round and centred.
 */
export function routeOutline(points: readonly RoutePoint[], size = 64, pad = 4): RouteOutline {
  let pts = points;
  if (pts.length > OUTLINE_MAX_POINTS) {
    const stride = Math.ceil((pts.length - 1) / (OUTLINE_MAX_POINTS - 1));
    const kept = pts.filter((_, i) => i % stride === 0);
    if ((pts.length - 1) % stride !== 0) kept.push(pts.at(-1)!);
    pts = kept;
  }
  const k = Math.cos((pts.reduce((s, p) => s + p.lat, 0) / Math.max(pts.length, 1) * Math.PI) / 180);
  const xs = pts.map(p => p.lon * k), ys = pts.map(p => -p.lat);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const room = size - 2 * pad;
  const scale = Math.max(w, h) > 0 ? room / Math.max(w, h) : 0;
  const ox = pad + (room - w * scale) / 2, oy = pad + (room - h * scale) / 2;
  const at = (i: number): [number, number] => [Number((ox + (xs[i]! - x0) * scale).toFixed(1)), Number((oy + (ys[i]! - y0) * scale).toFixed(1))];
  const all = pts.map((_, i) => at(i));
  return { d: all.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(''), start: all[0]!, end: all.at(-1)! };
}
