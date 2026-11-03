// Electron main process. Loads only the locally bundled web app via its own scheme app://walkflow/.
import { readFile, stat } from 'node:fs/promises';
import { basename, join, normalize, sep } from 'node:path';
import {
  app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeTheme, powerSaveBlocker, protocol, screen, session, shell,
  type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions,
} from 'electron';
import { detectLanguage, isLang, setLanguage, t } from '../src/i18n';
import { buildCsp } from '../src/csp';
import { devToolsAllowed } from '../src/dev-mode';
import { devOrigin } from '../src/dev-url';
import { mapOrigins, resolveMapStyles } from '../src/map-config';
import { mimeFor } from '../src/mime';
import { OPEN_MAX_BYTES, packagePaths } from '../src/open-files';
import { isNewerVersion } from '../src/version';

declare const __GITHUB_REPO__: string;
/** The raw build settings WALKFLOW_MAP_STYLE and WALKFLOW_MAP_STYLE_DARK; resolved here the same way as for the renderer (vite.config.ts) */
declare const __MAP_STYLE_RAW__: string;
declare const __MAP_STYLE_DARK_RAW__: string;

const SCHEME = 'app';
const HOST = 'walkflow';
const ORIGIN = `${SCHEME}://${HOST}`;
/** npm run electron:dev: the Vite dev server is loaded instead of the bundled files (never in an installed app) */
const DEV_ORIGIN = devOrigin(process.env.WALKFLOW_DEV_URL, app.isPackaged);
// A development instance has its own data folder: it does not collide (single instance lock) with an app that is running, and
// it does not touch its settings
if (DEV_ORIGIN) app.setPath('userData', `${app.getPath('userData')}-dev`);
const RENDERER_DIR = join(__dirname, '..', 'dist-desktop');
/** Global stop shortcut, registered only while connected */
const STOP_ACCELERATOR = 'CommandOrControl+Shift+Space';
/** Page background (--bg in src/style.css), shown before the page has painted */
const BACKGROUND = { dark: '#12141a', light: '#f3f4f7' };
const background = () => (nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light);

const MAP_STYLES = resolveMapStyles(__MAP_STYLE_RAW__, __MAP_STYLE_DARK_RAW__);
const MAP_ORIGINS = MAP_STYLES ? mapOrigins(MAP_STYLES) : [];
const CSP = buildCsp({ mapOrigins: MAP_ORIGINS, header: true });

/** Allowed permission requests. Everything else (camera, microphone, location, notifications …) is denied. */
const ALLOWED_PERMISSIONS = new Set(['screen-wake-lock', 'fullscreen']);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// On Linux, Web Bluetooth in Chromium is behind this switch (not tested)
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-experimental-web-platform-features');

let win: BrowserWindow | null = null;
let btCallback: ((deviceId: string) => void) | null = null;
let pairingCallback: ((response: Electron.Response) => void) | null = null;
let powerBlockerId: number | null = null;
/** Developer mode of the web app (Settings → General), reported by the page; off until it says so */
let devMode = false;
const devToolsOk = () => devToolsAllowed(devMode, DEV_ORIGIN !== null);

// Route packages opened from the Finder or Explorer: queued until the web app says it can take them, then handed over as
// text. The web app checks everything and asks the person before it imports anything.
const pendingOpen: string[] = [];
let rendererReady = false;

async function flushOpen() {
  if (!rendererReady || !win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  for (let path = pendingOpen.shift(); path !== undefined; path = pendingOpen.shift()) {
    const name = basename(path);
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > OPEN_MAX_BYTES) win.webContents.send('app:open-package', { name, error: 'tooLarge' });
      else win.webContents.send('app:open-package', { name, text: await readFile(path, 'utf8') });
    } catch {
      win.webContents.send('app:open-package', { name, error: 'unreadable' });
    }
  }
}

function queueOpen(paths: readonly string[]) {
  pendingOpen.push(...paths);
  void flushOpen();
}

// macOS reports an opened file as an event, possibly before the app is ready
app.on('open-file', (event, path) => {
  event.preventDefault();
  queueOpen(packagePaths([path]));
});

const fromWindow = (e: IpcMainEvent | IpcMainInvokeEvent) => !!win && e.sender === win.webContents;
const releasesUrl = () => (__GITHUB_REPO__ ? `https://github.com/${__GITHUB_REPO__}/releases` : '');

function isAllowedExternal(url: string): boolean {
  return /^https:\/\/github\.com\//.test(url);
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  let path = decodeURIComponent(url.pathname);
  if (path === '/' || path === '') path = '/index.html';
  const file = normalize(join(RENDERER_DIR, path));
  if (!file.startsWith(RENDERER_DIR + sep)) return new Response('Forbidden', { status: 403 });
  try {
    const body = await readFile(file);
    return new Response(body, {
      headers: { 'content-type': mimeFor(file), 'content-security-policy': CSP },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function setMenu() {
  // Deliberately without "Reload": a reload cuts the Bluetooth connection and the belt would keep running without the app.
  // Electron's role labels are English only, so every item gets its label from the locale files.
  const m = t.electron;
  const app = 'Walkflow';
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{
      label: app,
      submenu: [
        { role: 'about', label: m.about(app) }, { type: 'separator' },
        { role: 'hide', label: m.hide(app) }, { role: 'hideOthers', label: m.hideOthers }, { role: 'unhide', label: m.showAll },
        { type: 'separator' }, { role: 'quit', label: m.quit(app) },
      ],
    } satisfies MenuItemConstructorOptions] : []),
    { label: m.menuEdit, submenu: [{ role: 'copy', label: m.copy }, { role: 'paste', label: m.paste }, { role: 'selectAll', label: m.selectAll }] },
    {
      label: m.menuView,
      submenu: [
        ...(devToolsOk() ? [{ role: 'toggleDevTools', label: m.devTools } satisfies MenuItemConstructorOptions, { type: 'separator' } satisfies MenuItemConstructorOptions] : []),
        { role: 'resetZoom', label: m.actualSize }, { role: 'zoomIn', label: m.zoomIn }, { role: 'zoomOut', label: m.zoomOut },
        { role: 'togglefullscreen', label: m.fullScreen },
      ],
    },
    {
      role: 'windowMenu',
      label: m.menuWindow,
      submenu: [
        { role: 'minimize', label: m.minimize }, ...(mac ? [{ role: 'zoom', label: m.zoom } satisfies MenuItemConstructorOptions] : []),
        { role: 'close', label: m.closeWindow },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerStopShortcut() {
  if (globalShortcut.isRegistered(STOP_ACCELERATOR)) return;
  const ok = globalShortcut.register(STOP_ACCELERATOR, () => win?.webContents.send('app:global-stop'));
  win?.webContents.send('app:shortcut', { accelerator: STOP_ACCELERATOR, ok });
}

function createWindow() {
  // Wide enough for the two-column layout (from 1024 px), but never larger than the screen
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1360, area.width),
    height: Math.min(900, area.height),
    minWidth: 360,
    backgroundColor: background(),
    title: 'Walkflow',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  const wc = win.webContents;
  // The developer tools only in developer mode: no menu entry, and one that is opened some other way is closed again
  wc.on('devtools-opened', () => { if (!devToolsOk()) wc.closeDevTools(); });

  // Device selection for navigator.bluetooth.requestDevice(). Without this handler there is no chooser.
  // The event fires several times while the list grows; the latest callback counts.
  wc.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    btCallback = callback;
    wc.send('bt:devices', devices.map(d => ({ id: d.deviceId, name: d.deviceName })));
  });

  // Pairing with a PIN or similar (Windows/Linux only, macOS pairs by itself)
  if (process.platform !== 'darwin') {
    wc.session.setBluetoothPairingHandler((details, callback) => {
      pairingCallback = callback;
      wc.send('bt:pairing', { kind: details.pairingKind, pin: details.pin ?? null });
    });
  }

  // Closing while the belt is (probably) running: the renderer blocks via beforeunload, here we ask
  wc.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'warning',
      buttons: [t.electron.closeCancel, t.electron.closeAnyway],
      defaultId: 0,
      cancelId: 0,
      title: t.electron.closeTitle,
      message: t.electron.closeMessage,
      detail: t.electron.closeDetail,
    });
    if (choice === 1) event.preventDefault();
  });

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });
  void win.loadURL(DEV_ORIGIN ? `${DEV_ORIGIN}/` : `${ORIGIN}/index.html`);
}

// ---------- IPC ----------
ipcMain.on('bt:select', (e, id: unknown) => {
  if (!fromWindow(e)) return;
  const cb = btCallback;
  btCallback = null;
  cb?.(typeof id === 'string' ? id : '');
});

ipcMain.on('bt:pairing-response', (e, r: unknown) => {
  if (!fromWindow(e)) return;
  const cb = pairingCallback;
  pairingCallback = null;
  const o = (r ?? {}) as { confirmed?: unknown; pin?: unknown };
  cb?.({ confirmed: o.confirmed === true, ...(typeof o.pin === 'string' ? { pin: o.pin } : {}) });
});

ipcMain.on('app:connection', (e, connected: unknown) => {
  if (!fromWindow(e)) return;
  if (connected === true) {
    if (powerBlockerId === null) powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    registerStopShortcut();
  } else {
    if (powerBlockerId !== null) powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
    globalShortcut.unregister(STOP_ACCELERATOR);
  }
});

ipcMain.on('app:language', (e, lang: unknown) => {
  if (!fromWindow(e) || !isLang(lang)) return;
  setLanguage(lang);
  setMenu();
});

// The app's theme also drives native dialogs, the title bar and prefers-color-scheme in the renderer
ipcMain.on('app:theme', (e, theme: unknown) => {
  if (!fromWindow(e) || (theme !== 'system' && theme !== 'dark' && theme !== 'light')) return;
  nativeTheme.themeSource = theme;
  win?.setBackgroundColor(background());
});

ipcMain.handle('app:check-update', async e => {
  if (!fromWindow(e) || !__GITHUB_REPO__) return null;
  try {
    // Separate session: the request blocker of the default session is meant for the renderer only
    const res = await session.fromPartition('walkflow-updates').fetch(`https://api.github.com/repos/${__GITHUB_REPO__}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Walkflow' },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const tag = typeof j.tag_name === 'string' ? j.tag_name : '';
    const url = typeof j.html_url === 'string' && j.html_url.startsWith(`${releasesUrl()}/`) ? j.html_url : releasesUrl();
    return isNewerVersion(tag, app.getVersion()) ? { version: tag.replace(/^v/, ''), url } : null;
  } catch {
    return null;
  }
});

ipcMain.on('app:dev-mode', (e, on: unknown) => {
  if (!fromWindow(e)) return;
  devMode = on === true;
  setMenu();
  if (!devToolsOk()) win?.webContents.closeDevTools();
});

ipcMain.on('app:files-ready', e => {
  if (!fromWindow(e)) return;
  rendererReady = true;
  void flushOpen();
});

ipcMain.handle('app:open-external', (e, url: unknown) => {
  if (fromWindow(e) && typeof url === 'string' && isAllowedExternal(url)) void shell.openExternal(url);
});

// ---------- Hardening ----------
app.on('web-contents-created', (_e, contents) => {
  const block = (e: Electron.Event, url: string) => { if (!url.startsWith(`${ORIGIN}/`) && !(DEV_ORIGIN && url.startsWith(`${DEV_ORIGIN}/`))) e.preventDefault(); };
  contents.on('will-navigate', block);
  contents.on('will-redirect', block);
  contents.on('will-attach-webview', e => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Windows and Linux pass an opened file as an argument, to a new start or to the instance that is running
  queueOpen(packagePaths(process.argv.slice(1)));
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    queueOpen(packagePaths(argv.slice(1)));
  });

  void app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const ok = ALLOWED_PERMISSIONS.has(permission);
      if (!ok) console.log(`Permission denied: ${permission}`);
      callback(ok);
    });
    // No requests to remote hosts from the renderer, except the map servers of this build (only used once the map is on)
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const dev = DEV_ORIGIN ? [`${DEV_ORIGIN}/`, `${DEV_ORIGIN.replace('http:', 'ws:')}/`] : [];
      const ok = [`${ORIGIN}/`, 'devtools://', 'data:', 'blob:', ...dev, ...MAP_ORIGINS.map(o => `${o}/`)].some(p => details.url.startsWith(p));
      if (!ok) console.log(`Blocked: ${details.url}`);
      callback({ cancel: !ok });
    });
    // Until the renderer reports its language: the system languages
    setLanguage(detectLanguage({ preferred: app.getPreferredSystemLanguages() }));
    setMenu();
    createWindow();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
