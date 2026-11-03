// The opened details of a route in the routes view: map, elevation profile, figures, and the walking speed and description
// (or their editor) at the top of the right column.

import { lang, t } from '../../i18n/i18n';
import { routeDescription } from '../../core/routes/route-examples';
import { routeSpeed, type Route, type RouteStats } from '../../core/routes/routes';
import { el, iconButton } from '../components/elements';
import { createProfile } from './route-profile';
import { createMapSlot, mapStyles, pickStyle, type MapSlot } from './route-map';

export interface Detail { id: string; el: HTMLElement; profile: ReturnType<typeof createProfile>; noEle: HTMLElement; facts: HTMLElement; problem: HTMLElement; top: HTMLElement; slot: MapSlot | null }
export function buildDetail(id: string): Detail {
  const profileBox = el('div', { className: 'profile' });
  const noEle = el('p', { className: 'hint' });
  const mapBox = el('div', { className: 'route-map', role: 'region' });
  const problem = el('p', { className: 'hint' });
  problem.hidden = true;
  const facts = el('dl', { className: 'records' });
  // Walking speed and description (or their editor) at the top of the right column
  const top = el('div', { className: 'rt-top' });
  // Map on the left, what there is to know about the route on the right; one column when there is no map or little room
  const info = el('div', { className: 'rt-info' }, top, profileBox, facts, noEle);
  const root = el('div', { className: `rt-detail${mapStyles ? ' with-map' : ''}` },
    ...(mapStyles ? [el('div', { className: 'rt-map-col' }, mapBox, problem)] : []), info);
  const slot = mapStyles ? createMapSlot(mapBox, pickStyle, message => { problem.textContent = message ?? ''; problem.hidden = !message; }) : null;
  slot?.setEnabled(true);
  return { id, el: root, profile: createProfile(profileBox), noEle, facts, problem, top, slot };
}

/** The description as an element (none without one); the lang attribute is set when the text is in a language we know */
export function describe(r: Route, className: string, tag: 'p' | 'div' = 'p'): HTMLElement[] {
  const d = routeDescription(r, lang);
  if (!d) return [];
  const e = el(tag, { className, textContent: d.text });
  if (d.lang) e.lang = d.lang;
  return [e];
}

/** Walking speed and description as text, with the icon that opens the editor */
function summary(r: Route, edit: () => void): HTMLElement[] {
  return [
    el('div', { className: 'rt-speed' },
      el('div', {}, el('span', { className: 'hint', textContent: t.routes.speedLabel }), el('strong', { textContent: t.control.speed(routeSpeed(r)) })),
      iconButton('edit', t.routes.edit, edit)),
    ...describe(r, 'rt-desc-full'),
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
  detail.slot?.setRoute(route);
}
