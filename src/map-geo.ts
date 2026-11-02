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
