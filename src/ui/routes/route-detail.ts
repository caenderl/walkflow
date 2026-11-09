// The opened details of a route in the routes view: map, elevation profile, figures, and the walking speed and description
// (or their editor) at the top of the right column.

import { lang, t } from '../../i18n/i18n';
import { routeDescription } from '../../core/routes/route-text';
import { placeWaypoints, waypointText } from '../../core/routes/route-waypoints';
import { fmtDistance } from '../../core/training/program';
import { routeSpeed, type Route, type RouteStats } from '../../core/routes/routes';
import { el, iconButton } from '../components/elements';
import { createProfile } from './route-profile';
import { createMapSlot, mapStyles, pickStyle, type MapSlot } from './route-map';

export interface Detail { id: string; el: HTMLElement; profile: ReturnType<typeof createProfile>; noEle: HTMLElement; facts: HTMLElement; waypoints: HTMLElement; problem: HTMLElement; top: HTMLElement; slot: MapSlot | null }
export function buildDetail(id: string): Detail {
  const profileBox = el('div', { className: 'profile' });
  const noEle = el('p', { className: 'hint' });
  const mapBox = el('div', { className: 'route-map', role: 'region' });
  const problem = el('p', { className: 'hint' });
  problem.hidden = true;
  const facts = el('dl', { className: 'records' });
  const waypoints = el('div', { className: 'rt-wps' });
  // Walking speed and description (or their editor) at the top of the right column
  const top = el('div', { className: 'rt-top' });
  // Map on the left, what there is to know about the route on the right; one column when there is no map or little room
  const info = el('div', { className: 'rt-info' }, top, profileBox, facts, waypoints, noEle);
  const root = el('div', { className: `rt-detail${mapStyles ? ' with-map' : ''}` },
    ...(mapStyles ? [el('div', { className: 'rt-map-col' }, mapBox, problem)] : []), info);
  const slot = mapStyles ? createMapSlot(mapBox, pickStyle, message => { problem.textContent = message ?? ''; problem.hidden = !message; }) : null;
  slot?.setEnabled(true);
  return { id, el: root, profile: createProfile(profileBox), noEle, facts, waypoints, problem, top, slot };
}

/** The description as an element (none without one); the lang attribute is set when the text is in a language we know */
export function describe(r: Route, className: string, tag: 'p' | 'div' = 'p'): HTMLElement[] {
  const d = routeDescription(r, lang);
  if (!d) return [];
  const e = el(tag, { className, textContent: d.text });
  if (d.lang) e.lang = d.lang;
  return [e];
}

/** Who made the route, under which licence and where the track comes from (what the package says); nothing for a route without credit */
function credit(r: Route): HTMLElement[] {
  const text = [r.meta?.author, r.meta?.license, r.meta?.source].filter(Boolean).join(' · ');
  return text ? [el('p', { className: 'hint rt-credit', textContent: text })] : [];
}

/** Walking speed and description as text, with the icon that opens the editor */
function summary(r: Route, edit: () => void): HTMLElement[] {
  return [
    el('div', { className: 'rt-speed' },
      el('div', {}, el('span', { className: 'hint', textContent: t.routes.speedLabel }), el('strong', { textContent: t.control.speed(routeSpeed(r)) })),
      iconButton('edit', t.routes.edit, edit)),
    ...describe(r, 'rt-desc-full'),
    ...credit(r),
  ];
}

/** `editing` is the open editor of this route, if there is one; otherwise speed and description are shown as text */
export function fillDetail(detail: Detail, route: Route, stats: RouteStats, editing: HTMLElement | null, edit: () => void) {
  detail.profile.draw({ route, stats });
  detail.profile.mark(null);
  // The note is only there when there is nothing to show instead
  detail.noEle.hidden = stats.hasElevation;
  detail.noEle.textContent = t.routes.noElevation;
  detail.top.replaceChildren(...(editing ? [editing] : summary(route, edit)));
  detail.el.querySelector('.route-map')?.setAttribute('aria-label', t.routes.mapLabel);
  // The length is in the route's row; what is left are the figures of the elevation
  const facts: [string, string][] = stats.hasElevation ? [
    [t.routes.ascent, t.routes.meters(stats.ascent)],
    [t.routes.descent, t.routes.meters(stats.descent)],
    [t.routes.highest, t.routes.meters(stats.max!)],
    [t.routes.lowest, t.routes.meters(stats.min!)],
  ] : [];
  detail.facts.hidden = !facts.length;
  detail.facts.replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]));
  // The waypoints along the route, in the order of the route
  const placed = placeWaypoints(route, stats);
  detail.waypoints.hidden = !placed.length;
  detail.waypoints.replaceChildren(...(placed.length ? [
    el('h3', { textContent: t.routes.waypoints }),
    el('ol', { className: 'rt-waypoints' }, ...placed.map(p => {
      const text = waypointText(p.waypoint.text, lang);
      return el('li', {}, el('span', {}, el('strong', { textContent: fmtDistance(p.meters) }), ` · ${waypointText(p.waypoint.name, lang) ?? ''}`), ...(text ? [el('span', { className: 'rt-wp-text', textContent: text })] : []));
    })),
  ] : []));
  detail.slot?.setRoute(route);
}
