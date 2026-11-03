// The editor of a route's walking speed and description in the routes view. It only builds the fields; what was typed is
// checked by editedRoute (core/routes/route-edit.ts).

import { lang, t } from '../../i18n/i18n';
import { routeDescription } from '../../core/routes/route-examples';
import { ROUTE_DESCRIPTION_MAX, ROUTE_SPEED_MAX, ROUTE_SPEED_MIN, routeSpeed, type Route } from '../../core/routes/routes';
import { toSpeed } from '../../i18n/units';
import { button, el } from '../components/elements';

export interface EditorHost {
  save(): void;
  cancel(): void;
}

export interface Editor { id: string; el: HTMLElement; speed: HTMLInputElement; text: HTMLTextAreaElement; status: HTMLElement }
export function buildEditor(r: Route, host: EditorHost): Editor {
  // Stored in km/h, typed and shown in the units of the settings
  const shown = (kmh: number) => String(Math.round(toSpeed(kmh) * 100) / 100);
  const speed = el('input', { type: 'number', min: shown(ROUTE_SPEED_MIN), max: shown(ROUTE_SPEED_MAX), step: '0.1', value: shown(routeSpeed(r)) });
  speed.setAttribute('inputmode', 'decimal');
  const text = el('textarea', { maxLength: ROUTE_DESCRIPTION_MAX, rows: 3, placeholder: t.routes.descriptionPlaceholder, value: routeDescription(r, lang)?.text ?? '' });
  const status = el('p', { className: 'hint' });
  status.setAttribute('role', 'status');
  const save = button(t.routes.save, host.save);
  save.classList.add('primary');
  const root = el('div', { className: 'rt-edit grid' },
    el('label', { className: 'hint field' }, el('span', { textContent: t.routes.speed }), speed),
    el('label', { className: 'hint field' }, el('span', { textContent: t.routes.description }), text),
    el('div', { className: 'row' }, save, button(t.common.cancel, host.cancel)),
    status);
  return { id: r.id, el: root, speed, text, status };
}
