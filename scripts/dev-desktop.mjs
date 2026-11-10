// The desktop app in watch mode: the Vite dev server serves the web app (a change in src/ shows at once, no reload of the
// window needed), esbuild rebuilds main and preload when electron/ changes and Electron is restarted. Only for development:
// an installed app never loads the dev server (src/platform/dev-url.ts).
// Usage: npm run electron:dev   (WALKFLOW_DEV_PORT sets another port than 5175)
import { spawn } from 'node:child_process';
import electron from 'electron';
import { context } from 'esbuild';
import { createServer } from 'vite';
import { resolveStoreBase } from '../src/platform/store-url.ts';

process.env.VITE_TARGET = 'desktop';
process.env.BASE_PATH = './';
const port = Number(process.env.WALKFLOW_DEV_PORT ?? 5175);
const repo = process.env.GITHUB_REPOSITORY ?? '';

const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const url = `http://127.0.0.1:${port}`;
console.log(`Dev server on ${url}`);

let child = null;
let restarting = false;
function start() {
  child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, WALKFLOW_DEV_URL: url } });
  child.on('exit', code => {
    if (restarting) return;
    // Closing the window ends the session
    void stop(code ?? 0);
  });
}
async function restart() {
  if (!child) return start();
  restarting = true;
  const old = child;
  await new Promise(resolve => { old.once('exit', resolve); old.kill(); });
  restarting = false;
  start();
}

let ready = false;
const main = await context({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'electron-updater'],
  define: { __GITHUB_REPO__: JSON.stringify(repo), __MAC_SIGNED__: JSON.stringify(!!process.env.CSC_LINK && !!process.env.APPLE_TEAM_ID), __MAP_STYLE_RAW__: JSON.stringify(process.env.WALKFLOW_MAP_STYLE ?? ''), __MAP_STYLE_DARK_RAW__: JSON.stringify(process.env.WALKFLOW_MAP_STYLE_DARK ?? ''), __COMMUNITY__: JSON.stringify(process.env.WALKFLOW_COMMUNITY === 'on'), __STORE_BASE__: JSON.stringify(resolveStoreBase(repo, process.env.WALKFLOW_STORE_BASE) ?? '') },
  logLevel: 'warning',
  plugins: [{
    name: 'restart-electron',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length) return console.log('Build of electron/ failed, the app keeps running with the last good build');
        if (!ready) { ready = true; start(); } else { console.log('electron/ changed: restarting'); void restart(); }
      });
    },
  }],
});
await main.watch();

async function stop(code) {
  await main.dispose();
  await server.close();
  process.exit(code);
}
process.on('SIGINT', () => { child?.kill(); void stop(0); });
process.on('SIGTERM', () => { child?.kill(); void stop(0); });
