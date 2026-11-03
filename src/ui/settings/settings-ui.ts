// The settings dialog: one large modal with sections (general, safety, data, info). The fields in it keep the ids they had
// as cards in the page, so the code that reads and writes them (limit, backup, export …) does not depend on where
// they sit. This file only opens and closes it, switches sections, and holds quiet mode and developer mode.
// Locked while the belt runs: the limit, the ramp and the other safety values are not changed in the middle of a run.

import { confirmDialog } from '../components/dialogs';
import { t } from '../../i18n/i18n';
import { DEV_MODE_STORAGE_KEY, readDevMode } from '../../core/safety/dev-mode';
import { QUIET_STORAGE_KEY, readQuiet } from '../../core/safety/quiet';
import { $, $button, $input } from '../ui';
import { store } from '../store';

export type SettingsTab = 'general' | 'safety' | 'data' | 'info';
const TABS: readonly SettingsTab[] = ['general', 'safety', 'data', 'info'];

export function setupSettings() {
  const dlg = $<HTMLDialogElement>('settingsDlg');
  const button = $button('settingsBtn');
  const tabs = new Map(TABS.map(name => [name, $button(`tab-${name}`)] as const));
  const panels = new Map(TABS.map(name => [name, $(`sd-${name}`)] as const));
  const quietSwitch = $input('quietSwitch');
  const devSwitch = $input('devSwitch');
  let locked = false;
  let devMode = readDevMode(store.get(DEV_MODE_STORAGE_KEY));
  const devListeners: ((on: boolean) => void)[] = [];
  let quiet = readQuiet(store.get(QUIET_STORAGE_KEY));

  function showTab(name: SettingsTab, focus = false) {
    for (const [n, b] of tabs) {
      b.setAttribute('aria-selected', String(n === name));
      b.tabIndex = n === name ? 0 : -1;
      panels.get(n)!.hidden = n !== name;
    }
    if (focus) tabs.get(name)!.focus();
  }

  function applyQuiet() {
    quietSwitch.checked = quiet;
    // style.css hides the safety notice for it
    document.documentElement.dataset.quiet = quiet ? '1' : '0';
  }

  function applyDevMode() {
    devSwitch.checked = devMode;
    // style.css shows the experiment console for it
    document.documentElement.dataset.dev = devMode ? '1' : '0';
    for (const cb of devListeners) cb(devMode);
  }

  function renderLock() {
    button.disabled = locked;
    $('settingsAnchor').title = locked ? t.settings.lockedHint : '';
  }

  function open(tab: SettingsTab = 'general') {
    if (locked || dlg.open) return;
    showTab(tab);
    dlg.showModal();
  }

  for (const [name, b] of tabs) {
    b.onclick = () => showTab(name);
    b.onkeydown = e => {
      const i = TABS.indexOf(name);
      const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? TABS[(i + 1) % TABS.length]
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? TABS[(i + TABS.length - 1) % TABS.length]
        : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS.at(-1) : undefined;
      if (next) { e.preventDefault(); showTab(next, true); }
    };
  }
  button.onclick = () => open();
  $button('settingsClose').onclick = () => dlg.close();
  // A click on the backdrop (the dialog element itself; its content fills it)
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  quietSwitch.onchange = async () => {
    if (!quietSwitch.checked) { quiet = false; store.set(QUIET_STORAGE_KEY, '0'); applyQuiet(); return; }
    // Switching it on is asked for first; "off" needs no question
    quietSwitch.checked = false;
    const ok = await confirmDialog(t.settings.quietConfirmTitle, t.settings.quietConfirm, t.settings.quietConfirmOk, 'stop');
    quiet = ok;
    if (ok) store.set(QUIET_STORAGE_KEY, '1');
    applyQuiet();
  };

  devSwitch.onchange = async () => {
    if (!devSwitch.checked) { devMode = false; store.set(DEV_MODE_STORAGE_KEY, '0'); applyDevMode(); return; }
    // Switching it on is asked for first; "off" needs no question
    devSwitch.checked = false;
    const ok = await confirmDialog(t.settings.devConfirmTitle, t.settings.devConfirm, t.settings.devConfirmOk, 'stop');
    devMode = ok;
    if (ok) store.set(DEV_MODE_STORAGE_KEY, '1');
    applyDevMode();
  };

  showTab('general');
  applyQuiet();
  applyDevMode();
  renderLock();

  return {
    open,
    /** The belt runs (or may run): the dialog is locked, and closed if it was open */
    setLocked(on: boolean) {
      if (on === locked) return;
      locked = on;
      renderLock();
    },
    /** Quiet mode: no safety notice, no question before a start */
    get quiet() { return quiet; },
    /** Developer mode: the experiment console, the developer tools of the desktop app. Called now and at every change. */
    onDevMode(cb: (on: boolean) => void) { devListeners.push(cb); cb(devMode); },
    relabel: renderLock,
  };
}
