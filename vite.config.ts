import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { buildCsp } from './src/platform/csp.ts';
import { sharingRelays } from './src/platform/relays.ts';
import { resolveStoreBase } from './src/platform/store-url.ts';
import { mapOrigins, resolveMapStyles } from './src/core/routes/map-config.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Set in GitHub Actions (e.g. "user/walkflow"), empty locally
const githubRepo = process.env.GITHUB_REPOSITORY ?? '';
const desktop = process.env.VITE_TARGET === 'desktop';

// WALKFLOW_MAP_STYLE (light theme) and WALKFLOW_MAP_STYLE_DARK (dark theme): URL of a map style (https), or "off" for a build
// without a map. Empty = OpenFreeMap. A light style alone is used for both themes.
const mapStyles = resolveMapStyles(process.env.WALKFLOW_MAP_STYLE, process.env.WALKFLOW_MAP_STYLE_DARK);

/** Strict CSP only in the build: the dev server injects styles it would forbid. */
// Community (sharing between devices) is off unless the build says so (src/platform/features.ts)
const community = process.env.WALKFLOW_COMMUNITY === 'on';

// The route store: the store folder of the repository this build is made for (none without one); WALKFLOW_STORE_BASE is for trying it out
const storeBase = resolveStoreBase(githubRepo, process.env.WALKFLOW_STORE_BASE) ?? '';

const CSP = buildCsp({ mapOrigins: mapStyles ? mapOrigins(mapStyles) : [], relays: sharingRelays(community), store: storeBase || null, header: false });

function csp(): Plugin {
  return {
    name: 'walkflow-csp',
    apply: 'build',
    transformIndexHtml: html => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GITHUB_REPO__: JSON.stringify(githubRepo),
    __MAP_STYLES__: JSON.stringify(mapStyles),
    __COMMUNITY__: JSON.stringify(community),
    __STORE_BASE__: JSON.stringify(storeBase),
  },
  // The map chunk is large on purpose: it is loaded only when the map is switched on
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // The flags stay separate files (no data: addresses in the page), in their own folder so the offline cache can leave them out
    assetsInlineLimit: file => (file.includes('/flags/') ? false : undefined),
    rollupOptions: {
      output: {
        assetFileNames: asset => (asset.originalFileNames?.some(f => f.includes('/flags/')) ? 'assets/flags/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
  plugins: [
    csp(),
    VitePWA({
      // The desktop app has no service worker; the virtual modules remain as no-ops
      disable: desktop,
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        name: 'Walkflow',
        short_name: 'Walkflow',
        // One manifest for all languages; the app itself switches languages at runtime
        description: 'Open-source control for FTMS treadmills via Web Bluetooth',
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#12141a',
        theme_color: '#12141a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // The map (loaded only on request, needs the network anyway) and the country data stay out of the offline cache
        globIgnores: ['**/map-view-*', '**/maplibre-gl-*', '**/countries-*', '**/assets/flags/**'],
        // Flags are fetched when shown and kept after that
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.includes('/assets/flags/'), handler: 'CacheFirst', options: { cacheName: 'flags', expiration: { maxEntries: 80 } } }],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // theme.test.ts reads style.css (?raw); without this Vitest replaces CSS with an empty string
    css: true,
  },
});
