// The install button in Settings → Info (web build only). Chrome and Edge fire beforeinstallprompt when the page can be
// installed as an app; it is kept here and prompt() is called only when the person presses the button, which opens the
// browser's own dialog. Elsewhere the section says how to install it from the browser's menu. Display only.

import { installState } from '../platform/install';
import { BUILD_TARGET } from '../platform/config';
import { t } from '../i18n/i18n';
import { bindText } from './i18n-dom';
import { $, $button, log } from './ui';

/** Chromium only, not in the DOM types */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function setupInstall() {
  const box = $('infoInstall');
  const button = $button('installBtn');
  let prompt: InstallPromptEvent | null = null;
  let installed = false;
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- matchMedia is missing outside a browser (tests, old WebViews)
  const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches;

  function render() {
    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- standalone() is undefined without matchMedia, see above
    const state = installState({ web: BUILD_TARGET === 'web', standalone: !!standalone(), installed, promptReady: prompt !== null });
    box.hidden = state === 'none';
    button.hidden = state !== 'offer';
    bindText($('installText'), () => (state === 'installed' ? t.info.installInstalled : state === 'offer' ? t.info.installText : t.info.installManual));
  }

  if (BUILD_TARGET === 'web') {
    // Kept, not prevented: on Android the browser may still show its own hint as well
    window.addEventListener('beforeinstallprompt', e => { prompt = e as InstallPromptEvent; render(); });
    window.addEventListener('appinstalled', () => { installed = true; prompt = null; log(t.info.installDoneLog); render(); });
    button.onclick = async () => {
      const p = prompt;
      if (!p) return;
      // A prompt can be used once; the browser fires a new event if it may be offered again
      prompt = null;
      try { await p.prompt(); } catch { /* the browser decided not to show it */ }
      render();
    };
  }
  render();
}
