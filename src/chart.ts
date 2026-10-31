// Speed-Verlauf der letzten 5 Minuten auf einem Canvas.

import type { Sample } from './export';

export const CHART_WINDOW_MS = 5 * 60 * 1000;

export interface ChartOptions {
  now: number;
  /** aktives Limit, bestimmt die y-Achse (mindestens 6) */
  limit: number;
  /** aktuelles Ziel, gestrichelt; 0/NaN = keine Linie */
  target: number;
}

export function drawChart(c: HTMLCanvasElement, samples: readonly Sample[], opts: ChartOptions) {
  const g = c.getContext('2d');
  if (!g) return;
  const W = c.width, H = c.height;
  const L = 30, B = 16, T = 8, R = 6;
  g.clearRect(0, 0, W, H);
  const { now } = opts, win = CHART_WINDOW_MS;
  const ymax = Math.max(6, Math.ceil(opts.limit));
  const px = (ts: number) => L + (1 - (now - ts) / win) * (W - L - R);
  const py = (v: number) => H - B - (v / ymax) * (H - B - T);

  g.font = '11px system-ui'; g.fillStyle = '#8a90a2'; g.strokeStyle = '#2a2f3c'; g.lineWidth = 1;
  const stepY = Math.max(1, Math.round(ymax / 4));
  for (let y = 0; y <= ymax; y += stepY) {
    g.beginPath(); g.moveTo(L, py(y)); g.lineTo(W - R, py(y)); g.stroke();
    g.fillText(String(y), 6, py(y) + 4);
  }
  g.fillText('−5 min', L, H - 3);
  g.fillText('jetzt', W - 34, H - 3);

  if (opts.target) {
    g.strokeStyle = '#60a5fa'; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(L, py(opts.target)); g.lineTo(W - R, py(opts.target)); g.stroke();
    g.setLineDash([]);
  }

  const pts = samples.filter(s => s.ts >= now - win && s.speed !== undefined);
  if (pts.length > 1) {
    g.strokeStyle = '#4ade80'; g.lineWidth = 2; g.beginPath();
    pts.forEach((s, i) => i ? g.lineTo(px(s.ts), py(s.speed!)) : g.moveTo(px(s.ts), py(s.speed!)));
    g.stroke();
  }
}
