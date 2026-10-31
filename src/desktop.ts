// Integration in die Electron-App (nur wenn window.walkflowDesktop existiert, also im Preload bereitgestellt).

import { choose } from './dialogs';
import { $, $button, $input, store } from './ui';

interface BtDevice { id: string; name: string }

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

  d.onGlobalStop(opts.onGlobalStop);
  d.onShortcutStatus(s => {
    const keys = mac ? '⌘ ⇧ Leertaste' : 'Strg + Umschalt + Leertaste';
    $('globalStopHint').textContent = s.ok
      ? `Global (auch wenn das Fenster im Hintergrund ist): ${keys} = Stop.`
      : 'Globales Stop-Kürzel nicht verfügbar (von einem anderen Programm belegt), Stop geht nur im Fenster.';
    if (!s.ok) opts.log(`⚠ Globales Kürzel ${s.accelerator} konnte nicht registriert werden`);
  });

  setupChooser(d, opts.log);
  d.onBluetoothPairing(p => void pairing(d, p));

  // Update-Hinweis (abschaltbar im Info-Bereich)
  $('infoDesktopPrivacy').hidden = false;
  const cb = $input('updateCheck');
  cb.checked = store.get(UPDATE_CHECK_KEY) !== 'off';
  cb.onchange = () => store.set(UPDATE_CHECK_KEY, cb.checked ? 'on' : 'off');
  if (cb.checked) {
    void d.checkForUpdate().then(u => {
      if (!u) return;
      $('updateText').textContent = `Walkflow ${u.version} ist verfügbar (kann Sicherheitsfixes enthalten).`;
      const btn = $button('updateAction');
      btn.textContent = 'Release-Seite öffnen';
      btn.onclick = () => void d.openExternal(u.url);
      $('updateBanner').hidden = false;
      opts.log(`Neue Version verfügbar: ${u.version}`);
    });
  }
}

/** Eigener Geräte-Chooser: Electron hat keinen eingebauten. */
function setupChooser(d: WalkflowDesktop, log: (m: string) => void) {
  let dlg: HTMLDialogElement | null = null;
  let list: HTMLUListElement | null = null;
  let autoBox: HTMLInputElement | null = null;

  const finish = (id: string, name?: string) => {
    if (id) store.set(LAST_DEVICE_KEY, JSON.stringify({ id, name }));
    d.selectBluetoothDevice(id);
    dlg?.close();
    dlg?.remove();
    dlg = null;
  };

  const last = (): BtDevice | null => {
    try { return JSON.parse(store.get(LAST_DEVICE_KEY) ?? 'null') as BtDevice | null; } catch { return null; }
  };

  d.onBluetoothDevices(devices => {
    const prev = last();
    if (store.get(AUTO_SELECT_KEY) !== 'off' && prev) {
      const hit = devices.find(x => x.id === prev.id);
      if (hit) {
        log(`Zuletzt verbundenes Gerät automatisch gewählt: ${hit.name || hit.id}`);
        finish(hit.id, hit.name);
        return;
      }
    }
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'dlg';
      const h = document.createElement('h2');
      h.textContent = 'Laufband auswählen';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Suche läuft … Die Hersteller-App muss geschlossen sein.';
      list = document.createElement('ul');
      list.className = 'chooser';
      const label = document.createElement('label');
      label.className = 'check';
      autoBox = document.createElement('input');
      autoBox.type = 'checkbox';
      autoBox.checked = store.get(AUTO_SELECT_KEY) !== 'off';
      autoBox.onchange = () => store.set(AUTO_SELECT_KEY, autoBox!.checked ? 'on' : 'off');
      label.append(autoBox, ' Nächstes Mal das gewählte Gerät automatisch verbinden');
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Abbrechen';
      cancel.onclick = () => finish('');
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(''); });
      dlg.append(h, p, list, label, cancel);
      document.body.append(dlg);
      dlg.showModal();
    }
    list!.replaceChildren(...devices.map(dev => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = dev.name || `(ohne Namen) ${dev.id}`;
      if (prev?.id === dev.id) b.textContent += ' · zuletzt verbunden';
      b.onclick = () => finish(dev.id, dev.name);
      li.append(b);
      return li;
    }));
  });
}

async function pairing(d: WalkflowDesktop, p: { kind: string; pin: string | null }) {
  if (p.kind === 'providePin') {
    const pin = await askPin();
    d.respondPairing(pin === null ? { confirmed: false } : { confirmed: true, pin });
    return;
  }
  const r = await choose({
    title: 'Gerät koppeln?',
    paragraphs: p.kind === 'confirmPin' && p.pin ? [`Stimmt diese PIN mit der am Gerät überein? ${p.pin}`] : ['Das Gerät möchte gekoppelt werden.'],
    buttons: [{ id: 'yes', label: 'Koppeln', kind: 'primary' }, { id: 'no', label: 'Abbrechen' }],
    cancelId: 'no',
  });
  d.respondPairing({ confirmed: r === 'yes' });
}

function askPin(): Promise<string | null> {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    const h = document.createElement('h2');
    h.textContent = 'PIN für das Koppeln';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    const row = document.createElement('div');
    row.className = 'row';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'primary';
    ok.textContent = 'Koppeln';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Abbrechen';
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
