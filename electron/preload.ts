// Preload (sandboxed): gives the web app a small, fixed API. No Node access in the renderer.
import { contextBridge, ipcRenderer } from 'electron';

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
  checkForUpdate: (): Promise<{ version: string; url: string } | null> => ipcRenderer.invoke('app:check-update'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', String(url)),
  setLanguage: (lang: string) => ipcRenderer.send('app:language', String(lang)),
  setTheme: (theme: string) => ipcRenderer.send('app:theme', String(theme)),
});
