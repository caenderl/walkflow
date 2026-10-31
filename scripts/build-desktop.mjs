// Baut die Desktop-Variante: Renderer (ohne Service Worker) nach dist-desktop/, Main + Preload nach dist-electron/.
// Als Node-Skript statt npm-Script, damit Umgebungsvariablen auch unter Windows gesetzt werden.
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
  define: { __GITHUB_REPO__: JSON.stringify(repo) },
  logLevel: 'warning',
});

console.log(`Desktop-Build fertig${repo ? ` (Update-Check gegen ${repo})` : ' (ohne Update-Check, GITHUB_REPOSITORY nicht gesetzt)'}`);
