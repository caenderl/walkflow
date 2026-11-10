// A small route with names, places, texts and credit in several languages, for tests. It is not used by the app: the routes that
// come with Walkflow are in the route store (the route-store repository), not in the code.

import type { Route } from './routes';

export const SAMPLE_NAMES = { en: 'Park Loop', de: 'Parkrunde', fr: 'Tour du parc' };
export const SAMPLE_PLACE = { en: 'Berlin, Germany', de: 'Berlin, Deutschland', fr: 'Berlin, Allemagne' };
export const SAMPLE_TEXTS = { en: 'A loop around the park.', de: 'Eine Runde um den Park.', fr: 'Un tour du parc.' };
export const SAMPLE_SOURCE = '© OpenStreetMap contributors (ODbL)';

/** About 1.1 km long: a square around the park */
export function sampleRoute(id: string, now: number): Route {
  return {
    id, name: SAMPLE_NAMES.en, names: { ...SAMPLE_NAMES }, texts: { ...SAMPLE_TEXTS }, updated: now, country: 'DE', defaultSpeed: 4,
    points: [[52.5, 13.4], [52.5, 13.405], [52.504, 13.405], [52.504, 13.4], [52.5, 13.4]].map(([lat, lon]) => ({ lat: lat!, lon: lon! })),
    meta: { place: { ...SAMPLE_PLACE }, source: SAMPLE_SOURCE, license: 'ODbL-1.0', author: 'Walkflow', tags: ['park', 'loop'] },
  };
}
