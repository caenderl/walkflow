// Preload (sandboxed): gives the web app a small, fixed API. No Node access in the renderer.
import { contextBridge, ipcRenderer } from 'electron';

// The renderer may call these with anything, whatever the types say: the values are made into what main expects before they go over IPC.
/* oxlint-disable typescript/no-unnecessary-type-conversion, typescript/no-unnecessary-boolean-literal-compare -- see above */

contextBridge.exposeInMainWorld('walkflowDesktop', {
  platform: process.platform,
  connectionChanged: (connected: boolean) => ipcRenderer.send('app:connection', connected === true),
  onGlobalStop: (cb: () => void) => { ipcRenderer.on('app:global-stop', () => cb()); },
  onShortcutStatus: (cb: (s: { accelerator: string; ok: boolean }) => void) => {
    ipcRenderer.on('app:shortcut', (_e, s: { accelerator: string; ok: boolean }) => cb(s));
  },
  onBluetoothDevices: (cb: (devices: { id: string; name: string }[]) => void) => {
    ipcRenderer.on('bt:devices', (_e, list: { id: string; name: string }[]) => cb(list));
  },
  selectBluetoothDevice: (id: string) => ipcRenderer.send('bt:select', String(id)),
  onBluetoothPairing: (cb: (d: { kind: string; pin: string | null }) => void) => {
    ipcRenderer.on('bt:pairing', (_e, d: { kind: string; pin: string | null }) => cb(d));
  },
  respondPairing: (r: { confirmed: boolean; pin?: string }) => ipcRenderer.send('bt:pairing-response', r),
  // Updates (platform/update-controller.ts): the state arrives as events; the person's two yeses are downloadUpdate and installUpdate
  checkForUpdate: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
  onUpdateState: (cb: (s: unknown) => void) => { ipcRenderer.on('update:state', (_e, s: unknown) => cb(s)); },
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', String(url)),
  onOpenPackage: (cb: (f: { name: string; text?: string; error?: string }) => void) => {
    ipcRenderer.on('app:open-package', (_e, f: { name: string; text?: string; error?: string }) => cb(f));
    ipcRenderer.send('app:files-ready');
  },
  setDevMode: (on: boolean) => ipcRenderer.send('app:dev-mode', on === true),
  setLanguage: (lang: string) => ipcRenderer.send('app:language', String(lang)),
  setTheme: (theme: string) => ipcRenderer.send('app:theme', String(theme)),
});
