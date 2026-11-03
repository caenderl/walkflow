// What the route editor turns into: the walking speed and the description typed by the person, checked and put on the route.
// What is saved has passed readRoute.

import type { Lang } from '../../i18n/i18n';
import { fromSpeed } from '../../i18n/units';
import { descriptionAfterEdit } from './route-examples';
import { readRoute, ROUTE_SPEED_MAX, ROUTE_SPEED_MIN, type Route } from './routes';

export type EditResult =
  | { ok: true; route: Route }
  /** The speed is not a number in the allowed range */
  | { ok: false; reason: 'speed' }
  /** The result did not pass readRoute (a route that is broken); nothing is saved */
  | { ok: false; reason: 'invalid' };

/**
 * `speed` is what was typed, in the units of the settings; empty means "no speed of its own", the app's default is used.
 * `description` is the text field as it is: a text left as shown keeps following the language (descriptionAfterEdit).
 */
export function editedRoute(route: Route, input: { speed: string; description: string }, lang: Lang): EditResult {
  const raw = input.speed.trim().replace(',', '.');
  const kmh = raw ? Math.round(fromSpeed(Number(raw)) * 100) / 100 : undefined;
  if (kmh !== undefined && !(kmh >= ROUTE_SPEED_MIN && kmh <= ROUTE_SPEED_MAX)) return { ok: false, reason: 'speed' };
  const next = readRoute({
    ...route, defaultSpeed: kmh, description: undefined, example: undefined, texts: undefined,
    ...descriptionAfterEdit(route, input.description, lang),
  });
  return next ? { ok: true, route: next } : { ok: false, reason: 'invalid' };
}
