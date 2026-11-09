// Upkeep of the route library at start: the country of routes that have none.
// Best effort; a failure leaves the library as it is and the next start tries again.

import { countryAt } from '../../core/routes/country';
import type { RouteStore } from '../../data/route-store';

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
