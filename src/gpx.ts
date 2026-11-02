// GPX in and out. Reading is a small tag scanner instead of an XML parser: it works the same in the browser, in
// Electron and in the tests, it cannot expand entities (files with a DTD are refused), and its cost grows linearly with
// the size of the file. Only track points (or, failing that, route points) and a name are taken; everything else in the
// file is ignored.

import { analyzeRoute, ROUTE_MAX_POINTS, ROUTE_MIN_METERS, ROUTE_NAME_MAX, type Route, type RoutePoint } from './routes';

/** Larger files are not read at all (a 12 h track at 1 Hz is about 5 MB) */
export const GPX_MAX_CHARS = 10_000_000;

export type GpxResult =
  | { ok: true; name: string | null; points: RoutePoint[]; skipped: number; simplified: boolean }
  | { ok: false; reason: 'unreadable' | 'tooLarge' | 'unsafe' | 'noPoints' };

const TAG = /<(\/?)(?:[\w.-]+:)?(trkpt|rtept|wpt|ele|name|trk|rte|metadata)\b([^<>]*)>/g;
const ATTR = /\b(lat|lon)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
/** How much text after an opening tag is looked at: names and elevations are short */
const TEXT_WINDOW = 600;
const ELE_MIN = -500;
const ELE_MAX = 9000;

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const cleanName = (s: string) => decode(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, ROUTE_NAME_MAX).trim();

/** The text right after the tag that ends at `from`: CDATA or plain text up to the next tag */
function textAfter(s: string, from: number): string {
  const w = s.slice(from, from + TEXT_WINDOW);
  if (w.startsWith('<![CDATA[')) {
    const end = w.indexOf(']]>');
    return w.slice(9, end < 0 ? undefined : end);
  }
  const end = w.indexOf('<');
  return end < 0 ? w : w.slice(0, end);
}

interface RawPoint { lat: number; lon: number; ele?: number }

export function parseGpx(text: string): GpxResult {
  if (text.length > GPX_MAX_CHARS) return { ok: false, reason: 'tooLarge' };
  if (/<!(?:DOCTYPE|ENTITY)/i.test(text)) return { ok: false, reason: 'unsafe' };
  if (!/<(?:[\w.-]+:)?gpx\b/.test(text)) return { ok: false, reason: 'unreadable' };

  const trk: (RawPoint | null)[] = [], rte: (RawPoint | null)[] = [];
  let trkName: string | undefined, rteName: string | undefined, metaName: string | undefined;
  let inTrk = false, inRte = false, inMeta = false, inWpt = false;
  // The point being read; in an object because the scanner below changes it from a helper
  const open: { pt: { kind: 'trkpt' | 'rtept'; lat: number; lon: number; ele?: number; valid: boolean } | null } = { pt: null };

  const finish = () => {
    const p = open.pt;
    if (!p) return;
    (p.kind === 'trkpt' ? trk : rte).push(p.valid ? { lat: p.lat, lon: p.lon, ele: p.ele } : null);
    open.pt = null;
  };

  TAG.lastIndex = 0;
  for (let m = TAG.exec(text); m; m = TAG.exec(text)) {
    const closing = m[1] === '/', tag = m[2]!, attrs = m[3]!;
    const selfClosing = attrs.trimEnd().endsWith('/');
    switch (tag) {
      case 'trk': inTrk = !closing; break;
      case 'rte': inRte = !closing; break;
      case 'metadata': inMeta = !closing; break;
      case 'wpt': inWpt = !closing && !selfClosing; break;
      case 'trkpt':
      case 'rtept': {
        finish();
        if (closing) break;
        const found: Record<string, number> = {};
        for (const a of attrs.matchAll(ATTR)) {
          const raw = (a[2] ?? a[3] ?? '').trim();
          if (raw) found[a[1]!] = Number(raw);
        }
        const { lat, lon } = found;
        open.pt = {
          kind: tag, lat: lat ?? NaN, lon: lon ?? NaN,
          valid: lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180,
        };
        if (selfClosing) finish();
        break;
      }
      case 'ele':
        if (!closing && open.pt && !selfClosing) {
          const raw = textAfter(text, TAG.lastIndex).trim();
          const ele = raw ? Number(raw) : NaN;
          if (Number.isFinite(ele) && ele >= ELE_MIN && ele <= ELE_MAX) open.pt.ele = ele;
        }
        break;
      case 'name':
        if (!closing && !selfClosing && !open.pt && !inWpt) {
          const wants = inTrk ? trkName === undefined : inRte ? rteName === undefined : inMeta && metaName === undefined;
          if (wants) {
            const after = text.startsWith('<![CDATA[', TAG.lastIndex);
            const raw = textAfter(text, TAG.lastIndex);
            const name = cleanName(after ? raw.replace(/&/g, '&amp;') : raw);
            if (name) { if (inTrk) trkName = name; else if (inRte) rteName = name; else metaName = name; }
          }
        }
        break;
    }
  }
  finish();

  const usedTrack = trk.filter(p => p !== null).length >= 2;
  const source = usedTrack ? trk : rte;
  const name = (usedTrack ? trkName : rteName) ?? metaName ?? trkName ?? rteName ?? null;

  // Unusable coordinates are dropped, and so is a point that repeats the one before it
  let skipped = 0;
  let points: RoutePoint[] = [];
  for (const p of source) {
    if (!p) { skipped++; continue; }
    const lat = round(p.lat, 6), lon = round(p.lon, 6);
    const prev = points.at(-1);
    if (prev && prev.lat === lat && prev.lon === lon) continue;
    points.push(p.ele === undefined ? { lat, lon } : { lat, lon, ele: round(p.ele, 1) });
  }
  // One elevation missing: none are used, a profile with holes would be wrong in places
  if (!points.every(p => p.ele !== undefined)) points = points.map(({ lat, lon }) => ({ lat, lon }));

  let simplified = false;
  if (points.length > ROUTE_MAX_POINTS) {
    const stride = Math.ceil((points.length - 1) / (ROUTE_MAX_POINTS - 1));
    const kept = points.filter((_, i) => i % stride === 0);
    if ((points.length - 1) % stride !== 0) kept.push(points.at(-1)!);
    points = kept;
    simplified = true;
  }

  if (points.length < 2 || analyzeRoute({ id: '', name: '', points, updated: 0 }).total < ROUTE_MIN_METERS) return { ok: false, reason: 'noPoints' };
  return { ok: true, name, points, skipped, simplified };
}

const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export function serializeGpx(route: Route): string {
  const pts = route.points.map(p =>
    `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele === undefined ? '' : `<ele>${p.ele}</ele>`}</trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Walkflow" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${escapeXml(route.name)}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>
`;
}
