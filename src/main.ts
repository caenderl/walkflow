import './style.css';
import { TreadmillClient, WebBluetoothAdapter, type BleAdapter, type TreadmillEvents } from './ble';
import { bluetoothSupportHint } from './browser';
import { drawChart } from './chart';
import { APP_NAME, APP_VERSION, BUILD_TARGET, DONATION_URL, GITHUB_REPO } from './config';
import { desktop, setupDesktop } from './desktop';
import { choose, confirmDialog } from './dialogs';
import { buildTcx, exportFilename, toCsv, type Sample, type TcxSport } from './export';
import {
  cmdPause, cmdRequestControl, cmdSetInclination, cmdSetSpeed, cmdStart, cmdStop, describeMachineStatus, hex,
  OP, parseMachineStatus, parseTrainingStatus, type Range, type TreadmillData,
} from './ftms';
import { onLanguageChange, t, type Text } from './i18n';
import { bindText, initLanguage, languageSelect } from './i18n-dom';
import { fmtTime, parseProgram, ProgramRunner, totalSeconds } from './program';
import { setupPwa } from './pwa';
import {
  beltMaybeRunning, checkConsoleCommand, decideLimitChange, DISCLAIMER_STORAGE_KEY, DISCLAIMER_VERSION,
  effectiveMax as calcEffectiveMax, isDisclaimerAccepted, LEGACY_LIMIT_KEY, LIMIT_CONFIRM_ABOVE, LIMIT_STORAGE_KEY,
  loadLimit, MAX_STEP_MAX, MAX_STEP_MIN, MAX_STEP_STORAGE_KEY, parseHexBytes, parseMaxStep, RAMP_INTERVAL_MS,
  serializeLimit, SpeedGovernor, StandstillDetector,
} from './safety';
import { SimulatorAdapter } from './sim';
import { initTheme, onThemeChange, themeSelect } from './theme';
import { $, $button, $input, download, log, store } from './ui';

initTheme();
initLanguage();

const HIDDEN_MODE_KEY = 'walkflow.hiddenMode';
const TCX_SPORT_KEY = 'walkflow.tcxSport';
const now = () => performance.now();

// ---------- State ----------
const webAdapter = new WebBluetoothAdapter();
let sim: SimulatorAdapter | null = null;
let client: TreadmillClient | null = null;
let devMin = 1.0, devMax = 12.0;
let limit = 6;
let wakeLock: WakeLockSentinel | null = null;
/** Started by the app or according to Machine Status, and not stopped since */
let beltStarted = false;
let lastMeasured: number | undefined;
let controlLost = false;
let hiddenSince: number | null = null;
let hiddenWhileRunning: 'warned' | 'paused' | null = null;
let sliderDragging = false;
let inclRange: Range | null = null;
let inclShown = 0;
const cur: Omit<Sample, 'ts'> = {};   // latest measured values
const samples: Sample[] = [];          // history (1 Hz)
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
  status: text => bindText($('progStatus'), text),
  log,
});

const events: TreadmillEvents = {
  log,
  data: onTreadmillData,
  heartRate: bpm => { if (bpm > 0) { cur.hr = bpm; renderStats(); } },
  machineStatus: onMachineStatus,
  trainingStatus: dv => {
    log(t.machine.training(hex(dv), parseTrainingStatus(dv)?.text ?? null));
  },
  disconnected: onDisconnected,
};

// ---------- Live data ----------
function onTreadmillData(r: TreadmillData) {
  if (r.speed !== undefined) cur.speed = r.speed;
  if (r.dist !== undefined) cur.dist = r.dist;
  if (r.incl !== undefined) cur.incl = r.incl;
  if (r.kcal !== undefined) cur.kcal = r.kcal;
  if (r.time !== undefined) cur.time = r.time;
  if (r.hr !== undefined && r.hr > 0) cur.hr = r.hr;
  renderStats();

  if (r.speed !== undefined) {
    lastMeasured = r.speed;
    governor.noteMeasured(r.speed);
    if (standstill.feed(r.speed, now()) && runner.active) {
      log(t.program.standstillLog);
      runner.abort(() => t.program.standstill);
      governor.reset();
    }
  }
  // Notifications also arrive in throttled background tabs
  runner.tick();

  const ts = Date.now();
  if (ts - lastSample >= 1000) {
    lastSample = ts;
    samples.push({ ts, ...cur });
    if (samples.length > 20000) samples.shift();
    redrawChart();
  }
}

function renderStats() {
  const f = (v: number | undefined, digits: number) => (v === undefined ? '–' : t.number(v, digits));
  // Without a connection the current speed is unknown; do not leave the last value standing
  $('vSpeed').textContent = connected() ? f(cur.speed, 1) : '–';
  $('vDist').textContent = f(cur.dist === undefined ? undefined : cur.dist / 1000, 2);
  $('vIncl').textContent = f(cur.incl, 1);
  $('vTime').textContent = cur.time === undefined ? '–' : fmtTime(cur.time);
  $('vHr').textContent = cur.hr === undefined ? '–' : String(cur.hr);
  $('vKcal').textContent = cur.kcal === undefined ? '–' : String(cur.kcal);
}

function onMachineStatus(dv: DataView) {
  const e = parseMachineStatus(dv);
  log(t.machine.status(hex(dv), e ? describeMachineStatus(e) : null));
  if (!e) return;
  switch (e.kind) {
    case 'stopped':
    case 'paused':
    case 'safety-key':
      beltStarted = false;
      if (runner.active) runner.abort(() => t.program.endedBy(describeMachineStatus(e)));
      governor.reset();
      standstill.disarm();
      break;
    case 'started':
      beltStarted = true;
      break;
    case 'control-lost':
      controlLost = true;
      log(t.machine.controlLostLog);
      break;
    default:
      break;
  }
}

function redrawChart() {
  drawChart($<HTMLCanvasElement>('chart'), samples, { now: Date.now(), limit: effectiveMax(), target: governor.target ?? 0 });
}

// ---------- Speed & incline ----------
function effectiveMax() { return calcEffectiveMax(devMax, limit); }

function applyLimits() {
  const sl = $input('slider');
  sl.min = String(devMin); sl.max = String(effectiveMax());
  if (parseFloat(sl.value) > parseFloat(sl.max)) sl.value = sl.max;
  if (parseFloat(sl.value) < parseFloat(sl.min)) sl.value = sl.min;
  renderRangeInfo();
  const before = governor.target;
  governor.setRange({ min: devMin, max: effectiveMax() });
  if (connected() && governor.target !== before && governor.target !== null) log(t.limit.lowered(governor.target));
  renderSpeed();
}

function renderRangeInfo() {
  $('rangeInfo').textContent = t.settings.range(devMin, devMax, effectiveMax(), governor.maxStep, RAMP_INTERVAL_MS);
}

function renderSpeed() {
  const sl = $input('slider');
  const target = governor.target;
  if (target !== null && !sliderDragging) sl.value = String(target);
  $('target').textContent = t.control.speed(target ?? parseFloat(sl.value));
  const lc = governor.lastCommand;
  $('rampInfo').textContent = governor.ramping && target !== null && lc && lc.kmh !== target
    ? t.control.ramping(lc.kmh, target)
    : ' ';
}

function requestSpeed(kmh: number) {
  if (!connected() || !Number.isFinite(kmh)) return;
  governor.request(kmh);
  renderSpeed();
}

function stepSpeed(delta: number) {
  requestSpeed((governor.target ?? governor.base()) + delta);
}

function renderIncline() {
  $('inclTarget').textContent = t.incline.value(inclShown);
  $('inclInfo').textContent = inclRange ? t.incline.range(inclRange.min, inclRange.max, inclRange.step) : t.incline.unknown;
}

function setIncline(pct: number) {
  if (!client) return Promise.resolve(false);
  $input('inclSlider').value = String(pct);
  inclShown = pct;
  renderIncline();
  return client.send(cmdSetInclination(pct));
}

// ---------- Start / stop / program ----------
async function doStop(reason: Text = () => t.stop.stopped): Promise<boolean> {
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

async function doPause(reason: Text = () => t.stop.paused): Promise<boolean> {
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
  return confirmDialog(t.start.title, [
    ...(intro ? [intro] : []),
    t.start.sideRails,
    t.start.safetyKey,
  ], t.start.confirm);
}

async function runProgram() {
  const steps = parseProgram($input('progText').value);
  if (!steps.length) { bindText($('progStatus'), () => t.program.empty); return; }
  const max = effectiveMax();
  const intro = t.program.confirm(steps.length, fmtTime(totalSeconds(steps)))
    + (steps.some(s => s.speed > max) ? ` ${t.program.capped(max)}` : '');
  if (!(await confirmStart(intro))) return;
  if (!connected()) return;
  await runner.run(steps);
  standstill.disarm();
}

// ---------- Export ----------
function exportCsv() {
  if (!samples.length) { log(t.settings.noData); return; }
  download(toCsv(samples), 'text/csv', exportFilename(new Date(), 'csv'));
}

function exportTcx() {
  const sport = $<HTMLSelectElement>('tcxSport').value as TcxSport;
  const xml = buildTcx(samples, { sport, notes: t.settings.tcxNotes });
  if (!xml) { log(t.settings.noMovement); return; }
  const firstMoving = samples.find(s => (s.speed ?? 0) > 0);
  download(xml, 'application/vnd.garmin.tcx+xml', exportFilename(new Date(firstMoving?.ts ?? Date.now()), 'tcx'));
}

// ---------- First run ----------
async function ensureDisclaimer(): Promise<boolean> {
  if (isDisclaimerAccepted(store.get(DISCLAIMER_STORAGE_KEY))) return true;
  const r = await choose(() => ({
    title: t.disclaimer.title,
    list: t.disclaimer.points,
    requireCheckbox: t.disclaimer.checkbox,
    buttons: [{ id: 'ok', label: t.disclaimer.accept, kind: 'primary' }, { id: 'later', label: t.disclaimer.later }],
    cancelId: 'later',
    languagePicker: true,
  }));
  if (r !== 'ok') return false;
  store.set(DISCLAIMER_STORAGE_KEY, String(DISCLAIMER_VERSION));
  return true;
}

// ---------- Connect ----------
async function connect(kind: 'ble' | 'demo') {
  if (connected() || !(await ensureDisclaimer())) return;
  $button('connect').disabled = true;
  $button('demo').disabled = true;
  try {
    bindText($('status'), () => kind === 'demo' ? t.connection.demoConnecting : t.connection.searching);
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
      inclRange = info.inclRange;
      inclShown = parseFloat(sl.value);
      renderIncline();
    }

    beltStarted = false; lastMeasured = undefined; controlLost = false;
    governor.reset();
    await acquireWakeLock();
    applyLimits();
    setUi(true);
    $('alarm').hidden = true;
    $('demoBanner').hidden = kind !== 'demo';
    const name = info.deviceName;
    bindText($('status'), () => {
      const shown = name ?? t.connection.defaultDeviceName;
      return kind === 'demo' ? t.connection.demoConnected(shown) : t.connection.connected(shown);
    });
    desktop?.connectionChanged(true);
    await c.send(cmdRequestControl());
  } catch (e) {
    log(`❌ ${e instanceof Error ? e.message : String(e)}`);
    if (!connected()) {
      client = null;
      bindText($('status'), () => t.connection.notConnected);
      setUi(false);
    }
  }
}

function resetIncline() {
  const sl = $input('inclSlider');
  sl.min = '0'; sl.max = '15'; sl.step = '1'; sl.value = '0';
  inclRange = null;
  inclShown = 0;
  renderIncline();
}

function onDisconnected() {
  const wasRunning = maybeRunning();
  log(t.disconnect.log);
  runner.abort(() => t.disconnect.programEnded);
  governor.reset();
  standstill.disarm();
  releaseWakeLock();
  desktop?.connectionChanged(false);
  client = null;
  beltStarted = false; lastMeasured = undefined; controlLost = false;
  bindText($('status'), () => t.connection.notConnected);
  renderStats();
  $('demoBanner').hidden = true;
  setUi(false);
  if (wasRunning) {
    $('alarm').hidden = false;
    $('alarm').scrollIntoView({ block: 'start' });
    log(t.disconnect.lostWhileRunning);
  }
}

async function disconnectClicked() {
  if (!client) return;
  if (maybeRunning()) {
    const choice = await choose({
      title: t.disconnect.runningTitle,
      paragraphs: [t.disconnect.runningText],
      buttons: [
        { id: 'stop', label: t.disconnect.stopFirst, kind: 'primary' },
        { id: 'force', label: t.disconnect.force },
        { id: 'cancel', label: t.common.cancel },
      ],
      cancelId: 'cancel',
    });
    if (choice === 'cancel') return;
    if (choice === 'stop') {
      const ok = await doStop(() => t.stop.beforeDisconnect);
      if (!(ok && await waitUntil(() => !maybeRunning(), 10_000))) {
        const force = await confirmDialog(t.disconnect.stillMovingTitle, [t.disconnect.stillMovingText(lastMeasured)], t.disconnect.force);
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
  // Layout switch (style.css): connect buttons vs. live view, fixed control dock on narrow screens
  document.documentElement.classList.toggle('connected', isConnected);
  $button('connect').disabled = isConnected || !$('unsupported').hidden;
  $button('demo').disabled = isConnected;
  $button('disconnect').disabled = !isConnected;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.needs-conn').forEach(el => { el.disabled = !isConnected; });
}

// ---------- Wake lock & background ----------
async function acquireWakeLock() {
  if (wakeLock && !wakeLock.released) return;
  try { wakeLock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { wakeLock = null; }
}

function releaseWakeLock() {
  try { void wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!connected() || !maybeRunning()) return;
    hiddenSince = Date.now();
    document.title = t.hidden.title;
    if ($<HTMLSelectElement>('hiddenMode').value === 'pause') {
      hiddenWhileRunning = 'paused';
      log(t.hidden.pausingLog);
      void doPause(() => t.hidden.pausedReason);
    } else {
      hiddenWhileRunning = 'warned';
      log(t.hidden.warnLog);
    }
    return;
  }
  document.title = APP_NAME;
  runner.tick();
  if (connected()) void acquireWakeLock(); // the browser releases the wake lock when the tab is hidden
  if (hiddenSince !== null && hiddenWhileRunning) {
    const s = Math.round((Date.now() - hiddenSince) / 1000);
    const how = hiddenWhileRunning;
    bindText($('hiddenText'), () => how === 'paused' ? t.hidden.paused(s) : t.hidden.warned(s));
    $('hiddenBanner').hidden = false;
  }
  hiddenSince = null;
  hiddenWhileRunning = null;
});

window.addEventListener('beforeunload', e => {
  if (connected() && maybeRunning()) e.preventDefault();
});

// ---------- Console ----------
async function rawSend() {
  const c = client;
  if (!c) return;
  const bytes = parseHexBytes($input('raw').value);
  if (!bytes) { log(t.console.invalidHex); return; }
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
    runner.abort(() => t.console.stopped);
    governor.reset();
    standstill.disarm();
    if (await c.send(data, { urgent: true })) beltStarted = false;
    return;
  }
  if (check.setSpeed !== undefined) governor.noteExternalCommand(check.setSpeed);
  void c.send(data);
}

// ---------- Settings ----------
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
  const sp = store.get(TCX_SPORT_KEY);
  if (sp === 'Running' || sp === 'Other') $<HTMLSelectElement>('tcxSport').value = sp;
}

async function limitChanged() {
  const input = $input('cap');
  const d = decideLimitChange(input.value, limit);
  if (!d.ok) { log(`❌ ${d.reason}`); input.value = String(limit); return; }
  if (d.needsConfirmation) {
    const ok = await confirmDialog(t.limit.confirmTitle(d.value), [
      t.limit.risk(LIMIT_CONFIRM_ABOVE),
      t.limit.onlyIf,
    ], t.limit.allow(d.value));
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
  if (v === null) { log(t.limit.maxStepRange(MAX_STEP_MIN, MAX_STEP_MAX)); input.value = String(governor.maxStep); return; }
  governor.maxStep = v;
  input.value = String(v);
  store.set(MAX_STEP_STORAGE_KEY, String(v));
  applyLimits();
}

// ---------- Info ----------
function renderInfo() {
  const ul = $('infoDisclaimer');
  ul.replaceChildren(...t.disclaimer.points.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  $('infoTested').textContent = t.info.tested(t.info.testedDevice, t.info.testedFeatures, t.info.untestedFeatures);
  $('infoAffiliation').textContent = t.info.notAffiliated;
  $('footerVersion').textContent = t.info.footer(APP_VERSION);

  const source = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : '';
  $('infoSource').replaceChildren(...(source ? [t.info.source, link(source, source.replace('https://', ''))] : []));
  const links: HTMLElement[] = [];
  if (BUILD_TARGET === 'web') links.push(link(t.info.imprintHref, t.info.imprint), link(t.info.privacyHref, t.info.privacyLink));
  if (source) links.push(link(source, t.info.sourceLink));
  // Web build only, and only if configured. Nothing in return, no feature depends on it.
  if (BUILD_TARGET === 'web' && DONATION_URL) links.push(link(DONATION_URL, t.info.donation));
  $('footerLinks').replaceChildren(...links.flatMap((a, i) => (i ? [' · ', a] : [a])));
}

function link(href: string, text: string) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  return a;
}

// ---------- Events ----------
$('prefs').append(languageSelect(), themeSelect());
onThemeChange(redrawChart);

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
slider.oninput = () => { $('target').textContent = t.control.speed(parseFloat(slider.value)); };
slider.onchange = () => { sliderDragging = false; requestSpeed(parseFloat(slider.value)); };
$button('minus').onclick = () => stepSpeed(-0.5);
$button('plus').onclick = () => stepSpeed(0.5);
document.querySelectorAll<HTMLButtonElement>('.preset').forEach(b => {
  b.onclick = () => requestSpeed(parseFloat(b.dataset.speed ?? ''));
});
$input('cap').onchange = () => void limitChanged();
$input('maxStep').onchange = maxStepChanged;
$<HTMLSelectElement>('hiddenMode').onchange = e => store.set(HIDDEN_MODE_KEY, (e.target as HTMLSelectElement).value);

$input('inclSlider').oninput = e => { $('inclTarget').textContent = t.incline.value(parseFloat((e.target as HTMLInputElement).value)); };
$input('inclSlider').onchange = e => void setIncline(parseFloat((e.target as HTMLInputElement).value));

$button('progStart').onclick = () => void runProgram();
$button('progStop').onclick = () => void doStop();

$button('csv').onclick = exportCsv;
$button('tcx').onclick = exportTcx;
$<HTMLSelectElement>('tcxSport').onchange = e => store.set(TCX_SPORT_KEY, (e.target as HTMLSelectElement).value);
$button('clear').onclick = () => { samples.length = 0; redrawChart(); log(t.settings.cleared); };

$button('rawSend').onclick = () => void rawSend();
$input('raw').addEventListener('keydown', e => { if (e.key === 'Enter') $button('rawSend').click(); });

document.addEventListener('keydown', e => {
  if (!connected()) return;
  const el = e.target as HTMLElement;
  const tag = el.tagName;
  const isText = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range');
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

onLanguageChange(() => {
  renderInfo();
  renderRangeInfo();
  renderSpeed();
  renderIncline();
  renderStats();
  redrawChart();
  if (document.hidden && hiddenSince !== null) document.title = t.hidden.title;
});

// ---------- Init ----------
bindText($('status'), () => t.connection.notConnected);
bindText($('progStatus'), () => t.program.idle);
loadSettings();
renderInfo();
renderIncline();
applyLimits();
redrawChart();
setInterval(redrawChart, 1000);
new ResizeObserver(redrawChart).observe($('chart'));

const env = { ua: navigator.userAgent, hasApi: !!navigator.bluetooth, secure: isSecureContext, touchPoints: navigator.maxTouchPoints };
if (bluetoothSupportHint(env)) {
  bindText($('unsupportedTitle'), () => bluetoothSupportHint(env)?.title ?? '');
  bindText($('unsupportedText'), () => bluetoothSupportHint(env)?.text ?? '');
  $('unsupported').hidden = false;
  bindText($('status'), () => t.connection.noWebBluetooth);
} else if (!desktop) {
  // Not in the desktop app: there, this would already trigger the macOS Bluetooth prompt at launch
  void webAdapter.availability().then(a => {
    if (!a.ok && a.reason === 'no-adapter') bindText($('status'), () => t.connection.adapterOff);
  });
}
setUi(false);
setupPwa(connected);
setupDesktop({
  onGlobalStop: () => { if (connected()) { log(t.stop.globalShortcutLog); void doStop(() => t.stop.globalShortcut); } },
  log,
});

if (!isDisclaimerAccepted(store.get(DISCLAIMER_STORAGE_KEY))) void ensureDisclaimer();
