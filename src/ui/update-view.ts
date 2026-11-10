// What the update banner of the desktop app says and offers in each state of the update (platform/update-controller.ts).

import type { UpdateState } from '../platform/update-controller';
import { t, type Text } from '../i18n/i18n';

/** `action`: what the button does ('download' = download and install, 'install' = restart, 'open' = the release page); null: no button */
export interface UpdateView { text: Text; label: Text; action: 'download' | 'install' | 'open' | null }

export function updateView(s: UpdateState): UpdateView {
  switch (s.stage) {
    case 'available':
      return s.self
        ? { text: () => t.desktop.updateAvailable(s.version), label: () => t.desktop.updateDownload, action: 'download' }
        : { text: () => t.desktop.updateAvailable(s.version), label: () => t.desktop.openRelease, action: 'open' };
    case 'downloading':
      return { text: () => t.desktop.updateDownloading(s.version, s.percent), label: () => '', action: null };
    case 'ready':
      return { text: () => t.desktop.updateReady(s.version), label: () => t.desktop.updateRestart, action: 'install' };
    case 'blocked':
      return { text: () => t.desktop.updateBlocked, label: () => t.desktop.updateRestart, action: 'install' };
    case 'error':
      return { text: () => t.desktop.updateFailed, label: () => t.desktop.openRelease, action: 'open' };
  }
}
