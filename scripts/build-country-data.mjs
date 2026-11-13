// Builds the offline country data from Natural Earth (public domain) and copies the flags that go with it.
//   node scripts/build-country-data.mjs <ne_50m_admin_0_countries.geojson> <ne_10m_admin_0_countries.geojson> <flag-icons/flags/4x3>
// Writes src/core/routes/data/countries.json (borders, simplified to about 3 km, coordinates in 0.001° steps, delta-coded) and
// src/ui/routes/flags/<code>.svg (flag-icons, MIT). The 50 m data is too rough for the small states (the Vatican is a kilometre
// off), so every country that fits into one degree is taken from the 10 m data instead.
// Run it again only to update the data; the results are committed.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [path50, path10, flagsDir] = process.argv.slice(2);
if (!path50 || !path10 || !flagsDir) { console.error('usage: node scripts/build-country-data.mjs <50m geojson> <10m geojson> <flags/4x3 dir>'); process.exit(1); }

const SCALE = 1000;
const MAX_EPS = 0.03;
/** Countries whose 50 m outline fits into this many degrees are taken from the 10 m data */
const SMALL = 1;

/** Natural Earth leaves the code open for a few disputed areas; these are put with the country that governs them */
const FIX = { SOL: 'SO', CYN: 'CY' };

const dist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

function simplify(ring, eps) {
  const keep = Array.from({ length: ring.length }, () => false);
  keep[0] = keep[ring.length - 1] = true;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = 0, at = -1;
    for (let i = a + 1; i < b; i++) { const d = dist(ring[i], ring[a], ring[b]); if (d > best) { best = d; at = i; } }
    if (best > eps && at >= 0) { keep[at] = true; stack.push([a, at], [at, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}

function encode(ring) {
  const q = ring.map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]);
  const out = [q[0][0], q[0][1]];
  for (let i = 1; i < q.length; i++) out.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  return out;
}

const codeOf = p => {
  const c = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : FIX[p.ADM0_A3];
  return c ? c.toUpperCase() : null;
};
const polygonsOf = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
const extentOf = polys => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return Math.max(x1 - x0, y1 - y0);
};

const by50 = {};
for (const f of JSON.parse(readFileSync(path50, 'utf8')).features) { const c = codeOf(f.properties); if (c) (by50[c] ??= []).push(...polygonsOf(f)); }
const by10 = {};
for (const f of JSON.parse(readFileSync(path10, 'utf8')).features) { const c = codeOf(f.properties); if (c) (by10[c] ??= []).push(...polygonsOf(f)); }

const countries = {};
let points = 0;
for (const [code, polys50] of Object.entries(by50)) {
  const polys = extentOf(polys50) <= SMALL && by10[code] ? by10[code] : polys50;
  for (const poly of polys) {
    const rings = poly.map(ring => {
      const xs = ring.map(r => r[0]), ys = ring.map(r => r[1]);
      const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      // A tiny country or enclave keeps its shape: the tolerance follows the size of the ring
      const kept = simplify(ring, Math.min(MAX_EPS, extent * 0.04));
      return kept.length >= 4 ? kept : ring;
    });
    (countries[code] ??= []).push(rings.map(encode));
    points += rings.reduce((n, r) => n + r.length, 0);
  }
}

mkdirSync('src/data', { recursive: true });
mkdirSync('src/ui/routes/flags', { recursive: true });
writeFileSync('src/core/routes/data/countries.json', JSON.stringify({ scale: SCALE, countries }));
for (const code of Object.keys(countries)) copyFileSync(join(flagsDir, `${code.toLowerCase()}.svg`), `src/ui/routes/flags/${code.toLowerCase()}.svg`);
console.log(`${Object.keys(countries).length} countries, ${points} points before simplifying`);
