// Integration with the Electron app (only if window.walkflowDesktop exists, i.e. provided by the preload).

import { type BtDevice, chooserList } from './bt-devices';
import { choose } from './dialogs';
import { lang, onLanguageChange, t } from './i18n';
import { bindText } from './i18n-dom';
import { currentTheme, onThemeChange } from './theme';
import { $, $button, $input, store } from './ui';


export interface WalkflowDesktop {
  platform: string;
  connectionChanged(connected: boolean): void;
  onGlobalStop(cb: () => void): void;
  onShortcutStatus(cb: (s: { accelerator: string; ok: boolean }) => void): void;
  onBluetoothDevices(cb: (devices: BtDevice[]) => void): void;
  selectBluetoothDevice(id: string): void;
  onBluetoothPairing(cb: (d: { kind: string; pin: string | null }) => void): void;
  respondPairing(r: { confirmed: boolean; pin?: string }): void;
  checkForUpdate(): Promise<{ version: string; url: string } | null>;
  openExternal(url: string): Promise<void>;
  /** Language for menus and dialogs of the main process */
  setLanguage(lang: string): void;
  /** 'system' | 'dark' | 'light' for native dialogs, title bar and window background */
  setTheme(theme: string): void;
}

declare global {
  interface Window { walkflowDesktop?: WalkflowDesktop }
}

export const desktop: WalkflowDesktop | undefined = window.walkflowDesktop;

const LAST_DEVICE_KEY = 'walkflow.lastBtDevice';
const AUTO_SELECT_KEY = 'walkflow.autoSelectLastDevice';
const UPDATE_CHECK_KEY = 'walkflow.updateCheck';

export function setupDesktop(opts: { onGlobalStop: () => void; log: (m: string) => void }) {
  const d = desktop;
  if (!d) return;
  const mac = d.platform === 'darwin';

  d.setLanguage(lang);
  onLanguageChange(l => d.setLanguage(l));
  d.setTheme(currentTheme());
  onThemeChange(c => d.setTheme(c));

  d.onGlobalStop(opts.onGlobalStop);
  d.onShortcutStatus(s => {
    bindText($('globalStopHint'), () => s.ok
      ? t.desktop.shortcutOk(mac ? t.desktop.keysMac : t.desktop.keysOther)
      : t.desktop.shortcutUnavailable);
    if (!s.ok) opts.log(t.desktop.shortcutFailedLog(s.accelerator));
  });

  setupChooser(d, opts.log);
  d.onBluetoothPairing(p => void pairing(d, p));

  // Update notice (can be turned off in the info section)
  $('infoDesktopPrivacy').hidden = false;
  const cb = $input('updateCheck');
  cb.checked = store.get(UPDATE_CHECK_KEY) !== 'off';
  cb.onchange = () => store.set(UPDATE_CHECK_KEY, cb.checked ? 'on' : 'off');
  if (cb.checked) {
    void d.checkForUpdate().then(u => {
      if (!u) return;
      bindText($('updateText'), () => t.desktop.updateAvailable(u.version));
      const btn = $button('updateAction');
      bindText(btn, () => t.desktop.openRelease);
      btn.onclick = () => void d.openExternal(u.url);
      $('updateBanner').hidden = false;
      opts.log(t.desktop.updateLog(u.version));
    });
  }
}

/** Own device chooser: Electron has none built in. */
function setupChooser(d: WalkflowDesktop, log: (m: string) => void) {
  let dlg: HTMLDialogElement | null = null;
  let list: HTMLUListElement | null = null;
  let autoBox: HTMLInputElement | null = null;
  let more: HTMLButtonElement | null = null;
  let devices: BtDevice[] = [];
  let showAll = false;

  const finish = (id: string, name?: string) => {
    if (id) store.set(LAST_DEVICE_KEY, JSON.stringify({ id, name }));
    d.selectBluetoothDevice(id);
    dlg?.close();
    dlg?.remove();
    dlg = null;
    showAll = false;
  };

  const last = (): BtDevice | null => {
    try { return JSON.parse(store.get(LAST_DEVICE_KEY) ?? 'null') as BtDevice | null; } catch { return null; }
  };

  const render = () => {
    if (!list || !more) return;
    const prev = last();
    const { shown, hidden } = chooserList(devices, prev?.id ?? null, showAll);
    list.replaceChildren(...shown.map(dev => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = dev.name || t.desktop.unnamed(dev.id);
      if (prev?.id === dev.id) b.textContent += t.desktop.lastConnected;
      b.onclick = () => finish(dev.id, dev.name);
      li.append(b);
      return li;
    }));
    more.hidden = hidden === 0;
    more.textContent = showAll ? t.desktop.hideUnnamed : t.desktop.showUnnamed(hidden);
  };

  d.onBluetoothDevices(found => {
    devices = found;
    const prev = last();
    if (store.get(AUTO_SELECT_KEY) !== 'off' && prev) {
      const hit = devices.find(x => x.id === prev.id);
      if (hit) {
        log(t.desktop.autoSelected(hit.name || hit.id));
        finish(hit.id, hit.name);
        return;
      }
    }
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'dlg';
      const h = document.createElement('h2');
      h.textContent = t.desktop.chooserTitle;
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t.desktop.chooserSearching;
      list = document.createElement('ul');
      list.className = 'chooser';
      const label = document.createElement('label');
      label.className = 'check';
      autoBox = document.createElement('input');
      autoBox.type = 'checkbox';
      autoBox.checked = store.get(AUTO_SELECT_KEY) !== 'off';
      autoBox.onchange = () => store.set(AUTO_SELECT_KEY, autoBox!.checked ? 'on' : 'off');
      label.append(autoBox, ` ${t.desktop.chooserAuto}`);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = t.common.cancel;
      cancel.onclick = () => finish('');
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(''); });
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'link';
      more.onclick = () => { showAll = !showAll; render(); };
      dlg.append(h, p, list, more, label, cancel);
      document.body.append(dlg);
      dlg.showModal();
    }
    render();
  });
}

async function pairing(d: WalkflowDesktop, p: { kind: string; pin: string | null }) {
  if (p.kind === 'providePin') {
    const pin = await askPin();
    d.respondPairing(pin === null ? { confirmed: false } : { confirmed: true, pin });
    return;
  }
  const r = await choose({
    title: t.desktop.pairTitle,
    paragraphs: [p.kind === 'confirmPin' && p.pin ? t.desktop.pairConfirmPin(p.pin) : t.desktop.pairRequest],
    buttons: [{ id: 'yes', label: t.desktop.pair, kind: 'primary' }, { id: 'no', label: t.common.cancel }],
    cancelId: 'no',
  });
  d.respondPairing({ confirmed: r === 'yes' });
}

function askPin(): Promise<string | null> {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    const h = document.createElement('h2');
    h.textContent = t.desktop.pinTitle;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    const row = document.createElement('div');
    row.className = 'row';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = t.desktop.pair;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t.common.cancel;
    const done = (v: string | null) => { dlg.close(); dlg.remove(); resolve(v); };
    ok.onclick = () => done(input.value.trim() || null);
    cancel.onclick = () => done(null);
    dlg.addEventListener('cancel', e => { e.preventDefault(); done(null); });
    row.append(ok, cancel);
    dlg.append(h, input, row);
    document.body.append(dlg);
    dlg.showModal();
    input.focus();
  });
}
