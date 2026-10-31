// Speed over the last 5 minutes on a canvas.

import type { Sample } from './export';
import { t } from './i18n';
import { cssColor } from './theme';

export const CHART_WINDOW_MS = 5 * 60 * 1000;

export interface ChartOptions {
  now: number;
  /** active limit, sets the y axis (at least 6) */
  limit: number;
  /** current target, dashed; 0/NaN = no line */
  target: number;
}

export function drawChart(c: HTMLCanvasElement, samples: readonly Sample[], opts: ChartOptions) {
  const g = c.getContext('2d');
  if (!g) return;
  // Draw at the size the CSS gives the canvas, in device pixels, so it stays sharp at any width
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth || c.width, H = c.clientHeight || c.height;
  const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = 30, B = 16, T = 8, R = 6;
  g.clearRect(0, 0, W, H);
  const { now } = opts, win = CHART_WINDOW_MS;
  const ymax = Math.max(6, Math.ceil(opts.limit));
  const px = (ts: number) => L + (1 - (now - ts) / win) * (W - L - R);
  const py = (v: number) => H - B - (v / ymax) * (H - B - T);

  // Colours from the theme tokens in style.css
  const line = cssColor('--line'), label = cssColor('--mute'), target = cssColor('--link'), speed = cssColor('--accent');
  g.font = '12px system-ui'; g.fillStyle = label; g.strokeStyle = line; g.lineWidth = 1;
  const stepY = Math.max(1, Math.round(ymax / 4));
  for (let y = 0; y <= ymax; y += stepY) {
    g.beginPath(); g.moveTo(L, py(y)); g.lineTo(W - R, py(y)); g.stroke();
    g.fillText(String(y), 6, py(y) + 4);
  }
  g.fillText(t.chart.start, L, H - 3);
  g.textAlign = 'right';
  g.fillText(t.chart.now, W - R, H - 3);
  g.textAlign = 'left';

  if (opts.target) {
    g.strokeStyle = target; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(L, py(opts.target)); g.lineTo(W - R, py(opts.target)); g.stroke();
    g.setLineDash([]);
  }

  const pts = samples.filter(s => s.ts >= now - win && s.speed !== undefined);
  if (pts.length > 1) {
    g.strokeStyle = speed; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
    pts.forEach((s, i) => i ? g.lineTo(px(s.ts), py(s.speed!)) : g.moveTo(px(s.ts), py(s.speed!)));
    g.stroke();
    // Light fill under the line, closed along the zero axis
    g.lineTo(px(pts[pts.length - 1]!.ts), py(0)); g.lineTo(px(pts[0]!.ts), py(0)); g.closePath();
    g.globalAlpha = 0.14; g.fillStyle = speed; g.fill(); g.globalAlpha = 1;
  }
}
