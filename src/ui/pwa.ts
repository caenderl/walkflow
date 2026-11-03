// Service worker (web build only): usable offline, installable, and a notice when a new version is available.
// Reloading cuts the Bluetooth connection, so it never happens automatically and never while connected.

import { registerSW } from 'virtual:pwa-register';
import { BUILD_TARGET } from '../platform/config';
import { t } from '../i18n/i18n';
import { bindText } from './i18n-dom';
import { $, $button, log } from './ui';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function setupPwa(isConnected: () => boolean) {
  if (BUILD_TARGET !== 'web' || import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      bindText($('updateText'), () => t.pwa.update);
      const btn = $button('updateAction');
      bindText(btn, () => t.pwa.reload);
      btn.onclick = () => {
        if (isConnected()) {
          log(t.pwa.reloadBlockedLog);
          bindText($('updateText'), () => t.pwa.reloadBlocked);
          return;
        }
        void updateSW(true);
      };
      $('updateBanner').hidden = false;
    },
    onOfflineReady() {
      log(t.pwa.offlineReady);
    },
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => { void registration.update(); }, UPDATE_CHECK_MS);
    },
  });
}
