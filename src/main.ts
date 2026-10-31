import './style.css';
import { TreadmillClient, WebBluetoothAdapter, type BleAdapter, type TreadmillEvents } from './ble';
import { bluetoothSupportHint } from './browser';
import { drawChart } from './chart';
import { APP_NAME, APP_VERSION } from './config';
import { choose, confirmDialog } from './dialogs';
import { exportFilename, toCsv, type Sample } from './export';
import {
  cmdPause, cmdRequestControl, cmdSetInclination, cmdSetSpeed, cmdStart, cmdStop, describeMachineStatus, hex,
  OP, parseMachineStatus, parseTrainingStatus, type TreadmillData,
} from './ftms';
import { fmtTime, parseProgram, ProgramRunner, totalSeconds } from './program';
import {
  beltMaybeRunning, checkConsoleCommand, decideLimitChange, DISCLAIMER_STORAGE_KEY, DISCLAIMER_VERSION,
  effectiveMax as calcEffectiveMax, isDisclaimerAccepted, LEGACY_LIMIT_KEY, LIMIT_CONFIRM_ABOVE, LIMIT_STORAGE_KEY,
  loadLimit, MAX_STEP_STORAGE_KEY, parseHexBytes, parseMaxStep, RAMP_INTERVAL_MS, serializeLimit, SpeedGovernor,
  StandstillDetector,
} from './safety';
import { SimulatorAdapter } from './sim';
import { DISCLAIMER_POINTS, DISCLAIMER_TITLE, NOT_AFFILIATED, TESTED_FEATURES, TESTED_WITH, UNTESTED_FEATURES } from './texts';
import { $, $button, $input, download, log, store } from './ui';

const HIDDEN_MODE_KEY = 'walkflow.hiddenMode';
const now = () => performance.now();

// ---------- State ----------
const webAdapter = new WebBluetoothAdapter();
let sim: SimulatorAdapter | null = null;
let client: TreadmillClient | null = null;
let devMin = 1.0, devMax = 12.0;
let limit = 6;
let wakeLock: WakeLockSentinel | null = null;
/** Per App oder laut Machine Status gestartet und seitdem nicht gestoppt */
let beltStarted = false;
let lastMeasured: number | undefined;
let controlLost = false;
let hiddenSince: number | null = null;
let hiddenWhileRunning: 'warned' | 'paused' | null = null;
let sliderDragging = false;
const cur: Omit<Sample, 'ts'> = {};   // letzte Messwerte
const samples: Sample[] = [];          // Verlauf (1 Hz)
let lastSample = 0;

const connected = () => !!client?.connected;
const maybeRunning = () => beltMaybeRunning({ startedByApp: beltStarted, lastMeasuredKmh: lastMeasured });

const governor = new SpeedGovernor({
  send: kmh => client ? client.send(cmdSetSpeed(kmh)) : Promise.resolve(false),
  now,
  log,
  onChange: renderSpeed,
});

const standstill = new StandstillDetector();

const runner = new ProgramRunner({
  start: doStart,
  stop: () => doStop(),
  setTarget: kmh => { governor.request(kmh); standstill.arm(); },
  currentTarget: () => governor.target,
  status: t => { $('progStatus').textContent = t; },
  log,
});

const events: TreadmillEvents = {
  log,
  data: onTreadmillData,
  heartRate: bpm => { if (bpm > 0) { cur.hr = bpm; $('vHr').textContent = String(bpm); } },
  machineStatus: onMachineStatus,
  trainingStatus: dv => {
    const t = parseTrainingStatus(dv);
    log(`ℹ Training ${hex(dv)}${t ? ` (${t.text})` : ''}`);
  },
  disconnected: onDisconnected,
};

// ---------- Live-Daten ----------
function onTreadmillData(r: TreadmillData) {
  if (r.speed !== undefined) { cur.speed = r.speed; $('vSpeed').textContent = r.speed.toFixed(1); }
  if (r.dist !== undefined) { cur.dist = r.dist; $('vDist').textContent = (r.dist / 1000).toFixed(2); }
  if (r.incl !== undefined) { cur.incl = r.incl; $('vIncl').textContent = r.incl.toFixed(1); }
  if (r.kcal !== undefined) { cur.kcal = r.kcal; $('vKcal').textContent = String(r.kcal); }
  if (r.time !== undefined) { cur.time = r.time; $('vTime').textContent = fmtTime(r.time); }
  if (r.hr !== undefined && r.hr > 0) { cur.hr = r.hr; $('vHr').textContent = String(r.hr); }

  if (r.speed !== undefined) {
    lastMeasured = r.speed;
    governor.noteMeasured(r.speed);
    if (standstill.feed(r.speed, now()) && runner.active) {
      log('⚠ Band meldet seit 8 s 0 km/h, Programm wird beendet');
      runner.abort('Band steht, Programm beendet');
      governor.reset();
    }
  }
  // Notifications kommen auch in gedrosselten Hintergrund-Tabs an
  runner.tick();

  const t = Date.now();
  if (t - lastSample >= 1000) {
    lastSample = t;
    samples.push({ ts: t, ...cur });
    if (samples.length > 20000) samples.shift();
    redrawChart();
  }
}

function onMachineStatus(dv: DataView) {
  const e = parseMachineStatus(dv);
  log(`ℹ Status ${hex(dv)}${e ? ` (${describeMachineStatus(e)})` : ''}`);
  if (!e) return;
  switch (e.kind) {
    case 'stopped':
    case 'paused':
    case 'safety-key':
      beltStarted = false;
      if (runner.active) runner.abort(`Programm beendet: ${describeMachineStatus(e)}`);
      governor.reset();
      standstill.disarm();
      break;
    case 'started':
      beltStarted = true;
      break;
    case 'control-lost':
      controlLost = true;
      log('⚠ Steuerrecht verloren. Stop schickt deshalb vorher Request Control.');
      break;
    default:
      break;
  }
}

function redrawChart() {
  drawChart($<HTMLCanvasElement>('chart'), samples, { now: Date.now(), limit: effectiveMax(), target: governor.target ?? 0 });
}

// ---------- Speed & Steigung ----------
function effectiveMax() { return calcEffectiveMax(devMax, limit); }

function applyLimits() {
  const sl = $input('slider');
  sl.min = String(devMin); sl.max = String(effectiveMax());
  if (parseFloat(sl.value) > parseFloat(sl.max)) sl.value = sl.max;
  if (parseFloat(sl.value) < parseFloat(sl.min)) sl.value = sl.min;
  $('rangeInfo').textContent = `Geräte-Range: ${devMin.toFixed(1)} – ${devMax.toFixed(1)} km/h, aktives Limit: ${effectiveMax().toFixed(1)}. `
    + `Rampe: höchstens ${governor.maxStep.toFixed(1)} km/h pro Befehl, mindestens ${RAMP_INTERVAL_MS / 1000} s Abstand.`;
  const before = governor.target;
  governor.setRange({ min: devMin, max: effectiveMax() });
  if (connected() && governor.target !== before && governor.target !== null) log(`Limit gesenkt, regle auf ${governor.target.toFixed(1)} km/h`);
  renderSpeed();
}

function renderSpeed() {
  const sl = $input('slider');
  const t = governor.target;
  if (t !== null && !sliderDragging) sl.value = String(t);
  const shown = t ?? parseFloat(sl.value);
  $('target').textContent = `${shown.toFixed(1)} km/h`;
  const lc = governor.lastCommand;
  $('rampInfo').textContent = governor.ramping && t !== null && lc && lc.kmh !== t
    ? `Rampe läuft: ${lc.kmh.toFixed(1)} → ${t.toFixed(1)} km/h`
    : ' ';
}

function requestSpeed(kmh: number) {
  if (!connected() || !Number.isFinite(kmh)) return;
  governor.request(kmh);
  renderSpeed();
}

function stepSpeed(delta: number) {
  requestSpeed((governor.target ?? governor.base()) + delta);
}

function setIncline(pct: number) {
  if (!client) return Promise.resolve(false);
  $input('inclSlider').value = String(pct);
  $('inclTarget').textContent = `${pct.toFixed(1)} %`;
  return client.send(cmdSetInclination(pct));
}

// ---------- Start / Stop / Programm ----------
async function doStop(reason = 'Gestoppt'): Promise<boolean> {
  runner.abort(reason);
  governor.reset();
  standstill.disarm();
  const c = client;
  if (!c) return false;
  let ok: boolean;
  if (controlLost) {
    void c.send(cmdRequestControl(), { urgent: true });
    ok = await c.send(cmdStop());
  } else {
    ok = await c.send(cmdStop(), { urgent: true });
  }
  if (ok) beltStarted = false;
  return ok;
}

async function doPause(reason = 'Pausiert, Programm beendet'): Promise<boolean> {
  runner.abort(reason);
  governor.reset();
  standstill.disarm();
  const c = client;
  if (!c) return false;
  const ok = await c.send(cmdPause(), { urgent: true });
  if (ok) beltStarted = false;
  return ok;
}

async function doStart(): Promise<boolean> {
  const c = client;
  if (!c) return false;
  governor.reset();
  standstill.disarm();
  const a = await c.send(cmdRequestControl());
  if (a) controlLost = false;
  const b = await c.send(cmdStart());
  if (b) beltStarted = true;
  return a && b;
}

function confirmStart(intro?: string): Promise<boolean> {
  return confirmDialog('Band starten?', [
    ...(intro ? [intro] : []),
    'Stehst du auf den Seitenflächen und nicht auf dem Band?',
    'Ist der Sicherheitsschlüssel eingesteckt und an deiner Kleidung befestigt?',
  ], 'Ja, starten');
}

async function runProgram() {
  const steps = parseProgram($input('progText').value);
  if (!steps.length) { $('progStatus').textContent = 'Programm leer oder nicht lesbar'; return; }
  const max = effectiveMax();
  const capped = steps.some(s => s.speed > max) ? ` Schritte über ${max.toFixed(1)} km/h werden auf das Limit gekappt.` : '';
  if (!(await confirmStart(`Programm mit ${steps.length} Schritten (${fmtTime(totalSeconds(steps))} min) starten?${capped}`))) return;
  if (!connected()) return;
  await runner.run(steps);
  standstill.disarm();
}

// ---------- CSV ----------
function exportCsv() {
  if (!samples.length) { log('Keine Daten zum Exportieren'); return; }
  download(toCsv(samples), 'text/csv', exportFilename(new Date(), 'csv'));
}

// ---------- Erststart ----------
async function ensureDisclaimer(): Promise<boolean> {
  if (isDisclaimerAccepted(store.get(DISCLAIMER_STORAGE_KEY))) return true;
  const r = await choose({
    title: DISCLAIMER_TITLE,
    list: DISCLAIMER_POINTS,
    requireCheckbox: 'Gelesen. Ich nutze die App auf eigene Gefahr.',
    buttons: [{ id: 'ok', label: 'Verstanden', kind: 'primary' }, { id: 'later', label: 'Später' }],
    cancelId: 'later',
  });
  if (r !== 'ok') return false;
  store.set(DISCLAIMER_STORAGE_KEY, String(DISCLAIMER_VERSION));
  return true;
}

// ---------- Verbinden ----------
async function connect(kind: 'ble' | 'demo') {
  if (connected() || !(await ensureDisclaimer())) return;
  $button('connect').disabled = true;
  $button('demo').disabled = true;
  try {
    $('status').textContent = kind === 'demo' ? 'Demo verbindet…' : 'Suche…';
    let adapter: BleAdapter = webAdapter;
    if (kind === 'demo') adapter = sim ??= new SimulatorAdapter({ version: APP_VERSION });
    const c = new TreadmillClient(adapter, events);
    client = c;
    devMin = 1.0; devMax = 12.0;
    resetIncline();
    const info = await c.connect();

    if (info.speedRange) { devMin = info.speedRange.min; devMax = info.speedRange.max; }
    if (info.inclRange) {
      const { min: mn, max: mx, step: st } = info.inclRange;
      const sl = $input('inclSlider');
      sl.min = String(mn); sl.max = String(mx); sl.step = String(st || 0.5); sl.value = String(Math.max(mn, 0));
      $('inclTarget').textContent = `${parseFloat(sl.value).toFixed(1)} %`;
      $('inclInfo').textContent = `Range: ${mn} – ${mx} % (Step ${st})`;
    }

    beltStarted = false; lastMeasured = undefined; controlLost = false;
    governor.reset();
    await acquireWakeLock();
    applyLimits();
    setUi(true);
    $('alarm').hidden = true;
    $('demoBanner').hidden = kind !== 'demo';
    $('status').textContent = `${kind === 'demo' ? 'Demo verbunden' : 'Verbunden'}: ${info.deviceName ?? 'Laufband'}`;
    await c.send(cmdRequestControl());
  } catch (e) {
    log(`❌ ${e instanceof Error ? e.message : String(e)}`);
    if (!connected()) {
      client = null;
      $('status').textContent = 'Nicht verbunden';
      setUi(false);
    }
  }
}

function resetIncline() {
  const sl = $input('inclSlider');
  sl.min = '0'; sl.max = '15'; sl.step = '1'; sl.value = '0';
  $('inclTarget').textContent = '0.0 %';
  $('inclInfo').textContent = 'Range: unbekannt. Ob das Band die Steigung per FTMS annimmt, sagt dir das Log (Set Inclination: OK oder nicht unterstützt).';
}

function onDisconnected() {
  const wasRunning = maybeRunning();
  log('Verbindung getrennt');
  runner.abort('Verbindung getrennt, Programm beendet');
  governor.reset();
  standstill.disarm();
  releaseWakeLock();
  client = null;
  beltStarted = false; lastMeasured = undefined; controlLost = false;
  $('status').textContent = 'Nicht verbunden';
  $('vSpeed').textContent = '–'; // unbekannt, nicht den letzten Wert stehen lassen
  $('demoBanner').hidden = true;
  setUi(false);
  if (wasRunning) {
    $('alarm').hidden = false;
    $('alarm').scrollIntoView({ block: 'start' });
    log('⚠ Verbindung verloren, während das Band (vermutlich) lief. Die App kann es nicht mehr stoppen.');
  }
}

async function disconnectClicked() {
  if (!client) return;
  if (maybeRunning()) {
    const choice = await choose({
      title: 'Das Band läuft noch',
      paragraphs: ['Nach dem Trennen kann die App das Band nicht mehr stoppen.'],
      buttons: [
        { id: 'stop', label: 'Erst stoppen, dann trennen', kind: 'primary' },
        { id: 'force', label: 'Trotzdem trennen' },
        { id: 'cancel', label: 'Abbrechen' },
      ],
      cancelId: 'cancel',
    });
    if (choice === 'cancel') return;
    if (choice === 'stop') {
      const ok = await doStop('Gestoppt (vor dem Trennen)');
      if (!(ok && await waitUntil(() => !maybeRunning(), 10_000))) {
        const force = await confirmDialog('Band meldet noch Bewegung', [
          `Letzter Messwert: ${lastMeasured?.toFixed(1) ?? '?'} km/h. Nach dem Trennen kann die App das Band nicht mehr stoppen.`,
        ], 'Trotzdem trennen');
        if (!force) return;
      }
    }
  }
  client?.disconnect();
}

function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const t0 = now();
    const check = () => {
      if (cond()) resolve(true);
      else if (now() - t0 >= timeoutMs || !connected()) resolve(false);
      else setTimeout(check, 200);
    };
    check();
  });
}

function setUi(isConnected: boolean) {
  $button('connect').disabled = isConnected || !$('unsupported').hidden;
  $button('demo').disabled = isConnected;
  $button('disconnect').disabled = !isConnected;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.needs-conn').forEach(el => { el.disabled = !isConnected; });
}

// ---------- Wake Lock & Hintergrund ----------
async function acquireWakeLock() {
  if (wakeLock && !wakeLock.released) return;
  try { wakeLock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { wakeLock = null; }
}

function releaseWakeLock() {
  try { void wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!connected() || !maybeRunning()) return;
    hiddenSince = Date.now();
    document.title = `⚠ Band läuft – ${APP_NAME}`;
    if ($<HTMLSelectElement>('hiddenMode').value === 'pause') {
      hiddenWhileRunning = 'paused';
      log('Tab im Hintergrund: Band wird pausiert');
      void doPause('Tab im Hintergrund: Band pausiert, Programm beendet');
    } else {
      hiddenWhileRunning = 'warned';
      log('⚠ Tab im Hintergrund, das Band läuft weiter');
    }
    return;
  }
  document.title = APP_NAME;
  runner.tick();
  if (connected()) void acquireWakeLock(); // der Browser gibt den Wake Lock beim Verstecken frei
  if (hiddenSince !== null && hiddenWhileRunning) {
    const s = Math.round((Date.now() - hiddenSince) / 1000);
    $('hiddenText').textContent = hiddenWhileRunning === 'paused'
      ? `Der Tab war ${s} s im Hintergrund, das Band wurde deshalb pausiert.`
      : `Der Tab war ${s} s im Hintergrund, das Band lief weiter. Browser drosseln Timer in Hintergrund-Tabs, Programmwechsel können sich verzögert haben.`;
    $('hiddenBanner').hidden = false;
  }
  hiddenSince = null;
  hiddenWhileRunning = null;
});

window.addEventListener('beforeunload', e => {
  if (connected() && maybeRunning()) e.preventDefault();
});

// ---------- Konsole ----------
async function rawSend() {
  const c = client;
  if (!c) return;
  const bytes = parseHexBytes($input('raw').value);
  if (!bytes) { log('❌ Ungültige Hex-Bytes'); return; }
  const check = checkConsoleCommand(bytes, {
    maxKmh: effectiveMax(),
    maxStep: governor.maxStep,
    baseKmh: governor.base(),
    msSinceLastSpeedCommand: governor.msSinceLastCommand(),
  });
  if (check.action === 'block') { log(`❌ ${check.reason}`); return; }
  const data = new Uint8Array(bytes);
  if (check.action === 'confirm-start') {
    if (!(await confirmStart())) return;
    governor.reset();
    if (await c.send(data)) beltStarted = true;
    return;
  }
  if (bytes[0] === OP.STOP_PAUSE && (bytes[1] === 0x01 || bytes[1] === 0x02)) {
    runner.abort('Gestoppt (Konsole)');
    governor.reset();
    standstill.disarm();
    if (await c.send(data, { urgent: true })) beltStarted = false;
    return;
  }
  if (check.setSpeed !== undefined) governor.noteExternalCommand(check.setSpeed);
  void c.send(data);
}

// ---------- Einstellungen ----------
function loadSettings() {
  const l = loadLimit(store.get(LIMIT_STORAGE_KEY), store.get(LEGACY_LIMIT_KEY));
  limit = l.value;
  if (l.note) log(l.note);
  $input('cap').value = String(limit);
  const ms = parseMaxStep(store.get(MAX_STEP_STORAGE_KEY) ?? '');
  if (ms !== null) governor.maxStep = ms;
  $input('maxStep').value = String(governor.maxStep);
  const hm = store.get(HIDDEN_MODE_KEY);
  if (hm === 'warn' || hm === 'pause') $<HTMLSelectElement>('hiddenMode').value = hm;
}

async function limitChanged() {
  const input = $input('cap');
  const d = decideLimitChange(input.value, limit);
  if (!d.ok) { log(`❌ ${d.reason}`); input.value = String(limit); return; }
  if (d.needsConfirmation) {
    const ok = await confirmDialog(`Limit auf ${d.value} km/h erhöhen?`, [
      `Über ${LIMIT_CONFIRM_ABOVE} km/h steigt das Risiko zu stolpern oder zu stürzen.`,
      'Erhöhe das Limit nur, wenn du bei dieser Geschwindigkeit sicher auf dem Band läufst.',
    ], `Ja, ${d.value} km/h erlauben`);
    if (!ok) { input.value = String(limit); return; }
  }
  limit = d.value;
  input.value = String(limit);
  store.set(LIMIT_STORAGE_KEY, serializeLimit(limit, limit > LIMIT_CONFIRM_ABOVE));
  applyLimits();
  redrawChart();
}

function maxStepChanged() {
  const input = $input('maxStep');
  const v = parseMaxStep(input.value);
  if (v === null) { log('❌ Maximale Änderung muss zwischen 0,1 und 1,0 km/h liegen'); input.value = String(governor.maxStep); return; }
  governor.maxStep = v;
  input.value = String(v);
  store.set(MAX_STEP_STORAGE_KEY, String(v));
  applyLimits();
}

// ---------- Info ----------
function renderInfo() {
  $('infoDisclaimerTitle').textContent = 'Sicherheit und Haftung';
  const ul = $('infoDisclaimer');
  for (const t of DISCLAIMER_POINTS) {
    const li = document.createElement('li');
    li.textContent = t;
    ul.append(li);
  }
  $('infoTested').textContent = `${TESTED_WITH}. Ausprobiert: ${TESTED_FEATURES}. Noch nicht einzeln getestet: ${UNTESTED_FEATURES}.`;
  $('infoAffiliation').textContent = NOT_AFFILIATED;
  $('footerVersion').textContent = `${APP_NAME} ${APP_VERSION} · MIT-Lizenz · unabhängiges Projekt, nicht mit dem Hersteller verbunden`;
}

// ---------- Events ----------
$button('connect').onclick = () => void connect('ble');
$button('demo').onclick = () => void connect('demo');
$button('disconnect').onclick = () => void disconnectClicked();
$button('alarmAck').onclick = () => { $('alarm').hidden = true; };
$button('hiddenAck').onclick = () => { $('hiddenBanner').hidden = true; };
$button('simLoss').onclick = () => sim?.simulateConnectionLoss();
$button('simKey').onclick = () => sim?.pullSafetyKey();

$button('start').onclick = async () => {
  if (!(await confirmStart())) return;
  if (connected()) await doStart();
};
$button('pause').onclick = () => void doPause();
$button('stop').onclick = () => void doStop();

const slider = $input('slider');
slider.addEventListener('pointerdown', () => { sliderDragging = true; });
window.addEventListener('pointerup', () => { sliderDragging = false; });
slider.oninput = () => { $('target').textContent = `${parseFloat(slider.value).toFixed(1)} km/h`; };
slider.onchange = () => { sliderDragging = false; requestSpeed(parseFloat(slider.value)); };
$button('minus').onclick = () => stepSpeed(-0.5);
$button('plus').onclick = () => stepSpeed(0.5);
document.querySelectorAll<HTMLButtonElement>('.preset').forEach(b => {
  b.onclick = () => requestSpeed(parseFloat(b.dataset.speed ?? ''));
});
$input('cap').onchange = () => void limitChanged();
$input('maxStep').onchange = maxStepChanged;
$<HTMLSelectElement>('hiddenMode').onchange = e => store.set(HIDDEN_MODE_KEY, (e.target as HTMLSelectElement).value);

$input('inclSlider').oninput = e => { $('inclTarget').textContent = `${parseFloat((e.target as HTMLInputElement).value).toFixed(1)} %`; };
$input('inclSlider').onchange = e => void setIncline(parseFloat((e.target as HTMLInputElement).value));

$button('progStart').onclick = () => void runProgram();
$button('progStop').onclick = () => void doStop();

$button('csv').onclick = exportCsv;
$button('clear').onclick = () => { samples.length = 0; redrawChart(); log('Verlauf gelöscht'); };

$button('rawSend').onclick = () => void rawSend();
$input('raw').addEventListener('keydown', e => { if (e.key === 'Enter') $button('rawSend').click(); });

document.addEventListener('keydown', e => {
  if (!connected()) return;
  const t = e.target as HTMLElement;
  const tag = t.tagName;
  const isText = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (t as HTMLInputElement).type !== 'range');
  if (isText) return;
  if (e.code === 'Space' || e.key === 'Escape') {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    void doStop();
  } else if (tag !== 'INPUT' && e.key === 'ArrowUp') {
    e.preventDefault(); stepSpeed(0.5);
  } else if (tag !== 'INPUT' && e.key === 'ArrowDown') {
    e.preventDefault(); stepSpeed(-0.5);
  }
});

// ---------- Init ----------
loadSettings();
renderInfo();
applyLimits();
redrawChart();
setInterval(redrawChart, 1000);

const hint = bluetoothSupportHint({
  ua: navigator.userAgent, hasApi: !!navigator.bluetooth, secure: isSecureContext, touchPoints: navigator.maxTouchPoints,
});
if (hint) {
  $('unsupportedTitle').textContent = hint.title;
  $('unsupportedText').textContent = hint.text;
  $('unsupported').hidden = false;
  $('status').textContent = 'Web Bluetooth nicht verfügbar';
} else {
  void webAdapter.availability().then(a => {
    if (!a.ok && a.reason === 'no-adapter') $('status').textContent = 'Bluetooth scheint ausgeschaltet zu sein oder es gibt keinen Adapter.';
  });
}
setUi(false);

if (!isDisclaimerAccepted(store.get(DISCLAIMER_STORAGE_KEY))) void ensureDisclaimer();
