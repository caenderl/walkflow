// Builds the desktop variant: renderer (without service worker) to dist-desktop/, main + preload to dist-electron/.
// A Node script instead of an npm script, so environment variables are set on Windows too.
import { rmSync } from 'node:fs';
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';

process.env.VITE_TARGET = 'desktop';
process.env.BASE_PATH = './';
const repo = process.env.GITHUB_REPOSITORY ?? '';

rmSync('dist-desktop', { recursive: true, force: true });
rmSync('dist-electron', { recursive: true, force: true });

await viteBuild({ build: { outDir: 'dist-desktop', emptyOutDir: true }, logLevel: 'warn' });

await esbuild({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  define: { __GITHUB_REPO__: JSON.stringify(repo), __MAP_STYLE_RAW__: JSON.stringify(process.env.WALKFLOW_MAP_STYLE ?? '') },
  logLevel: 'warning',
});

console.log(`Desktop build done${repo ? ` (update check against ${repo})` : ' (no update check, GITHUB_REPOSITORY not set)'}`);
