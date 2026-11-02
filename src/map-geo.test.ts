import { describe, expect, it } from 'vitest';
import { routeBounds, routeLine, routeOutline } from './map-geo';

const points = [{ lat: 48.1, lon: 11.5, ele: 520 }, { lat: 48.103, lon: 11.49, ele: 523 }, { lat: 48.098, lon: 11.507, ele: 521 }];

describe('routeBounds', () => {
  it('is south-west and north-east corner as [lon, lat]', () => {
    expect(routeBounds(points)).toEqual([[11.49, 48.098], [11.507, 48.103]]);
  });

  it('has the same corners for a route along one meridian', () => {
    expect(routeBounds([{ lat: 1, lon: 2 }, { lat: 1.5, lon: 2 }])).toEqual([[2, 1], [2, 1.5]]);
  });
});

describe('routeLine', () => {
  it('is a GeoJSON line with [lon, lat] in the order of the route and no elevation', () => {
    const f = routeLine(points);
    expect(f.type).toBe('Feature');
    expect(f.geometry.type).toBe('LineString');
    expect(f.geometry.coordinates).toEqual([[11.5, 48.1], [11.49, 48.103], [11.507, 48.098]]);
    expect(f.properties).toEqual({});
  });
});

describe('routeOutline', () => {
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const loop = Array.from({ length: 41 }, (_, i) => ({ lat: 48 + 0.004 * Math.sin((i / 40) * 2 * Math.PI), lon: 11.5 + 0.004 * Math.cos((i / 40) * 2 * Math.PI) }));

  it('draws the route as a path inside the box, with the padding kept free', () => {
    const o = routeOutline(loop, 64, 6);
    const xy = nums(o.d);
    expect(o.d.startsWith('M')).toBe(true);
    expect(xy.length).toBeGreaterThanOrEqual(8);
    for (const v of xy) { expect(v).toBeGreaterThanOrEqual(6 - 0.01); expect(v).toBeLessThanOrEqual(58 + 0.01); }
  });

  it('keeps the shape: a route twice as wide as it is tall (on the ground) stays that way', () => {
    // 0.002° of latitude is as long as 0.002/cos(lat) of longitude, so make the width 2 × the height on the ground
    const k = Math.cos((48 * Math.PI) / 180);
    const flat = [{ lat: 48, lon: 11 }, { lat: 48.002, lon: 11 + (0.004 / k) }, { lat: 48, lon: 11 + (0.008 / k) }];
    const o = routeOutline(flat, 100, 0);
    const xy = nums(o.d);
    const xs = xy.filter((_, i) => i % 2 === 0), ys = xy.filter((_, i) => i % 2 === 1);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    expect(w / h).toBeCloseTo(4, 1);
  });

  it('centres the shorter side and uses the whole of the longer one', () => {
    const o = routeOutline([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }], 64, 4);
    const xy = nums(o.d);
    expect(Math.min(xy[0]!, xy[2]!)).toBeCloseTo(4, 1);
    expect(Math.max(xy[0]!, xy[2]!)).toBeCloseTo(60, 1);
    expect(xy[1]).toBeCloseTo(32, 1);
    expect(xy[3]).toBeCloseTo(32, 1);
  });

  it('gives the start and the end as points in the same box', () => {
    const o = routeOutline(loop, 64, 6);
    for (const p of [o.start, o.end]) { expect(p[0]).toBeGreaterThanOrEqual(5.99); expect(p[0]).toBeLessThanOrEqual(58.01); }
    expect(o.start[0]).toBeCloseTo(nums(o.d)[0]!, 1);
  });

  it('thins a very long route to a few dozen points, keeping the first and the last', () => {
    const long = Array.from({ length: 5000 }, (_, i) => ({ lat: 48 + i * 1e-5, lon: 11 + Math.sin(i / 200) * 1e-3 }));
    const o = routeOutline(long, 64, 4);
    const count = nums(o.d).length / 2;
    expect(count).toBeLessThanOrEqual(150);
    expect(count).toBeGreaterThan(20);
    expect(o.end[1]).toBeCloseTo(nums(o.d).at(-1)!, 1);
  });

  it('copes with a route that is a single point on the ground', () => {
    const o = routeOutline([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }], 64, 4);
    expect(nums(o.d).every(Number.isFinite)).toBe(true);
  });
});
