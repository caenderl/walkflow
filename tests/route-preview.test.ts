// scripts/route-preview.mjs makes the map of a route package for a pull request in the route store: Markdown with a geojson block.

import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script without types, run by node
import { MARKER, previewMarkdown, routeGeoJson } from '../scripts/route-preview.mjs';

const pkg = (over: Record<string, unknown> = {}) => ({
  format: 'walkflow-route', version: 1, revision: 2,
  name: { de: 'Runde', en: 'Loop' },
  points: [[52.5, 13.4], [52.5, 13.401], [52.501, 13.402]],
  waypoints: [{ at: [52.5, 13.401], name: { en: 'A bridge' }, text: { en: 'A text.' } }],
  ...over,
});
const geojsonOf = (md: string) => JSON.parse(/```geojson\n(.*)\n```/s.exec(md)![1]!);

describe('routeGeoJson', () => {
  it('writes longitude first, as GeoJSON does, and has the line, a start, a goal and the waypoints', () => {
    const g = routeGeoJson(pkg(), pkg().points);
    expect(g.features).toHaveLength(4);
    expect(g.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[13.4, 52.5], [13.401, 52.5], [13.402, 52.501]] });
    expect(g.features[1].properties.title).toBe('Start');
    expect(g.features[3].geometry.coordinates).toEqual([13.401, 52.5]);
    expect(g.features[3].properties).toMatchObject({ title: 'A bridge', description: 'A text.' });
  });

  it('shows the English name, else the first language', () => {
    expect(routeGeoJson(pkg(), pkg().points).features[0].properties.title).toBe('Loop');
    expect(routeGeoJson(pkg({ name: { fr: 'Boucle' } }), pkg().points).features[0].properties.title).toBe('Boucle');
  });

  it('leaves out a waypoint whose place cannot be read', () => {
    const g = routeGeoJson(pkg({ waypoints: [{ at: [999, 1], name: { en: 'x' } }, { name: { en: 'y' } }] }), pkg().points);
    expect(g.features).toHaveLength(3);
  });
});

describe('previewMarkdown', () => {
  it('starts with the marker the CI finds its comment by, and has a map that is valid JSON', () => {
    const md = previewMarkdown(JSON.stringify(pkg()), { label: 'routes/x.walkflow', commit: 'abcdef1234567890' }) as string;
    expect(md.startsWith(`${MARKER}\n`)).toBe(true);
    expect(md).toContain('`routes/x.walkflow`: 0.');
    expect(md).toContain('3 points, 1 waypoint, revision 2');
    expect(md).toContain('commit `abcdef123456`');
    expect(geojsonOf(md).type).toBe('FeatureCollection');
  });

  it('cannot be broken out of: a backtick in a text does not end the code block, and a label is only path characters', () => {
    const evil = pkg({ waypoints: [{ at: [52.5, 13.401], name: { en: '```\n[x](http://evil)' }, text: { en: 'a ``` b `c`' } }] });
    const md = previewMarkdown(JSON.stringify(evil), { label: 'routes/x`](http://evil).walkflow' }) as string;
    const body = /```geojson\n(.*)\n```/s.exec(md)![1]!;
    expect(body).not.toContain('`');
    expect(JSON.parse(body).features[3].properties.title).toBe('```\n[x](http://evil)');
    expect(md.split('\n')[3]).not.toMatch(/\]\(http/);
    expect(md.match(/```/g)).toHaveLength(2);
  });

  it('thins out a long route until it fits, and says so', () => {
    const points = Array.from({ length: 4000 }, (_, i) => [52 + i * 0.00001, 13 + Math.sin(i / 20) * 0.0005]);
    const md = previewMarkdown(JSON.stringify(pkg({ points, waypoints: [] })), { maxPoints: 300 }) as string;
    const line = geojsonOf(md).features[0].geometry.coordinates;
    expect(line.length).toBeLessThanOrEqual(300);
    expect(line.length).toBeGreaterThan(10);
    expect(md).toMatch(/4000 points, 0 waypoints.*drawn with \d+ points \(up to \d+ m/);
    expect(md.length).toBeLessThan(60000);
  });

  it('says so, with the same first line, when the file is not a route package', () => {
    for (const bad of ['not json', '{}', JSON.stringify(pkg({ format: 'walkflow-workout' })), JSON.stringify(pkg({ points: [[1, 2]] })), JSON.stringify(pkg({ points: [[1, 2], ['a', 3]] }))]) {
      const md = previewMarkdown(bad) as string;
      expect(md.startsWith(`${MARKER}\n`), bad).toBe(true);
      expect(md).toContain('could not be read');
      expect(md).not.toContain('```geojson');
    }
  });
});
