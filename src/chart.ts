// Charts on a canvas: speed over time (live and per run) and distance per week. Colours from the theme tokens.

import type { Sample } from './export';
import { t } from './i18n';
import { cssColor } from './theme';

export const CHART_WINDOW_MS = 5 * 60 * 1000;
/** Longer gaps between two samples are not bridged by the line (no data, e.g. connection closed) */
const GAP_MS = 10_000;

export interface ChartOptions {
  now: number;
  /** active limit, sets the y axis (at least 6) */
  limit: number;
  /** current target, dashed; 0/NaN = no line */
  target: number;
}

export interface SpeedChartOptions {
  from: number;
  to: number;
  ymax: number;
  /** dashed line; 0/NaN/undefined = none */
  target?: number;
  startLabel: string;
  endLabel: string;
}

/** Draws at the size the CSS gives the canvas, in device pixels, so it stays sharp at any width. */
function prepare(c: HTMLCanvasElement) {
  const g = c.getContext('2d');
  if (!g) return null;
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || c.width, H = c.clientHeight || c.height;
  const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '12px system-ui';
  return { g, W, H };
}

/** Live chart: the last 5 minutes. */
export function drawChart(c: HTMLCanvasElement, samples: readonly Sample[], opts: ChartOptions) {
  drawSpeedChart(c, samples, {
    from: opts.now - CHART_WINDOW_MS, to: opts.now,
    ymax: Math.max(6, Math.ceil(opts.limit)),
    target: opts.target,
    startLabel: t.chart.start, endLabel: t.chart.now,
  });
}

export function drawSpeedChart(c: HTMLCanvasElement, samples: readonly Sample[], o: SpeedChartOptions) {
  const p = prepare(c);
  if (!p) return;
  const { g, W, H } = p;
  const L = 30, B = 16, T = 8, R = 6;
  const span = Math.max(1, o.to - o.from);
  const px = (ts: number) => L + ((ts - o.from) / span) * (W - L - R);
  const py = (v: number) => H - B - (v / o.ymax) * (H - B - T);

  const line = cssColor('--line'), label = cssColor('--mute'), target = cssColor('--link'), speed = cssColor('--accent');
  g.fillStyle = label; g.strokeStyle = line; g.lineWidth = 1;
  const stepY = Math.max(1, Math.round(o.ymax / 4));
  for (let y = 0; y <= o.ymax; y += stepY) {
    g.beginPath(); g.moveTo(L, py(y)); g.lineTo(W - R, py(y)); g.stroke();
    g.fillText(String(y), 6, py(y) + 4);
  }
  g.fillText(o.startLabel, L, H - 3);
  g.textAlign = 'right';
  g.fillText(o.endLabel, W - R, H - 3);
  g.textAlign = 'left';

  if (o.target) {
    g.strokeStyle = target; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(L, py(o.target)); g.lineTo(W - R, py(o.target)); g.stroke();
    g.setLineDash([]);
  }

  const pts = samples.filter(s => s.ts >= o.from && s.ts <= o.to && s.speed !== undefined);
  // One line per stretch without gaps, each with a light fill down to the zero axis
  const segments: Sample[][] = [];
  pts.forEach((s, i) => {
    if (i === 0 || s.ts - pts[i - 1]!.ts > GAP_MS) segments.push([]);
    segments.at(-1)!.push(s);
  });
  g.strokeStyle = speed; g.fillStyle = speed; g.lineWidth = 2; g.lineJoin = 'round';
  for (const seg of segments) {
    if (seg.length < 2) continue;
    g.beginPath();
    seg.forEach((s, i) => i ? g.lineTo(px(s.ts), py(s.speed!)) : g.moveTo(px(s.ts), py(s.speed!)));
    g.stroke();
    g.lineTo(px(seg.at(-1)!.ts), py(0)); g.lineTo(px(seg[0]!.ts), py(0)); g.closePath();
    g.globalAlpha = 0.14; g.fill(); g.globalAlpha = 1;
  }
}

/** Round step for about `parts` grid lines up to `max` */
function niceStep(max: number, parts: number): number {
  const raw = max / parts;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find(f => f * mag >= raw) ?? 10) * mag;
}

export interface BarChartOptions {
  /** One label per bar; labels that would overlap are left out */
  labels: string[];
  /** Index of the highlighted bar (hover), -1 = none */
  active: number;
  format: (v: number) => string;
}

/** Bars from the zero line, 4 px rounded tops, gaps in the card colour. Returns the bar centres (x) for hit testing. */
export function drawBarChart(c: HTMLCanvasElement, values: readonly number[], o: BarChartOptions): number[] {
  const p = prepare(c);
  if (!p) return [];
  const { g, W, H } = p;
  const L = 36, B = 18, T = 8, R = 6;
  const max = Math.max(...values, 0);
  const step = max > 0 ? niceStep(max, 4) : 1;
  const ymax = max > 0 ? Math.ceil(max / step) * step : step * 4;
  const py = (v: number) => H - B - (v / ymax) * (H - B - T);

  const line = cssColor('--line'), label = cssColor('--mute'), bar = cssColor('--accent');
  g.fillStyle = label; g.strokeStyle = line; g.lineWidth = 1;
  for (let y = 0; y <= ymax + step / 2; y += step) {
    g.beginPath(); g.moveTo(L, Math.round(py(y)) + 0.5); g.lineTo(W - R, Math.round(py(y)) + 0.5); g.stroke();
    g.fillText(o.format(y), 4, py(y) + 4);
  }

  const n = values.length;
  const slot = (W - L - R) / Math.max(1, n);
  const gap = Math.max(2, Math.min(8, slot * 0.25));
  const centres = values.map((_, i) => L + (i + 0.5) * slot);
  const labelX = (i: number, tw: number) => Math.min(Math.max(centres[i]! - tw / 2, L), W - R - tw);
  // The last label (current week) is always shown; the others only where they do not collide
  const lastText = o.labels[n - 1] ?? '';
  const lastX = labelX(n - 1, g.measureText(lastText).width);
  let lastLabelEnd = -Infinity;
  values.forEach((v, i) => {
    const x = L + i * slot + gap / 2, w = slot - gap;
    if (v > 0) {
      const top = py(v), h = H - B - top, r = Math.min(4, w / 2, h);
      g.fillStyle = bar;
      g.globalAlpha = o.active === -1 || o.active === i ? 1 : 0.45;
      g.beginPath();
      g.moveTo(x, H - B);
      g.lineTo(x, top + r); g.arcTo(x, top, x + r, top, r);
      g.lineTo(x + w - r, top); g.arcTo(x + w, top, x + w, top + r, r);
      g.lineTo(x + w, H - B);
      g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    const text = o.labels[i] ?? '';
    const tw = g.measureText(text).width;
    const lx = labelX(i, tw);
    if (text && (i === n - 1 || (lx > lastLabelEnd + 16 && lx + tw + 16 < lastX))) {
      g.fillStyle = o.active === i ? cssColor('--fg') : label;
      g.fillText(text, lx, H - 3);
      lastLabelEnd = lx + tw;
    }
  });
  return centres;
}
