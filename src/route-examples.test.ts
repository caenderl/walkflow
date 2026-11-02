import { describe, expect, it } from 'vitest';
import { exampleRoute, ROUTE_EXAMPLES } from './route-examples';
import { analyzeRoute, distanceBetween, readRoute, ROUTE_NAME_MAX } from './routes';

describe('ROUTE_EXAMPLES', () => {
  it('has at least one example, with unique keys', () => {
    expect(ROUTE_EXAMPLES.length).toBeGreaterThan(0);
    expect(new Set(ROUTE_EXAMPLES.map(e => e.key)).size).toBe(ROUTE_EXAMPLES.length);
  });

  it('turns every example into a route that passes the same check as an import', () => {
    for (const ex of ROUTE_EXAMPLES) {
      const route = readRoute(exampleRoute(ex, 'new-id', 1234));
      expect(route, ex.key).not.toBeNull();
      expect(route!.id).toBe('new-id');
      expect(route!.name).toBe(ex.name);
      expect(route!.updated).toBe(1234);
    }
  });

  it('keeps every example to a walkable length: no marathon', () => {
    for (const ex of ROUTE_EXAMPLES) {
      const total = analyzeRoute(exampleRoute(ex, 'x', 0)).total;
      expect(total, ex.key).toBeGreaterThan(500);
      expect(total, ex.key).toBeLessThan(10_000);
    }
  });

  it('names the place and where the data comes from', () => {
    for (const ex of ROUTE_EXAMPLES) {
      expect(ex.name.length, ex.key).toBeLessThanOrEqual(ROUTE_NAME_MAX);
      expect(ex.place.trim(), ex.key).not.toBe('');
      expect(ex.source, ex.key).toContain('OpenStreetMap');
    }
  });

  it('gives each route its own copy of the points, so a route cannot change the example', () => {
    const ex = ROUTE_EXAMPLES[0]!;
    const a = exampleRoute(ex, 'a', 0), b = exampleRoute(ex, 'b', 0);
    a.points[0]!.lat = 0;
    expect(b.points[0]!.lat).toBe(ex.points[0]![0]);
    expect(ex.points[0]![0]).not.toBe(0);
  });

  it('has the Central Park reservoir loop as a closed loop of about 2.5 km', () => {
    const ex = ROUTE_EXAMPLES.find(e => e.key === 'central-park-reservoir')!;
    expect(ex).toBeDefined();
    const route = exampleRoute(ex, 'x', 0);
    const total = analyzeRoute(route).total;
    expect(total).toBeGreaterThan(2400);
    expect(total).toBeLessThan(2700);
    expect(distanceBetween(route.points[0]!, route.points.at(-1)!)).toBeLessThan(5);
  });
});
