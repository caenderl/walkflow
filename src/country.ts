// The country of a route, worked out on the device from where it starts. A GPX file does not name one, and asking a
// server would send the route's coordinates away, so this uses border data that ships with the app (Natural Earth, public
// domain, simplified to about 3 km: src/data/countries.json, made by scripts/build-country-data.mjs). Near a border or
// on a coast it can be a few kilometres off, which is fine for a flag next to a name. The data is loaded only when a
// country is looked up.

import type { Lang } from './i18n';

/** Polygons per country code; a polygon is its rings (outer first, then holes), each delta-coded in 1/scale degrees */
export interface CountryData {
  scale: number;
  countries: Record<string, number[][][]>;
}

/** Closer than this (in degrees, about 13 km) to a country's border counts as in it: coasts and simplified edges */
const COAST_TOLERANCE = 0.12;

interface Polygon { rings: Float64Array[]; minX: number; minY: number; maxX: number; maxY: number }
const decoded = new WeakMap<CountryData, [string, Polygon[]][]>();

function decode(data: CountryData): [string, Polygon[]][] {
  let out = decoded.get(data);
  if (out) return out;
  out = Object.entries(data.countries).map(([code, polys]) => [code, polys.map(rings => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const decodedRings = rings.map(flat => {
      const xy = new Float64Array(flat.length);
      let x = 0, y = 0;
      for (let i = 0; i < flat.length; i += 2) {
        x += flat[i]!; y += flat[i + 1]!;
        xy[i] = x / data.scale; xy[i + 1] = y / data.scale;
        minX = Math.min(minX, xy[i]!); maxX = Math.max(maxX, xy[i]!);
        minY = Math.min(minY, xy[i + 1]!); maxY = Math.max(maxY, xy[i + 1]!);
      }
      return xy;
    });
    return { rings: decodedRings, minX, minY, maxX, maxY };
  })] as [string, Polygon[]]);
  decoded.set(data, out);
  return out;
}

/** Even-odd over all rings of the polygon: a point in a hole is outside */
function inside(poly: Polygon, lon: number, lat: number): boolean {
  if (lon < poly.minX || lon > poly.maxX || lat < poly.minY || lat > poly.maxY) return false;
  let odd = false;
  for (const r of poly.rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i]!, yi = r[i + 1]!, xj = r[j]!, yj = r[j + 1]!;
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
}

/** Distance in degrees (longitude scaled to the latitude) from the point to the nearest edge of the polygon */
function edgeDistance(poly: Polygon, lon: number, lat: number): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const r of poly.rings) {
    for (let i = 0; i + 3 < r.length; i += 2) {
      const ax = r[i]! * k, ay = r[i + 1]!, bx = r[i + 2]! * k, by = r[i + 3]!;
      const px = lon * k, dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (lat - ay) * dy) / len));
      best = Math.min(best, Math.hypot(px - (ax + t * dx), lat - (ay + t * dy)));
    }
  }
  return best;
}

/** The country code at a place, '' if there is none (open sea, unusable coordinates) */
export function findCountry(data: CountryData, lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return '';
  const all = decode(data);
  let found = '', smallest = Infinity;
  for (const [code, polys] of all) {
    for (const p of polys) {
      if (!inside(p, lon, lat)) continue;
      // Where shapes overlap after simplifying, the smaller one is the enclave
      const area = (p.maxX - p.minX) * (p.maxY - p.minY);
      if (area < smallest) { smallest = area; found = code; }
    }
  }
  if (found) return found;
  let nearest = '', best = COAST_TOLERANCE;
  for (const [code, polys] of all) {
    for (const p of polys) {
      if (lon < p.minX - 1 || lon > p.maxX + 1 || lat < p.minY - 1 || lat > p.maxY + 1) continue;
      const d = edgeDistance(p, lon, lat);
      if (d <= best) { best = d; nearest = code; }
    }
  }
  return nearest;
}

/** Loads the border data when first needed */
export async function countryAt(lat: number, lon: number): Promise<string> {
  const data = (await import('./data/countries.json')).default as unknown as CountryData;
  return findCountry(data, lat, lon);
}

export const isCountryCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v);

/** The name of a country in the language of the app, from the browser's own data */
export function countryName(code: string, lang: Lang): string {
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
