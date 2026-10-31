// Service Worker (nur Web-Build): offline nutzbar, installierbar, und ein Hinweis bei neuer Version.
// Neu laden trennt die Bluetooth-Verbindung, deshalb nie automatisch und nie, solange verbunden.

import { registerSW } from 'virtual:pwa-register';
import { BUILD_TARGET } from './config';
import { $, $button, log } from './ui';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function setupPwa(isConnected: () => boolean) {
  if (BUILD_TARGET !== 'web' || import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      $('updateText').textContent = 'Eine neue Version ist da (kann Sicherheitsfixes enthalten).';
      const btn = $button('updateAction');
      btn.textContent = 'Neu laden';
      btn.onclick = () => {
        if (isConnected()) {
          log('Neu laden geht erst nach dem Trennen: Neu laden würde die Bluetooth-Verbindung kappen, das Band liefe dann ohne App weiter.');
          $('updateText').textContent = 'Neue Version: erst Band stoppen und trennen, dann neu laden.';
          return;
        }
        void updateSW(true);
      };
      $('updateBanner').hidden = false;
    },
    onOfflineReady() {
      log('App ist jetzt offline verfügbar');
    },
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => { void registration.update(); }, UPDATE_CHECK_MS);
    },
  });
}
