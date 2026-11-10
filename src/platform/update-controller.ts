// How the desktop app updates itself. The person decides at both steps: first "download and install", later "restart". Nothing is
// downloaded before the first yes, and nothing restarts without the second one, and never while the app is connected to the
// treadmill: quitting would cut the Bluetooth connection and the belt would keep running without the app (the same rule as
// reloading the web app, ui/pwa.ts). The controller is plain logic; the electron-updater adapter and the IPC are in electron/main.ts.
// Where the app cannot install an update itself (macOS without a signature), it only points to the release page.

import { isNewerVersion, parseVersion } from './version';

export type UpdateState =
  /** `self`: the app can download and install it itself; otherwise the person is sent to `url` */
  | { stage: 'available'; version: string; self: boolean; url: string }
  | { stage: 'downloading'; version: string; percent: number }
  | { stage: 'ready'; version: string }
  /** The person asked to restart, but the app is connected to the treadmill */
  | { stage: 'blocked'; version: string }
  | { stage: 'error'; version: string; url: string };

/** What the controller needs from an updater (electron-updater, wrapped in electron/main.ts) */
export interface UpdaterPort {
  onAvailable(cb: (version: string) => void): void;
  onProgress(cb: (percent: number) => void): void;
  onDownloaded(cb: (version: string) => void): void;
  onError(cb: (e: Error) => void): void;
  check(): Promise<unknown>;
  download(): Promise<unknown>;
  quitAndInstall(): void;
}

/** Whether this build can install an update on its own. macOS refuses to replace an app that is not signed. */
export function selfUpdateSupported(o: { platform: string; appImage: boolean; macSigned: boolean }): boolean {
  if (o.platform === 'win32') return true;
  if (o.platform === 'linux') return o.appImage;
  if (o.platform === 'darwin') return o.macSigned;
  return false;
}

export function createUpdateController(o: {
  /** null: this build cannot install updates itself */
  updater: UpdaterPort | null;
  /** The newest release, read from GitHub, for builds without an updater; null: none, or not readable */
  checkRelease: () => Promise<{ version: string; url: string } | null>;
  releaseUrl: string;
  currentVersion: string;
  isConnected: () => boolean;
  emit: (s: UpdateState) => void;
}) {
  let state: UpdateState | null = null;
  let checking = false;
  const set = (s: UpdateState) => { state = s; o.emit(s); };
  // A stable version that is newer than this one; a pre-release is never offered
  const acceptable = (v: string) => parseVersion(v)?.pre === false && isNewerVersion(v, o.currentVersion);

  o.updater?.onAvailable(version => {
    if (checking && acceptable(version)) set({ stage: 'available', version, self: true, url: o.releaseUrl });
  });
  o.updater?.onProgress(percent => {
    if (state?.stage !== 'downloading') return;
    const p = Math.max(0, Math.min(100, Math.floor(percent)));
    if (p !== state.percent) set({ stage: 'downloading', version: state.version, percent: p });
  });
  o.updater?.onDownloaded(version => { if (state?.stage === 'downloading') set({ stage: 'ready', version }); });
  o.updater?.onError(() => {
    // A check that fails stays quiet (no network is normal); a download or a restart that fails is shown
    if (state && state.stage !== 'available' && state.stage !== 'error') set({ stage: 'error', version: state.version, url: o.releaseUrl });
  });

  return {
    state: () => state,

    /** Looks for a newer version. Does nothing while a download runs or an update waits for the restart. */
    async check(): Promise<void> {
      if (checking || (state && state.stage !== 'available' && state.stage !== 'error')) return;
      checking = true;
      try {
        if (o.updater) {
          await o.updater.check();
        } else {
          const r = await o.checkRelease();
          if (r && acceptable(r.version)) set({ stage: 'available', version: r.version.replace(/^v/, ''), self: false, url: r.url });
        }
      } catch {
        // Quiet: see onError
      } finally {
        checking = false;
      }
    },

    /** The person said yes to the download */
    async download(): Promise<void> {
      if (!o.updater || state?.stage !== 'available' || !state.self) return;
      set({ stage: 'downloading', version: state.version, percent: 0 });
      try { await o.updater.download(); } catch { /* shown by onError */ }
    },

    /** The person said yes to the restart. Never while connected. */
    install(): void {
      if (!o.updater || (state?.stage !== 'ready' && state?.stage !== 'blocked')) return;
      if (o.isConnected()) { set({ stage: 'blocked', version: state.version }); return; }
      o.updater.quitAndInstall();
    },
  };
}
