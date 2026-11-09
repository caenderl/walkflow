// The route store in the repository (store/, docs/ROUTE-STORE.md): every file is a valid route package under a stated licence, and
// index.json is what the build would write for them. `npm run store:check` does the same for CI; this keeps it in `npm test`.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPackage } from '../src/core/routes/route-package';
import { placeWaypoints } from '../src/core/routes/route-waypoints';
import { analyzeRoute } from '../src/core/routes/routes';
import { entryFromPackage, parseIndex, serializeIndex, type StoreRoute } from '../src/core/store/route-index';

const DIR = fileURLToPath(new URL('../store/routes/', import.meta.url));
const INDEX = fileURLToPath(new URL('../store/index.json', import.meta.url));
const files = readdirSync(DIR).filter(f => !f.startsWith('.')).sort();
const text = (f: string) => readFileSync(`${DIR}${f}`, 'utf8');

describe('the route store', () => {
  it('has only route packages, with a file name the app accepts', async () => {
    for (const f of files) {
      const r = await entryFromPackage(f, text(f));
      expect(r.ok, `${f}: ${r.ok ? '' : r.reason}`).toBe(true);
    }
  });

  it('says under which licence every route may be used', () => {
    for (const f of files) expect(String((JSON.parse(text(f)) as { license?: unknown }).license ?? '').trim(), f).not.toBe('');
  });

  it('has every waypoint on its route', () => {
    for (const f of files) {
      const read = readPackage(text(f), 'x', 0);
      if (!read.ok) continue;
      expect(placeWaypoints(read.route, analyzeRoute(read.route)), f).toHaveLength(read.route.waypoints?.length ?? 0);
    }
  });

  it('has no file twice', async () => {
    const hashes = new Set<string>();
    for (const f of files) {
      const r = await entryFromPackage(f, text(f));
      if (r.ok) { expect(hashes.has(r.entry.sha256), f).toBe(false); hashes.add(r.entry.sha256); }
    }
  });

  it('has an index that is up to date and that the app accepts', async () => {
    const entries: StoreRoute[] = [];
    for (const f of files) {
      const r = await entryFromPackage(f, text(f));
      if (r.ok) entries.push(r.entry);
    }
    const have = readFileSync(INDEX, 'utf8');
    expect(have, 'run "npm run store:build"').toBe(serializeIndex(entries));
    expect(parseIndex(have).ok).toBe(true);
  });

  it('keeps the credit of the data it is made from', () => {
    for (const f of files) expect(String((JSON.parse(text(f)) as { source?: unknown }).source ?? ''), f).toMatch(/OpenStreetMap|own|Walkflow/i);
  });
});
