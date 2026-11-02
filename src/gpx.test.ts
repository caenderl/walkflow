import { describe, expect, it } from 'vitest';
import { GPX_MAX_CHARS, parseGpx, serializeGpx } from './gpx';
import { analyzeRoute, ROUTE_MAX_POINTS } from './routes';

const wrap = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
const pt = (lat: number, lon: number, ele?: number | string, tag = 'trkpt') =>
  `<${tag} lat="${lat}" lon="${lon}">${ele === undefined ? '' : `<ele>${ele}</ele>`}</${tag}>`;

function ok(text: string) {
  const r = parseGpx(text);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r;
}

describe('parseGpx', () => {
  it('reads a track with name and elevations', () => {
    const r = ok(wrap(`<trk><name>Park loop</name><trkseg>${pt(48.1, 11.5, 520)}${pt(48.101, 11.5, 521.5)}${pt(48.102, 11.5, 523)}</trkseg></trk>`));
    expect(r.name).toBe('Park loop');
    expect(r.points).toEqual([
      { lat: 48.1, lon: 11.5, ele: 520 }, { lat: 48.101, lon: 11.5, ele: 521.5 }, { lat: 48.102, lon: 11.5, ele: 523 },
    ]);
    expect(r.skipped).toBe(0);
    expect(r.simplified).toBe(false);
  });

  it('joins several segments and tracks in order', () => {
    const r = ok(wrap(`<trk><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg><trkseg>${pt(0, 0.002)}${pt(0, 0.003)}</trkseg></trk>`));
    expect(r.points.map(p => p.lon)).toEqual([0, 0.001, 0.002, 0.003]);
  });

  it('accepts single quotes, any attribute order, self-closing points and CRLF', () => {
    const r = ok(wrap(`<trk>\r\n<trkseg>\r\n<trkpt lon='0' lat='1'/>\r\n<trkpt lon='0.001' lat='1' />\r\n</trkseg>\r\n</trk>`));
    expect(r.points).toEqual([{ lat: 1, lon: 0 }, { lat: 1, lon: 0.001 }]);
  });

  it('accepts prefixed tags', () => {
    const r = ok(`<g:gpx xmlns:g="x"><g:trk><g:name>Prefixed</g:name><g:trkseg><g:trkpt lat="0" lon="0"><g:ele>5</g:ele></g:trkpt><g:trkpt lat="0" lon="0.001"><g:ele>6</g:ele></g:trkpt></g:trkseg></g:trk></g:gpx>`);
    expect(r.name).toBe('Prefixed');
    expect(r.points).toHaveLength(2);
    expect(r.points[1]!.ele).toBe(6);
  });

  it('falls back to a planned route when there is no track', () => {
    const r = ok(wrap(`<rte><name>Planned</name>${pt(0, 0, undefined, 'rtept')}${pt(0, 0.001, undefined, 'rtept')}</rte>`));
    expect(r.name).toBe('Planned');
    expect(r.points).toHaveLength(2);
  });

  it('prefers the track over a planned route', () => {
    const r = ok(wrap(`<rte>${pt(5, 5, undefined, 'rtept')}${pt(5, 5.001, undefined, 'rtept')}</rte><trk><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`));
    expect(r.points[0]!.lat).toBe(0);
  });

  it('ignores waypoints and what they carry', () => {
    const r = ok(wrap(`<wpt lat="9" lon="9"><name>Cafe</name><ele>999</ele></wpt><trk><trkseg>${pt(0, 0, 1)}${pt(0, 0.001, 2)}</trkseg></trk>`));
    expect(r.points).toHaveLength(2);
    expect(r.name).toBeNull();
  });

  it('takes the name of the track before the metadata name', () => {
    expect(ok(wrap(`<metadata><name>Meta</name></metadata><trk><name>Track</name><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`)).name).toBe('Track');
    expect(ok(wrap(`<metadata><name>Meta</name></metadata><trk><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`)).name).toBe('Meta');
  });

  it('decodes entities and CDATA in names and cleans them up', () => {
    const r = ok(wrap(`<trk><name>  Rock &amp; Roll &#233; &#x41;\n loop </name><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`));
    expect(r.name).toBe('Rock & Roll é A loop');
    expect(ok(wrap(`<trk><name><![CDATA[A <b> & B]]></name><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`)).name).toBe('A <b> & B');
  });

  it('shortens a very long name', () => {
    expect(ok(wrap(`<trk><name>${'x'.repeat(300)}</name><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`)).name).toHaveLength(80);
  });

  it('rounds to the resolution that is stored', () => {
    const r = ok(wrap(`<trk><trkseg>${pt(48.12345678, 11.98765432, 520.123)}${pt(48.12445678, 11.98765432, 520.987)}</trkseg></trk>`));
    expect(r.points[0]).toEqual({ lat: 48.123457, lon: 11.987654, ele: 520.1 });
    expect(r.points[1]!.ele).toBe(521);
  });

  it('drops points with unusable coordinates and counts them', () => {
    const r = ok(wrap(`<trk><trkseg>${pt(0, 0)}${pt(95, 0)}${pt(0, 0.001)}<trkpt lat="x" lon="1"/><trkpt lat="1"/>${pt(0, 0.002)}</trkseg></trk>`));
    expect(r.points.map(p => p.lon)).toEqual([0, 0.001, 0.002]);
    expect(r.skipped).toBe(3);
  });

  it('drops points that repeat the previous one', () => {
    const r = ok(wrap(`<trk><trkseg>${pt(0, 0)}${pt(0, 0)}${pt(0, 0.001)}${pt(0, 0.001)}</trkseg></trk>`));
    expect(r.points).toHaveLength(2);
  });

  it('keeps elevations only when every point has a usable one', () => {
    expect(ok(wrap(`<trk><trkseg>${pt(0, 0, 1)}${pt(0, 0.001)}${pt(0, 0.002, 3)}</trkseg></trk>`)).points.every(p => p.ele === undefined)).toBe(true);
    expect(ok(wrap(`<trk><trkseg>${pt(0, 0, 1)}${pt(0, 0.001, 'abc')}${pt(0, 0.002, 3)}</trkseg></trk>`)).points.every(p => p.ele === undefined)).toBe(true);
    expect(ok(wrap(`<trk><trkseg>${pt(0, 0, 1)}${pt(0, 0.001, 20000)}</trkseg></trk>`)).points.every(p => p.ele === undefined)).toBe(true);
  });

  it('thins out very long tracks, keeping the first and the last point', () => {
    const n = ROUTE_MAX_POINTS * 3 + 7;
    const body = Array.from({ length: n }, (_, i) => pt(0, i * 0.00001, 100)).join('');
    const r = ok(wrap(`<trk><trkseg>${body}</trkseg></trk>`));
    expect(r.simplified).toBe(true);
    expect(r.points.length).toBeLessThanOrEqual(ROUTE_MAX_POINTS);
    expect(r.points.length).toBeGreaterThan(ROUTE_MAX_POINTS / 2);
    expect(r.points[0]!.lon).toBe(0);
    expect(r.points.at(-1)!.lon).toBeCloseTo((n - 1) * 0.00001, 5);
  });

  it('refuses files with a DTD or entity declarations', () => {
    const doc = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa">]>` + wrap(`<trk><name>&a;</name><trkseg>${pt(0, 0)}${pt(0, 0.001)}</trkseg></trk>`);
    expect(parseGpx(doc)).toEqual({ ok: false, reason: 'unsafe' });
    expect(parseGpx(wrap(`<!ENTITY x "y">${pt(0, 0)}`))).toEqual({ ok: false, reason: 'unsafe' });
  });

  it('refuses files that are too large', () => {
    expect(parseGpx('x'.repeat(GPX_MAX_CHARS + 1))).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('refuses what is not GPX', () => {
    expect(parseGpx('')).toEqual({ ok: false, reason: 'unreadable' });
    expect(parseGpx('{"json": true}')).toEqual({ ok: false, reason: 'unreadable' });
    expect(parseGpx('<html><body>hi</body></html>')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses a GPX file without a usable route', () => {
    expect(parseGpx(wrap(''))).toEqual({ ok: false, reason: 'noPoints' });
    expect(parseGpx(wrap(`<trk><trkseg>${pt(0, 0)}</trkseg></trk>`))).toEqual({ ok: false, reason: 'noPoints' });
    expect(parseGpx(wrap(`<wpt lat="1" lon="1"/><wpt lat="2" lon="2"/>`))).toEqual({ ok: false, reason: 'noPoints' });
  });

  it('refuses a route that is shorter than 10 m', () => {
    expect(parseGpx(wrap(`<trk><trkseg>${pt(0, 0)}${pt(0, 0.00005)}</trkseg></trk>`))).toEqual({ ok: false, reason: 'noPoints' });
  });

  it('copes with an unclosed point and a huge number of them in reasonable time', () => {
    const body = '<trk><trkseg>' + '<trkpt lat="1" lon="1">'.repeat(50_000);
    const started = Date.now();
    expect(parseGpx(wrap(body)).ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('serializeGpx', () => {
  const points = [{ lat: 48.1, lon: 11.5, ele: 520 }, { lat: 48.101, lon: 11.502, ele: 521.5 }, { lat: 48.102, lon: 11.504, ele: 520.2 }];

  it('writes a file that parseGpx reads back', () => {
    const text = serializeGpx({ id: 'r', name: 'Loop & <more>', updated: 1, points });
    const r = ok(text);
    expect(r.name).toBe('Loop & <more>');
    expect(r.points).toEqual(points);
  });

  it('escapes the name', () => {
    const text = serializeGpx({ id: 'r', name: '<script>"&\'', updated: 1, points });
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
  });

  it('writes no elevations for a route without', () => {
    const text = serializeGpx({ id: 'r', name: 'Flat', updated: 1, points: points.map(({ lat, lon }) => ({ lat, lon })) });
    expect(text).not.toContain('<ele>');
    expect(ok(text).points).toHaveLength(3);
  });

  it('keeps the length of the route', () => {
    const route = { id: 'r', name: 'x', updated: 1, points };
    const back = ok(serializeGpx(route));
    expect(analyzeRoute({ ...route, points: back.points }).total).toBeCloseTo(analyzeRoute(route).total, 3);
  });
});
