import { describe, expect, it } from 'vitest';
import { nextWaypoint, placeWaypoints, waypointText, WAYPOINT_MAX_OFFSET } from './route-waypoints';
import { analyzeRoute, type Route, type Waypoint } from './routes';

// A straight route along a meridian: 0.001° of latitude is about 111 m
const line = (n = 11): Route => ({
  id: 'r', name: 'Line', updated: 0,
  points: Array.from({ length: n }, (_, i) => ({ lat: 52 + i * 0.001, lon: 13 })),
});
const wp = (lat: number, lon: number, name: Record<string, string> = { en: 'Here' }, text?: Record<string, string>): Waypoint => ({ lat, lon, name, ...(text ? { text } : {}) });
const place = (route: Route) => placeWaypoints(route, analyzeRoute(route));

describe('placeWaypoints', () => {
  it('puts a waypoint at the metres along the route where the nearest point of the route is', () => {
    const r = { ...line(), waypoints: [wp(52.005, 13)] };
    const [p] = place(r);
    expect(p!.meters).toBeGreaterThan(550);
    expect(p!.meters).toBeLessThan(560);
    expect(p!.offset).toBeLessThan(1);
  });

  it('projects onto the segment: a point between two track points is between them', () => {
    const r = { ...line(3), waypoints: [wp(52.0015, 13)] };
    const [p] = place(r);
    expect(p!.meters).toBeGreaterThan(160);
    expect(p!.meters).toBeLessThan(173);
  });

  it('keeps a waypoint a little beside the route, and says how far it is', () => {
    const r = { ...line(), waypoints: [wp(52.005, 13.0005)] };
    const [p] = place(r);
    expect(p!.offset).toBeGreaterThan(30);
    expect(p!.offset).toBeLessThan(40);
  });

  it('leaves out a waypoint that is too far from the route to belong to it', () => {
    expect(WAYPOINT_MAX_OFFSET).toBe(150);
    const r = { ...line(), waypoints: [wp(52.005, 13.01), wp(52.005, 13)] };
    expect(place(r)).toHaveLength(1);
  });

  it('sorts by position along the route, whatever the order in the file', () => {
    const r = { ...line(), waypoints: [wp(52.008, 13, { en: 'C' }), wp(52.002, 13, { en: 'A' }), wp(52.005, 13, { en: 'B' })] };
    expect(place(r).map(p => p.waypoint.name.en)).toEqual(['A', 'B', 'C']);
  });

  it('puts a waypoint before the start at the start and one past the end at the end', () => {
    const r = { ...line(), waypoints: [wp(51.9995, 13), wp(52.0105, 13)] };
    const placed = place(r);
    expect(placed[0]!.meters).toBe(0);
    expect(placed[1]!.meters).toBeCloseTo(analyzeRoute(r).total, 0);
  });

  it('a loop: a point at the start is the start, not the end', () => {
    const loop: Route = { id: 'l', name: 'Loop', updated: 0, points: [[52, 13], [52.001, 13], [52.001, 13.001], [52, 13.001], [52, 13]].map(([lat, lon]) => ({ lat: lat!, lon: lon! })) };
    const [p] = place({ ...loop, waypoints: [wp(52, 13)] });
    expect(p!.meters).toBe(0);
  });

  it('is empty for a route without waypoints', () => {
    expect(place(line())).toEqual([]);
    expect(place({ ...line(), waypoints: [] })).toEqual([]);
  });
});

describe('nextWaypoint', () => {
  const r = { ...line(), waypoints: [wp(52.002, 13, { en: 'A' }), wp(52.006, 13, { en: 'B' })] };
  const placed = place(r);

  it('is the first one still ahead, with the metres to go', () => {
    const n = nextWaypoint(placed, 100);
    expect(n?.waypoint.name.en).toBe('A');
    expect(n!.ahead).toBeGreaterThan(115);
    expect(n!.ahead).toBeLessThan(125);
  });

  it('moves on once a waypoint is passed', () => {
    expect(nextWaypoint(placed, 300)?.waypoint.name.en).toBe('B');
  });

  it('counts a waypoint that is just reached (a few metres) as still there', () => {
    const at = placed[0]!.meters;
    expect(nextWaypoint(placed, at)?.waypoint.name.en).toBe('A');
    expect(nextWaypoint(placed, at + 5)?.waypoint.name.en).toBe('A');
    expect(nextWaypoint(placed, at + 30)?.waypoint.name.en).toBe('B');
  });

  it('is nothing after the last one, and nothing for a route without any', () => {
    expect(nextWaypoint(placed, 5000)).toBeNull();
    expect(nextWaypoint([], 0)).toBeNull();
  });
});

describe('waypointText', () => {
  it('is the language of the app, else English, else the first one there is', () => {
    expect(waypointText({ de: 'Hallo', en: 'Hello' }, 'de')).toBe('Hallo');
    expect(waypointText({ en: 'Hello', fr: 'Salut' }, 'de')).toBe('Hello');
    expect(waypointText({ fr: 'Salut' }, 'de')).toBe('Salut');
    expect(waypointText({ und: 'Hi', fr: 'Salut' }, 'de')).toBe('Hi');
  });

  it('is nothing without a text', () => {
    expect(waypointText(undefined, 'en')).toBeUndefined();
    expect(waypointText({}, 'en')).toBeUndefined();
  });
});
