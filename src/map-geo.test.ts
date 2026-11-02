import { describe, expect, it } from 'vitest';
import { routeBounds, routeLine } from './map-geo';

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
