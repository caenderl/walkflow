// Upkeep of the route library at start: the examples that come with the app, and the country of routes that have none.
// Both are best effort; a failure leaves the library as it is and the next start tries again.

import { countryAt } from '../../core/routes/country';
import { adoptExample, examplesToSeed, exampleRoute, markSeeded, readSeeded, ROUTE_EXAMPLES, SEEDED_STORAGE_KEY } from '../../core/routes/route-examples';
import { newRouteId, readRoute } from '../../core/routes/routes';
import type { RouteStore } from '../../data/route-store';
import { store } from '../store';

/** Once per start: the examples that come with the app go into a library that has never had them */
let seeding = false;
export async function seedExamples(s: RouteStore) {
  if (seeding || !s.persistent) return;
  seeding = true;
  try {
    const seeded = readSeeded(store.get(SEEDED_STORAGE_KEY));
    const library = await s.list();
    // A copy of an example from before routes knew their example becomes that example
    for (const r of library) {
      for (const ex of ROUTE_EXAMPLES) {
        const adopted = adoptExample(r, ex);
        if (adopted) { await s.put(adopted); break; }
      }
    }
    const have = library.map(r => r.name);
    for (const ex of examplesToSeed(seeded, have)) {
      const route = readRoute(exampleRoute(ex, newRouteId(Date.now()), Date.now()));
      if (route) await s.put(route);
    }
    store.set(SEEDED_STORAGE_KEY, JSON.stringify(markSeeded(seeded)));
  } catch { /* the library just stays as it is; the next start tries again */ }
}

/** Once per start: routes that have no country yet (imported before flags, or restored from an old backup) get one */
let backfilling = false;
export async function backfillCountries(s: RouteStore) {
  if (backfilling) return;
  backfilling = true;
  try {
    for (const r of (await s.list()).filter(x => x.country === undefined)) {
      const start = r.points[0]!;
      await s.put({ ...r, country: await countryAt(start.lat, start.lon) });
    }
  } catch { /* the flags are only decoration; the next start tries again */ }
}
