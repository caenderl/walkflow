// SVG pieces of the routes view: the elevation profile with a marker for the current position, and a helper to build SVG.

import { elevationSeries, type Route, type RouteStats } from '../../core/routes/routes';
import { t } from '../../i18n/i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROFILE_W = 300;
const PROFILE_H = 80;
const PROFILE_PAD = 4;
/** A flatter route than this still gets a profile this tall, so a few metres do not look like a mountain */
const MIN_ELEVATION_SPAN = 20;
const PROFILE_SAMPLES = 160;

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, className?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (className) e.setAttribute('class', className);
  return e;
}

/** An elevation profile with a marker for the current position */
export function createProfile(host: HTMLElement) {
  const svg = svgEl('svg', { viewBox: `0 0 ${PROFILE_W} ${PROFILE_H}`, preserveAspectRatio: 'none', role: 'img' }, 'profile-svg');
  const area = svgEl('path', {}, 'profile-area');
  const line = svgEl('path', {}, 'profile-line');
  const marker = svgEl('line', { x1: 0, x2: 0, y1: 0, y2: PROFILE_H }, 'profile-marker');
  svg.append(area, line, marker);
  host.replaceChildren(svg);

  return {
    draw(shown: { route: Route; stats: RouteStats } | null) {
      const series = shown && elevationSeries(shown.route, shown.stats, Math.min(PROFILE_SAMPLES, shown.route.points.length));
      host.hidden = !series;
      if (!series) return;
      const lo = Math.min(...series), hi = Math.max(...series, lo + MIN_ELEVATION_SPAN);
      const xy = series.map((e, i) => [
        (i / (series.length - 1)) * PROFILE_W,
        PROFILE_H - PROFILE_PAD - ((e - lo) / (hi - lo)) * (PROFILE_H - 2 * PROFILE_PAD),
      ] as const);
      const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
      line.setAttribute('d', path);
      area.setAttribute('d', `${path}L${PROFILE_W} ${PROFILE_H}L0 ${PROFILE_H}Z`);
      svg.setAttribute('aria-label', t.routes.profileLabel);
    },
    mark(fraction: number | null) {
      marker.setAttribute('visibility', fraction === null ? 'hidden' : 'visible');
      if (fraction === null) return;
      const x = (Math.min(1, Math.max(0, fraction)) * PROFILE_W).toFixed(1);
      marker.setAttribute('x1', x);
      marker.setAttribute('x2', x);
    },
  };
}
