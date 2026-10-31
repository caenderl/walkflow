// Generates the app icons as PNG, without dependencies (own PNG encoder, SDF rendering).
// Usage: node scripts/make-icons.mjs   (the output is committed)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x12, 0x14, 0x1a];
const FG = [0x4a, 0xde, 0x80];
const BELT = [0x8a, 0x90, 0xa2];

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Geometry (coordinates 0..1) ----------
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function roundRectDist(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Two chevrons ("forward") above a belt
const STROKE = 0.085;
const chevrons = [0, 0.2].flatMap(dx => [
  [0.31 + dx, 0.25, 0.49 + dx, 0.43],
  [0.49 + dx, 0.43, 0.31 + dx, 0.61],
]);
const belt = [0.22, 0.76, 0.78, 0.76];

/** Farbe an Punkt (x, y) im Inhaltsraum, null = Hintergrund */
function content(x, y) {
  if (chevrons.some(s => segDist(x, y, ...s) < STROKE / 2)) return FG;
  if (segDist(x, y, ...belt) < 0.035) return BELT;
  return null;
}

/**
 * @param shape 'round' = rounded square with transparency, 'full' = full bleed (maskable, apple-touch),
 *              'mac' = rounded square with margin (macOS grid)
 */
function render(size, shape) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  const inset = shape === 'mac' ? 0.1 : 0;
  const scale = shape === 'full' ? 0.8 : 1; // maskable: content inside the safe zone
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
          const inside = shape === 'full' || roundRectDist(x, y, inset, inset, 1 - inset, 1 - inset, shape === 'mac' ? 0.18 : 0.22) < 0;
          if (!inside) continue;
          const u = (x - 0.5) / scale + 0.5, v = (y - 0.5) / scale + 0.5;
          const ci = (u - 0.5) / (1 - 2 * inset) + 0.5, cj = (v - 0.5) / (1 - 2 * inset) + 0.5;
          const c = content(ci, cj) ?? BG;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      const cov = a / n;
      buf[i] = cov ? Math.round(r / (a / 255)) : 0;
      buf[i + 1] = cov ? Math.round(g / (a / 255)) : 0;
      buf[i + 2] = cov ? Math.round(b / (a / 255)) : 0;
      buf[i + 3] = Math.round(cov);
    }
  }
  return png(size, buf);
}

mkdirSync('public/icons', { recursive: true });
mkdirSync('build', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 'round'));
writeFileSync('public/icons/icon-512.png', render(512, 'round'));
writeFileSync('public/icons/maskable-512.png', render(512, 'full'));
writeFileSync('public/icons/apple-touch-icon.png', render(180, 'full'));
writeFileSync('build/icon.png', render(1024, 'mac'));
console.log('Icons written');
