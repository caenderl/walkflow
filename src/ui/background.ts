// The page in the background or on its way out: the screen stays on while connected (the wake lock), a belt that may be
// running is warned about or paused when the tab is hidden (the person's choice in the settings), a run is saved, and
// leaving the page while the belt may run asks first.
// Display and bookkeeping only: it pauses through the host, it sends nothing itself.

import { t, type Text } from '../i18n/i18n';
import { bindText } from './i18n-dom';
import { APP_NAME } from '../platform/config';
import { $, log } from './ui';
import { store } from './store';

const HIDDEN_MODE_KEY = 'walkflow.hiddenMode';

export interface BackgroundHost {
  connected(): boolean;
  /** The belt may be running (when in doubt it is) */
  maybeRunning(): boolean;
  /** Pause the belt; the reason is shown as the program's end */
  pause(reason: Text): Promise<boolean>;
  /** The program runner has to look at the clock (timers are throttled while hidden) */
  tick(): void;
  /** Save the run now */
  flush(): void;
}

export function setupBackground(host: BackgroundHost) {
  let wakeLock: WakeLockSentinel | null = null;
  let hiddenSince: number | null = null;
  let hiddenWhileRunning: 'warned' | 'paused' | null = null;

  const mode = $<HTMLSelectElement>('hiddenMode');
  const saved = store.get(HIDDEN_MODE_KEY);
  if (saved === 'warn' || saved === 'pause') mode.value = saved;
  mode.onchange = () => store.set(HIDDEN_MODE_KEY, mode.value);

  async function acquireWakeLock() {
    if (wakeLock && !wakeLock.released) return;
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the Wake Lock API is missing in Firefox and older Safari
    try { wakeLock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { wakeLock = null; }
  }

  function releaseWakeLock() {
    try { void wakeLock?.release(); } catch { /* ignore */ }
    wakeLock = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (host.connected() && host.maybeRunning()) {
        hiddenSince = Date.now();
        document.title = t.hidden.title;
        if (mode.value === 'pause') {
          hiddenWhileRunning = 'paused';
          log(t.hidden.pausingLog);
          void host.pause(() => t.hidden.pausedReason);
        } else {
          hiddenWhileRunning = 'warned';
          log(t.hidden.warnLog);
        }
      }
      // After the pause command has been queued, not before
      host.flush();
      return;
    }
    document.title = APP_NAME;
    host.tick();
    if (host.connected()) void acquireWakeLock(); // the browser releases the wake lock when the tab is hidden
    if (hiddenSince !== null && hiddenWhileRunning) {
      const s = Math.round((Date.now() - hiddenSince) / 1000);
      const how = hiddenWhileRunning;
      bindText($('hiddenText'), () => how === 'paused' ? t.hidden.paused(s) : t.hidden.warned(s));
      $('hiddenBanner').hidden = false;
    }
    hiddenSince = null;
    hiddenWhileRunning = null;
  });

  window.addEventListener('pagehide', () => host.flush());
  window.addEventListener('beforeunload', e => {
    if (host.connected() && host.maybeRunning()) e.preventDefault();
  });

  return {
    acquireWakeLock,
    releaseWakeLock,
    /** After a language change: the tab title while hidden */
    relabel() {
      if (document.hidden && hiddenSince !== null) document.title = t.hidden.title;
    },
  };
}
