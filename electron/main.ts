// Electron-Main-Prozess. Lädt ausschließlich die lokal gebündelte Web-App über das eigene Schema app://walkflow/.
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import {
  app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, powerSaveBlocker, protocol, session, shell,
  type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions,
} from 'electron';
import { isNewerVersion } from '../src/version';

declare const __GITHUB_REPO__: string;

const SCHEME = 'app';
const HOST = 'walkflow';
const ORIGIN = `${SCHEME}://${HOST}`;
const RENDERER_DIR = join(__dirname, '..', 'dist-desktop');
/** Globales Stop-Kürzel, nur registriert solange verbunden */
const STOP_ACCELERATOR = 'CommandOrControl+Shift+Space';

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

/** Erlaubte Permission-Anfragen. Alles andere (Kamera, Mikrofon, Standort, Benachrichtigungen …) wird abgelehnt. */
const ALLOWED_PERMISSIONS = new Set(['screen-wake-lock', 'fullscreen']);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Unter Linux ist Web Bluetooth in Chromium hinter diesem Schalter (nicht getestet)
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-experimental-web-platform-features');

let win: BrowserWindow | null = null;
let btCallback: ((deviceId: string) => void) | null = null;
let pairingCallback: ((response: Electron.Response) => void) | null = null;
let powerBlockerId: number | null = null;

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
      headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function setMenu() {
  // Bewusst ohne „Neu laden“: ein Reload kappt die Bluetooth-Verbindung, das Band liefe ohne App weiter.
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: 'Bearbeiten', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Ansicht',
      submenu: [{ role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerStopShortcut() {
  if (globalShortcut.isRegistered(STOP_ACCELERATOR)) return;
  const ok = globalShortcut.register(STOP_ACCELERATOR, () => win?.webContents.send('app:global-stop'));
  win?.webContents.send('app:shortcut', { accelerator: STOP_ACCELERATOR, ok });
}

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 1000,
    minWidth: 360,
    backgroundColor: '#12141a',
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

  // Geräteauswahl für navigator.bluetooth.requestDevice(). Ohne diesen Handler gibt es keinen Chooser.
  // Das Event kommt mehrfach, während die Liste wächst; der jeweils letzte Callback zählt.
  wc.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    btCallback = callback;
    wc.send('bt:devices', devices.map(d => ({ id: d.deviceId, name: d.deviceName })));
  });

  // Pairing mit PIN o. Ä. (nur Windows/Linux, macOS koppelt selbst)
  if (process.platform !== 'darwin') {
    wc.session.setBluetoothPairingHandler((details, callback) => {
      pairingCallback = callback;
      wc.send('bt:pairing', { kind: details.pairingKind, pin: details.pin ?? null });
    });
  }

  // Schließen, während das Band (vermutlich) läuft: Renderer blockiert per beforeunload, hier fragen wir nach
  wc.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'warning',
      buttons: ['Abbrechen', 'Trotzdem schließen'],
      defaultId: 0,
      cancelId: 0,
      title: 'Das Band läuft noch',
      message: 'Das Band läuft noch.',
      detail: 'Nach dem Schließen kann die App es nicht mehr stoppen. Stoppe es besser vorher.',
    });
    if (choice === 1) event.preventDefault();
  });

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });
  void win.loadURL(`${ORIGIN}/index.html`);
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

ipcMain.handle('app:check-update', async e => {
  if (!fromWindow(e) || !__GITHUB_REPO__) return null;
  try {
    // Eigene Session: der Request-Blocker der Default-Session gilt nur für den Renderer
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

ipcMain.handle('app:open-external', (e, url: unknown) => {
  if (fromWindow(e) && typeof url === 'string' && isAllowedExternal(url)) void shell.openExternal(url);
});

// ---------- Härtung ----------
app.on('web-contents-created', (_e, contents) => {
  const block = (e: Electron.Event, url: string) => { if (!url.startsWith(`${ORIGIN}/`)) e.preventDefault(); };
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
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  void app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const ok = ALLOWED_PERMISSIONS.has(permission);
      if (!ok) console.log(`Berechtigung abgelehnt: ${permission}`);
      callback(ok);
    });
    // Keine Anfragen an Remote-Hosts aus dem Renderer
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const ok = [`${ORIGIN}/`, 'devtools://', 'data:', 'blob:'].some(p => details.url.startsWith(p));
      if (!ok) console.log(`Blockiert: ${details.url}`);
      callback({ cancel: !ok });
    });
    setMenu();
    createWindow();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
