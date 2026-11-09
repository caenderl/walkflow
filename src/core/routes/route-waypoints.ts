// Waypoints of a route: places along it that are worth a word (a bridge, a view, where the path turns). A waypoint is a point
// on the map with a name and an optional text in several languages. Where it is along the route is worked out here from the
// route itself, so it stays right when the route is improved or simplified. Pure: no DOM, nothing sent to the treadmill.

import type { Lang } from '../../i18n/i18n';
import { plainName, type Route, type RouteStats, type Waypoint } from './routes';

/** A waypoint further than this from the route does not belong to it and is left out */
export const WAYPOINT_MAX_OFFSET = 150;
/** A waypoint that was passed a few metres ago still counts as there (the treadmill's distance counter is not that exact) */
const PASSED_MARGIN = 10;
/** Metres per degree of latitude on a sphere of the earth's radius, like the distances in routes.ts */
const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_000;
/** A later place on a loop has to be this much closer to count as better than an earlier one */
const TIE = 0.5;

export interface PlacedWaypoint {
  waypoint: Waypoint;
  /** Metres from the start of the route */
  meters: number;
  /** How far from the route the waypoint is, in metres */
  offset: number;
}

/** The waypoints of a route along it, in the order of the route; those too far away are left out */
export function placeWaypoints(route: Route, stats: RouteStats): PlacedWaypoint[] {
  const pts = route.points;
  const placed: PlacedWaypoint[] = [];
  for (const waypoint of route.waypoints ?? []) {
    const kx = METERS_PER_DEGREE * Math.cos((waypoint.lat * Math.PI) / 180);
    // The route's points in metres east and north of the waypoint
    const xy = (i: number): [number, number] => [(pts[i]!.lon - waypoint.lon) * kx, (pts[i]!.lat - waypoint.lat) * METERS_PER_DEGREE];
    let best = { offset: Infinity, meters: 0 };
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = xy(i), [bx, by] = xy(i + 1);
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
      const offset = Math.hypot(ax + t * dx, ay + t * dy);
      if (offset < best.offset - TIE) best = { offset, meters: stats.cum[i]! + t * (stats.cum[i + 1]! - stats.cum[i]!) };
    }
    if (best.offset <= WAYPOINT_MAX_OFFSET) placed.push({ waypoint, ...best });
  }
  return placed.sort((a, b) => a.meters - b.meters);
}

/** The first waypoint that is still ahead, with the metres to go (a little behind counts as still there); null if there is none */
export function nextWaypoint(placed: readonly PlacedWaypoint[], covered: number): (PlacedWaypoint & { ahead: number }) | null {
  const next = placed.find(p => p.meters >= covered - PASSED_MARGIN);
  return next ? { ...next, ahead: Math.max(0, next.meters - covered) } : null;
}

/** A text of a waypoint in the language of the app, else the plain one, else English, else any */
export function waypointText(texts: Readonly<Record<string, string>> | undefined, lang: Lang): string | undefined {
  return texts && (texts[lang] ?? plainName(texts));
}
