import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { buildCsp } from './src/csp.ts';
import { mapOrigin, resolveMapStyle } from './src/map-config.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Set in GitHub Actions (e.g. "user/walkflow"), empty locally
const githubRepo = process.env.GITHUB_REPOSITORY ?? '';
const desktop = process.env.VITE_TARGET === 'desktop';

// WALKFLOW_MAP_STYLE: URL of the map style (https), or "off" for a build without a map. Empty = OpenFreeMap.
const mapStyle = resolveMapStyle(process.env.WALKFLOW_MAP_STYLE);

/** Strict CSP only in the build: the dev server injects styles it would forbid. */
const CSP = buildCsp({ mapOrigin: mapStyle && mapOrigin(mapStyle), header: false });

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
    __MAP_STYLE__: JSON.stringify(mapStyle),
  },
  // The map chunk is large on purpose: it is loaded only when the map is switched on
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
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
        // The map (loaded only on request, needs the network anyway) stays out of the offline cache
        globIgnores: ['**/map-view-*', '**/maplibre-gl-*'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    // theme.test.ts reads style.css (?raw); without this Vitest replaces CSS with an empty string
    css: true,
  },
});
