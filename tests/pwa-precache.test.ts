import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getManifest } from 'workbox-build';
import { pwaWorkbox } from '../vite.config.ts';

// A dependency override once left workbox-build with a glob/minimatch pair whose wildcards matched nothing,
// so the service worker precached only the manifest and the app did not work offline. This runs the real
// patterns from vite.config.ts through workbox-build on a small stand-in for dist/.
const files = [
  'index.html',
  'favicon.svg',
  'manifest.webmanifest',
  'assets/index-abc123.js',
  'assets/index-abc123.css',
  'assets/share-hub-abc123.js',
  'icons/icon-192.png',
  'legal/en/privacy.html',
  'assets/map-view-abc123.js',
  'assets/maplibre-gl-abc123.js',
  'assets/maplibre-gl-abc123.css',
  'assets/countries-abc123.js',
  'assets/flags/de-abc123.svg',
];

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'walkflow-precache-'));
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), file);
  }
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('PWA precache (what the app needs offline)', () => {
  it('takes the app shell, its code and styles, icons and legal pages, and leaves out the map, countries and flags', async () => {
    const { manifestEntries, warnings } = await getManifest({ globDirectory: dir, globPatterns: pwaWorkbox.globPatterns, globIgnores: pwaWorkbox.globIgnores });
    expect(warnings).toEqual([]);
    expect(manifestEntries?.map(e => e.url).sort()).toEqual([
      'assets/index-abc123.css',
      'assets/index-abc123.js',
      'assets/share-hub-abc123.js',
      'favicon.svg',
      'icons/icon-192.png',
      'index.html',
      'legal/en/privacy.html',
    ]);
  });
});
