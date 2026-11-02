import { describe, expect, it } from 'vitest';
import {
  analyzeRoute, DistanceTracker, distanceBetween, elevationSeries, gradeAhead, newRouteId, pointAt, readRoute, readRoutes,
  ROUTE_MAX_POINTS, walkSeconds, walkSteps, type Route, type RoutePoint,
} from './routes';

/** 0.001° of longitude at the equator, in metres */
const MILLI_DEG = 111.195;

/** A straight line east along the equator, `step` metres apart (approx.), with optional elevations */
function line(n: number, ele?: (i: number) => number): RoutePoint[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 0, lon: (i * 0.001), ...(ele ? { ele: ele(i) } : {}) }));
}

const route = (points: RoutePoint[], extra: Partial<Route> = {}): Route => ({ id: 'r1', name: 'Loop', points, updated: 1, ...extra });

describe('distanceBetween', () => {
  it('is about 111.2 km per degree of latitude and zero for the same point', () => {
    expect(distanceBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -2);
    expect(distanceBetween({ lat: 48, lon: 11 }, { lat: 48, lon: 11 })).toBe(0);
  });

  it('shrinks east-west with the latitude', () => {
    const eq = distanceBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const at60 = distanceBetween({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });
    expect(at60 / eq).toBeCloseTo(0.5, 2);
  });
});

describe('analyzeRoute', () => {
  it('gives the cumulative distance per point and the total', () => {
    const s = analyzeRoute(route(line(4)));
    expect(s.cum[0]).toBe(0);
    expect(s.cum[3]).toBeCloseTo(3 * MILLI_DEG, 1);
    expect(s.total).toBe(s.cum[3]);
  });

  it('has no elevation figures without elevations', () => {
    const s = analyzeRoute(route(line(3)));
    expect(s.hasElevation).toBe(false);
    expect(s.ascent).toBe(0);
    expect(s.min).toBeUndefined();
  });

  it('counts ascent and descent with a 3 m hysteresis, so GPS noise does not add up', () => {
    const eles = [100, 101, 100.5, 101.2, 104, 110, 108, 100];
    const s = analyzeRoute(route(line(eles.length, i => eles[i]!)));
    expect(s.hasElevation).toBe(true);
    expect(s.ascent).toBe(10);
    expect(s.descent).toBe(10);
    expect(s.min).toBe(100);
    expect(s.max).toBe(110);
  });

  it('does not count a slow, steady noise-sized wobble as climbing', () => {
    const s = analyzeRoute(route(line(40, i => 100 + (i % 2) * 2)));
    expect(s.ascent).toBe(0);
    expect(s.descent).toBe(0);
  });
});

describe('pointAt', () => {
  const r = route(line(3, i => 100 + i * 10));
  const s = analyzeRoute(r);

  it('interpolates between the points', () => {
    const p = pointAt(r, s, 1.5 * MILLI_DEG);
    expect(p.lon).toBeCloseTo(0.0015, 6);
    expect(p.ele).toBeCloseTo(115, 1);
    expect(p.fraction).toBeCloseTo(0.75, 2);
    expect(p.done).toBe(false);
  });

  it('stays on the route before the start and after the end', () => {
    expect(pointAt(r, s, -50).lon).toBe(0);
    expect(pointAt(r, s, -50).meters).toBe(0);
    const end = pointAt(r, s, 1e9);
    expect(end.lon).toBeCloseTo(0.002, 6);
    expect(end.fraction).toBe(1);
    expect(end.done).toBe(true);
  });

  it('treats NaN as the start', () => {
    expect(pointAt(r, s, NaN).meters).toBe(0);
  });

  it('has no elevation on a route without elevations', () => {
    const flat = route(line(3));
    expect(pointAt(flat, analyzeRoute(flat), 100).ele).toBeUndefined();
  });
});

describe('gradeAhead', () => {
  it('is the slope over the next 100 m in percent', () => {
    // 11.1195 m up per 111.195 m = 10 %
    const r = route(line(6, i => i * 11.1195));
    expect(gradeAhead(r, analyzeRoute(r), 50)).toBeCloseTo(10, 0);
  });

  it('is negative downhill', () => {
    const r = route(line(6, i => 100 - i * 5.5598));
    expect(gradeAhead(r, analyzeRoute(r), 0)).toBeCloseTo(-5, 0);
  });

  it('is unknown without elevations and in the last 10 m', () => {
    const flat = route(line(4));
    expect(gradeAhead(flat, analyzeRoute(flat), 10)).toBeUndefined();
    const r = route(line(4, i => i));
    const s = analyzeRoute(r);
    expect(gradeAhead(r, s, s.total - 5)).toBeUndefined();
  });

  it('looks only as far as the end of the route', () => {
    const r = route(line(2, i => i * 5.5598));
    // 111 m long, standing at 50 m: 61 m ahead are left, not 100
    expect(gradeAhead(r, analyzeRoute(r), 50)).toBeCloseTo(5, 0);
  });
});

describe('elevationSeries', () => {
  it('samples the elevation evenly along the distance, ends included', () => {
    const r = route(line(3, i => i * 10));
    const series = elevationSeries(r, analyzeRoute(r), 5);
    expect(series).toHaveLength(5);
    expect(series![0]).toBe(0);
    expect(series![2]).toBeCloseTo(10, 5);
    expect(series![4]).toBeCloseTo(20, 5);
  });

  it('is null without elevations', () => {
    const r = route(line(3));
    expect(elevationSeries(r, analyzeRoute(r), 5)).toBeNull();
  });
});

describe('readRoute', () => {
  const good = { id: 'r1', name: 'Park loop', updated: 5, points: [{ lat: 48.1, lon: 11.5, ele: 520 }, { lat: 48.101, lon: 11.5, ele: 521 }] };

  it('accepts a valid route and keeps only the known fields', () => {
    expect(readRoute({ ...good, extra: 1, points: good.points.map(p => ({ ...p, junk: 1 })) })).toEqual(good);
  });

  it('accepts a route without elevations', () => {
    const points = good.points.map(({ lat, lon }) => ({ lat, lon }));
    expect(readRoute({ ...good, points })?.points).toEqual(points);
  });

  it('trims the name and rejects empty or very long ones', () => {
    expect(readRoute({ ...good, name: '  Park loop ' })?.name).toBe('Park loop');
    expect(readRoute({ ...good, name: ' ' })).toBeNull();
    expect(readRoute({ ...good, name: 'x'.repeat(81) })).toBeNull();
  });

  it('rejects ids that are missing or too long', () => {
    expect(readRoute({ ...good, id: '' })).toBeNull();
    expect(readRoute({ ...good, id: 'x'.repeat(65) })).toBeNull();
    expect(readRoute({ ...good, id: 5 })).toBeNull();
  });

  it('rejects what is not a bounded list of real coordinates', () => {
    expect(readRoute(null)).toBeNull();
    expect(readRoute({ ...good, points: [good.points[0]] })).toBeNull();
    expect(readRoute({ ...good, points: 'x' })).toBeNull();
    expect(readRoute({ ...good, points: [good.points[0], { lat: 91, lon: 0, ele: 1 }] })).toBeNull();
    expect(readRoute({ ...good, points: [good.points[0], { lat: 0, lon: 181, ele: 1 }] })).toBeNull();
    expect(readRoute({ ...good, points: [good.points[0], { lat: NaN, lon: 0, ele: 1 }] })).toBeNull();
    expect(readRoute({ ...good, points: [good.points[0], { lat: '1', lon: 0, ele: 1 }] })).toBeNull();
    expect(readRoute({ ...good, points: Array.from({ length: ROUTE_MAX_POINTS + 1 }, (_, i) => ({ lat: 0, lon: i / 1e5, ele: 1 })) })).toBeNull();
  });

  it('wants elevations for all points or for none, and sane ones', () => {
    expect(readRoute({ ...good, points: [good.points[0], { lat: 48.101, lon: 11.5 }] })).toBeNull();
    expect(readRoute({ ...good, points: [{ ...good.points[0], ele: 9001 }, good.points[1]] })).toBeNull();
    expect(readRoute({ ...good, points: [{ ...good.points[0], ele: -501 }, good.points[1]] })).toBeNull();
    expect(readRoute({ ...good, points: [{ ...good.points[0], ele: NaN }, good.points[1]] })).toBeNull();
  });

  it('rejects a route that is not a distance at all', () => {
    expect(readRoute({ ...good, points: [{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }] })).toBeNull();
  });

  it('rejects a missing update time', () => {
    expect(readRoute({ ...good, updated: 'x' })).toBeNull();
  });
});

describe('readRoutes', () => {
  const ok = (id: string) => ({ id, name: id, updated: 1, points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }] });

  it('keeps the valid ones, counts the rest, the later one wins for the same id', () => {
    const r = readRoutes([ok('a'), { nope: true }, { ...ok('a'), name: 'later' }, ok('b')]);
    expect(r.routes.map(x => x.name)).toEqual(['later', 'b']);
    expect(r.invalid).toBe(1);
  });

  it('treats anything but an array as empty', () => {
    expect(readRoutes(undefined)).toEqual({ routes: [], invalid: 0 });
    expect(readRoutes({})).toEqual({ routes: [], invalid: 0 });
  });
});

describe('newRouteId', () => {
  it('is unique per time and random part', () => {
    expect(newRouteId(1000, () => 0.5)).toBe(newRouteId(1000, () => 0.5));
    expect(newRouteId(1000, () => 0.5)).not.toBe(newRouteId(1001, () => 0.5));
    expect(newRouteId(1000, () => 0.1)).not.toBe(newRouteId(1000, () => 0.9));
  });
});

// The route only shows where on the route you are. It follows the treadmill's own distance counter and never
// writes anything to the treadmill.
describe('DistanceTracker', () => {
  it('uses the first reading as the starting point', () => {
    const t = new DistanceTracker();
    expect(t.update(5000)).toBe(0);
    expect(t.update(5100)).toBe(100);
  });

  it('ignores readings that are not there', () => {
    const t = new DistanceTracker();
    t.update(0);
    t.update(40);
    expect(t.update(undefined)).toBe(40);
    expect(t.update(NaN)).toBe(40);
    expect(t.update(70)).toBe(70);
  });

  it('never goes back when the treadmill counter resets, and counts on from the new start', () => {
    const t = new DistanceTracker();
    t.update(0);
    t.update(300);
    expect(t.update(0)).toBe(300);
    expect(t.update(50)).toBe(350);
  });

  it('does not count when the counter stands still', () => {
    const t = new DistanceTracker();
    t.update(10);
    t.update(10);
    expect(t.update(10)).toBe(0);
  });

  it('restarts from zero at the current reading', () => {
    const t = new DistanceTracker();
    t.update(0);
    t.update(120);
    t.reset();
    expect(t.covered).toBe(0);
    expect(t.update(150)).toBe(30);
  });
});

// Walking a route is a workout like any other: one distance step at a speed the person chooses. The speed never
// comes from the file, so a route can not make the belt faster than what was typed and confirmed.
describe('walkSteps', () => {
  const r = route(line(6, i => i));
  const stats = analyzeRoute(r);

  it('is one distance step over the whole route at the chosen speed', () => {
    expect(walkSteps(stats, 4.5)).toEqual([{ meters: Math.round(stats.total), speed: 4.5 }]);
  });

  it('does not depend on elevations or on the number of points', () => {
    const flat = analyzeRoute(route(line(2)));
    expect(walkSteps(flat, 3)).toEqual([{ meters: Math.round(flat.total), speed: 3 }]);
  });

  it('refuses a speed that is not a positive number, since a distance step without speed never ends', () => {
    for (const bad of [0, -1, NaN, Infinity]) expect(walkSteps(stats, bad)).toBeNull();
  });

  it('refuses a route that is longer than a workout step may be', () => {
    const huge = analyzeRoute(route([{ lat: 0, lon: 0 }, { lat: 0, lon: 1.5 }]));
    expect(huge.total).toBeGreaterThan(100_000);
    expect(walkSteps(huge, 4)).toBeNull();
  });
});

describe('walkSeconds', () => {
  it('is distance over speed', () => {
    expect(walkSeconds(5000, 5)).toBe(3600);
    expect(walkSeconds(1000, 3.6)).toBe(1000);
  });

  it('is 0 without a usable speed', () => {
    expect(walkSeconds(1000, 0)).toBe(0);
    expect(walkSeconds(1000, NaN)).toBe(0);
    expect(walkSeconds(1000, -2)).toBe(0);
  });
});
