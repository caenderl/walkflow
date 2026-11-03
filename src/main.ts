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
import { setupHistory } from './history';
import { lang, onLanguageChange, retranslate, t, type Text } from './i18n';
import { routeDescription, routeName } from './route-examples';
import { bindText, initLanguage } from './i18n-dom';
import { setupMenu, setupPrefs } from './menus';
import { setupInterval } from './interval-ui';
import { fmtDistance, fmtLength, fmtTime, ProgramRunner, programLength, type ProgramStep } from './program';
import { setupPwa } from './pwa';
import type { RunSource, RunTag } from './runs';
import {
  beltMaybeRunning, checkConsoleCommand, decideLimitChange, DISCLAIMER_STORAGE_KEY, DISCLAIMER_VERSION,
  effectiveMax as calcEffectiveMax, isDisclaimerAccepted, LEGACY_LIMIT_KEY, LIMIT_CONFIRM_ABOVE, LIMIT_MAX, LIMIT_MIN, LIMIT_STORAGE_KEY,
  loadLimit, MAX_STEP_MAX, MAX_STEP_MIN, MAX_STEP_STORAGE_KEY, parseHexBytes, parseMaxStep, RAMP_INTERVAL_MS,
  serializeLimit, SpeedGovernor, StandstillDetector,
} from './safety';
import { ACTIVE_STORAGE_KEY, readActive, type Active } from './selection';
import { setupSettings } from './settings-ui';
import { SimulatorAdapter } from './sim';
import { initTheme, onThemeChange } from './theme';
import { clampIncline, inclineSupport, levelsFromCount, parseLevelCount, type InclineSupport } from './incline';
import { $, $button, $input, download, log, store } from './ui';
import { fromSpeed, onUnitsChange, parseUnits, setUnits, speedFromInput, speedPresets, speedStep, toDist, toSpeed, UNITS_STORAGE_KEY } from './units';
import { askBeforeStart } from './quiet';
import { setupRoutes } from './route-ui';
import { setupViews, stopPlacement, type View } from './views';
import { setupWorkouts } from './workout-ui';

initTheme();
initLanguage();
// Units before anything is drawn
setUnits(parseUnits(store.get(UNITS_STORAGE_KEY)));

const HIDDEN_MODE_KEY = 'walkflow.hiddenMode';
const TCX_SPORT_KEY = 'walkflow.tcxSport';
const INCLINE_LEVELS_KEY = 'walkflow.inclineLevelCount';
/** 'no' once a real treadmill reported no incline: then nothing about the incline is shown */
const INCLINE_SEEN_KEY = 'walkflow.inclineSupport';
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
let inclSupport: InclineSupport = { settable: false, reported: false };
/** How many levels the person says the treadmill's incline has; 0 = the slider over the range the treadmill reports */
let inclLevelCount = 0;
const cur: Omit<Sample, 'ts'> = {};   // latest measured values
const samples: Sample[] = [];          // recording since the page was opened (1 Hz), for the chart and export
let lastSample = 0;
let runSource: RunSource = 'ble';
let view: View = 'training';
let uiConnected = false;
/** What the training view is about: a workout, a route, or nothing (free training). Chosen in the workouts and routes views. */
let active: Active = readActive(store.get(ACTIVE_STORAGE_KEY));
/** The stage can only be drawn once everything it reads has been set up */
let booted = false;

// Saved runs. The recorder never throws and saves asynchronously, so it cannot hold up the control path.
const history = setupHistory({
  log,
  tcxSport: () => $<HTMLSelectElement>('tcxSport').value as TcxSport,
  onRestored: () => { void workouts.reload(); void routes.reload(); },
});
const recorder = history.recorder;
const interval = setupInterval();
const settings = setupSettings();
const workouts = setupWorkouts({
  maxSpeed: () => effectiveMax(),
  useRoute: id => { routes.use(id); setActive('route'); },
  useWorkout: () => setActive('workout'),
  wanted: () => active === 'workout',
  changed: () => { if (booted) renderStage(); },
});
const routes = setupRoutes({
  maxSpeed: () => effectiveMax(),
  changed: () => { if (booted) renderStage(); },
  chosen: () => setActive('route'),
  wanted: () => active === 'route',
});

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
  distance: () => cur.dist,
  status: text => { bindText($('progStatus'), text); renderStage(); },
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
  if (r.dist !== undefined) { cur.dist = r.dist; routes.update(cur.dist); }
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
    const sample = { ts, ...cur };
    samples.push(sample);
    if (samples.length > 20000) samples.shift();
    redrawChart();
    recorder.feed(sample, runSource);
  }
}

function renderStats() {
  const f = (v: number | undefined, digits: number) => (v === undefined ? '–' : t.number(v, digits));
  // Without a connection the current speed is unknown; do not leave the last value standing
  $('vSpeed').textContent = connected() ? f(cur.speed === undefined ? undefined : toSpeed(cur.speed), 1) : '–';
  $('vDist').textContent = f(cur.dist === undefined ? undefined : toDist(cur.dist), 2);
  $('vIncl').textContent = f(cur.incl, 1);
  $('statIncl').hidden = !inclSupport.reported && cur.incl === undefined;
  $('vTime').textContent = cur.time === undefined ? '–' : fmtTime(cur.time);
  $('vHr').textContent = cur.hr === undefined ? '–' : String(cur.hr);
  $('vKcal').textContent = cur.kcal === undefined ? '–' : String(cur.kcal);
  // Stop bar (views other than training)
  $('sbSpeed').textContent = connected() && cur.speed !== undefined ? t.control.speed(cur.speed) : '–';
  $('sbMore').textContent = connected() && cur.time !== undefined ? t.stopBar.more(fmtTime(cur.time), cur.dist ?? 0) : '';
  $('sbState').textContent = (lastMeasured ?? 0) > 0 ? t.stopBar.running : t.stopBar.idle;
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
  $('deviceInfo').textContent = t.connection.deviceInfo(devMin, devMax, effectiveMax());
  workouts.refreshLimit();
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

/** The setting "incline levels": the slider and the number beside it */
function renderLevelCountField() {
  $input('inclLevelsInput').value = String(inclLevelCount);
  $('inclLevelsValue').textContent = inclLevelCount === 0 ? t.incline.levelsNone : String(inclLevelCount);
}

function renderIncline() {
  $('inclCard').hidden = !inclSupport.settable;
  $('inclTarget').textContent = t.incline.value(inclShown);
  const levels = levelsFromCount(inclLevelCount, inclRange ?? undefined);
  const box = $('inclLevels');
  box.hidden = levels.length === 0;
  $input('inclSlider').hidden = levels.length > 0;
  box.replaceChildren(...levels.map((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'needs-conn';
    b.disabled = !uiConnected;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(Math.abs(l - inclShown) < 0.05));
    b.textContent = String(i + 1);
    b.title = b.ariaLabel = t.incline.levelButton(i + 1, l);
    b.onclick = () => void setIncline(l);
    return b;
  }));
  $('inclInfo').textContent = inclRange ? t.incline.range(inclRange.min, inclRange.max, inclRange.step) : t.incline.unknown;
}

function setIncline(requested: number) {
  const pct = clampIncline(requested, inclRange ?? undefined);
  if (!client || !inclSupport.settable || Number.isNaN(pct)) return Promise.resolve(false);
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

/** The question before a start. Quiet mode (settings) skips it, except for a raw Start in the experiment console. */
function confirmStart(intro?: string, opts?: { always?: boolean }): Promise<boolean> {
  return askBeforeStart(settings.quiet, () => confirmDialog(t.start.title, [
    ...(intro ? [intro] : []),
    t.start.sideRails,
    t.start.safetyKey,
  ], t.start.confirm), opts);
}

/** What the Start button starts, if what was chosen still exists */
function effectiveActive(): Active {
  if (active === 'workout' && workouts.selectedInfo()) return 'workout';
  if (active === 'route' && routes.current()) return 'route';
  return null;
}

function setActive(kind: Active) {
  active = kind;
  store.set(ACTIVE_STORAGE_KEY, kind ?? '');
  routes.refresh();
  workouts.refresh();
  renderStage();
}

/** What the training view shows (the stage in index.html): the chosen workout or route with its details, and as the main
 *  element the steps of a workout, the map of a route (if the map is on) or the speed chart. Display only. */
let activeRun: { kind: RunTag['kind']; name: string } | null = null;
function renderStage() {
  const kind = effectiveActive();
  const p = runner.progress();
  const runningSteps = p !== null && activeRun?.kind === 'workout';
  const mode = runningSteps || kind === 'workout' ? 'interval' : kind === 'route' && routes.mapActive() ? 'map' : 'chart';
  const stage = $('stage');
  const was = stage.dataset.mode;
  stage.dataset.mode = mode;
  stage.dataset.kind = kind ?? '';

  const workout = kind === 'workout' ? workouts.selectedInfo() : null;
  const route = kind === 'route' ? routes.current() : null;
  $('stageHead').hidden = $('stageInfo').hidden = !kind;
  $('shKind').textContent = kind === 'workout' ? t.history.tagWorkout : t.history.tagRoute;
  $('shName').textContent = workout?.name ?? (route ? routeName(route.route, lang) : '');
  $('shInfo').textContent = workout ? t.program.summary(workout.steps.length, fmtLength(programLength(workout.steps))) : route?.info ?? '';
  const desc = route ? routeDescription(route.route, lang) : null;
  $('shDesc').textContent = desc?.text ?? '';
  $('shDesc').hidden = !desc;
  if (desc?.lang) $('shDesc').lang = desc.lang; else $('shDesc').removeAttribute('lang');
  const clear = $button('shClear');
  clear.textContent = t.stage.clear;
  clear.disabled = runner.active;

  $('stageInterval').hidden = mode !== 'interval';
  if (runningSteps) interval.render(p, governor.target);
  else if (workout) interval.renderPreview(workout.steps);
  $('stageChart').hidden = mode !== 'chart';
  $('stageFreeHint').hidden = kind !== null;
  $('startLabel').textContent = kind === 'workout' ? t.program.start : kind === 'route' ? t.routes.walk : t.control.start;
  if (mode === 'chart' && was !== 'chart') redrawChart();
}

/**
 * Workouts and routes start the same way: confirmation, connection check, then the runner with its ramp, limit and
 * stop rules. `tag` says what the run was, so the history can show it. A route is a workout of one distance step.
 */
async function runSteps(steps: ProgramStep[], tag: Omit<RunTag, 'completed'>, intro: string, onStart?: () => void) {
  const max = effectiveMax();
  const text = intro + (steps.some(s => s.speed > max) ? ` ${t.program.capped(max)}` : '');
  if (!(await confirmStart(text))) return;
  if (!connected()) return;
  onStart?.();
  const token = recorder.begin(tag);
  const mine = activeRun = { kind: tag.kind, name: tag.name };
  interval.reset();
  const result = await runner.run(steps);
  // A newer run may have replaced this one in the meantime
  if (activeRun === mine) activeRun = null;
  renderStage();
  recorder.complete(token, result === 'finished');
  standstill.disarm();
  // The run is saved by now (or has failed): today's goal in the route card may have moved
  void recorder.settled().then(() => routes.refreshGoal());
}

async function runProgram() {
  const selected = workouts.selectedInfo();
  if (!selected?.steps.length) { bindText($('progStatus'), () => t.program.empty); return; }
  await runSteps(selected.steps, { kind: 'workout', id: selected.id, name: selected.name },
    t.program.confirm(selected.steps.length, fmtLength(programLength(selected.steps))));
}

async function runRoute() {
  const walk = routes.walkRequest();
  if (!walk) { bindText($('progStatus'), () => t.routes.cannotWalk); return; }
  const shown = Math.min(walk.kmh, effectiveMax());
  await runSteps(walk.steps, { kind: 'route', id: walk.route.id, name: routeName(walk.route, lang) },
    t.routes.walkConfirm(routeName(walk.route, lang), fmtDistance(walk.steps[0]?.meters ?? 0), shown), () => routes.restart());
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
    setStatus(() => kind === 'demo' ? t.connection.demoConnecting : t.connection.searching);
    let adapter: BleAdapter = webAdapter;
    if (kind === 'demo') adapter = sim ??= new SimulatorAdapter({ version: APP_VERSION });
    const c = new TreadmillClient(adapter, events);
    client = c;
    runSource = kind === 'demo' ? 'demo' : 'ble';
    devMin = 1.0; devMax = 12.0;
    resetIncline();
    const info = await c.connect();

    if (info.speedRange) { devMin = info.speedRange.min; devMax = info.speedRange.max; }
    inclSupport = inclineSupport(info.features, info.inclRange);
    if (!inclSupport.settable && !inclSupport.reported) log(t.incline.unsupportedLog);
    if (runSource === 'ble') rememberInclineSupport();
    if (info.inclRange) {
      const { min: mn, max: mx, step: st } = info.inclRange;
      const sl = $input('inclSlider');
      sl.min = String(mn); sl.max = String(mx); sl.step = String(st || 0.5); sl.value = String(Math.max(mn, 0));
      inclRange = info.inclRange;
      inclShown = parseFloat(sl.value);
    }
    renderIncline();
    renderStats();

    beltStarted = false; lastMeasured = undefined; controlLost = false;
    governor.reset();
    await acquireWakeLock();
    applyLimits();
    setUi(true);
    $('alarm').hidden = true;
    $('demoBanner').hidden = kind !== 'demo';
    const name = info.deviceName;
    bindText($('deviceName'), () => name ?? t.connection.defaultDeviceName);
    setStatus(() => {
      const shown = name ?? t.connection.defaultDeviceName;
      return kind === 'demo' ? t.connection.demoConnected(shown) : t.connection.connected(shown);
    }, () => (kind === 'demo' ? t.connection.demoConnectedShort : t.connection.connectedShort));
    desktop?.connectionChanged(true);
    await c.send(cmdRequestControl());
  } catch (e) {
    log(`❌ ${e instanceof Error ? e.message : String(e)}`);
    if (!connected()) {
      client = null;
      setStatus(() => t.connection.notConnected);
      setUi(false);
    }
  }
}

function resetIncline() {
  const sl = $input('inclSlider');
  sl.min = '0'; sl.max = '15'; sl.step = '1'; sl.value = '0';
  inclRange = null;
  inclShown = 0;
  inclSupport = { settable: false, reported: false };
  renderIncline();
}

/** What the last real treadmill said about the incline: remembered so that the editor can hide it while disconnected. */
function rememberInclineSupport() {
  store.set(INCLINE_SEEN_KEY, inclSupport.settable || inclSupport.reported ? 'yes' : 'no');
  applyInclineSeen();
}

function applyInclineSeen() {
  if (store.get(INCLINE_SEEN_KEY) === 'no') document.documentElement.dataset.incline = 'no';
  else delete document.documentElement.dataset.incline;
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
  setStatus(() => t.connection.notConnected);
  renderStats();
  $('demoBanner').hidden = true;
  setUi(false);
  if (wasRunning) {
    $('alarm').hidden = false;
    $('alarm').scrollIntoView({ block: 'start' });
    log(t.disconnect.lostWhileRunning);
  }
  recorder.finish();
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
  // Layout switch (style.css): connection menu content, fixed control dock on narrow screens, stop bar
  uiConnected = isConnected;
  document.documentElement.classList.toggle('connected', isConnected);
  applyStopPlacement();
  renderSettingsLock();
  $button('connect').disabled = isConnected || !$('unsupported').hidden;
  $button('demo').disabled = isConnected;
  $button('disconnect').disabled = !isConnected;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.needs-conn').forEach(el => { el.disabled = !isConnected; });
}

/** Status in the header; narrow screens show the short form (the device name is in the connection menu). */
function setStatus(text: Text, short: Text = text) {
  bindText($('status'), text);
  bindText($('statusShort'), short);
}

/** Controls in the training view, the stop bar elsewhere while connected (tested in views.test.ts). */
function applyStopPlacement() {
  document.documentElement.dataset.stop = stopPlacement(view, uiConnected);
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
    if (connected() && maybeRunning()) {
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
    }
    // After the pause command has been queued, not before
    recorder.flush();
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

window.addEventListener('pagehide', () => recorder.flush());
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
    if (!(await confirmStart(undefined, { always: true }))) return;
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
/** The limit and step fields and the quick-select buttons, in the units of the settings. The values stay km/h inside. */
function renderLimitFields() {
  const shown = (kmh: number) => String(Math.round(toSpeed(kmh) * 100) / 100);
  const metric = toSpeed(1) === 1;
  const cap = $input('cap'), step = $input('maxStep');
  cap.min = shown(LIMIT_MIN); cap.max = shown(LIMIT_MAX); cap.step = metric ? '0.5' : '0.1'; cap.value = shown(limit);
  step.min = shown(MAX_STEP_MIN); step.max = shown(MAX_STEP_MAX); step.step = metric ? '0.1' : '0.01'; step.value = shown(governor.maxStep);
  const presets = speedPresets();
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach((b, i) => {
    const v = presets[i];
    if (v === undefined) return;
    b.dataset.speed = String(v);
    b.textContent = t.number(v);
  });
}

function loadSettings() {
  const l = loadLimit(store.get(LIMIT_STORAGE_KEY), store.get(LEGACY_LIMIT_KEY));
  limit = l.value;
  if (l.note) log(l.note);
  const ms = parseMaxStep(store.get(MAX_STEP_STORAGE_KEY) ?? '');
  if (ms !== null) governor.maxStep = ms;
  renderLimitFields();
  const hm = store.get(HIDDEN_MODE_KEY);
  if (hm === 'warn' || hm === 'pause') $<HTMLSelectElement>('hiddenMode').value = hm;
  inclLevelCount = parseLevelCount(store.get(INCLINE_LEVELS_KEY));
  renderLevelCountField();
  applyInclineSeen();
  const sp = store.get(TCX_SPORT_KEY);
  if (sp === 'Running' || sp === 'Other') $<HTMLSelectElement>('tcxSport').value = sp;
}

async function limitChanged() {
  const input = $input('cap');
  const d = decideLimitChange(speedFromInput(input.value), limit);
  if (!d.ok) { log(`❌ ${d.reason}`); renderLimitFields(); return; }
  if (d.needsConfirmation) {
    const ok = await confirmDialog(t.limit.confirmTitle(d.value), [
      t.limit.risk(LIMIT_CONFIRM_ABOVE),
      t.limit.onlyIf,
    ], t.limit.allow(d.value));
    if (!ok) { renderLimitFields(); return; }
  }
  limit = d.value;
  renderLimitFields();
  store.set(LIMIT_STORAGE_KEY, serializeLimit(limit, limit > LIMIT_CONFIRM_ABOVE));
  applyLimits();
  redrawChart();
}

function maxStepChanged() {
  const input = $input('maxStep');
  const v = parseMaxStep(speedFromInput(input.value));
  if (v === null) { log(t.limit.maxStepRange(MAX_STEP_MIN, MAX_STEP_MAX)); renderLimitFields(); return; }
  governor.maxStep = v;
  renderLimitFields();
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
// The header menus never cover the controls (Start/Pause/Stop, ±)
const controls = () => [document.querySelector('.dock')];
const connMenu = setupMenu($button('statusBtn'), $('connMenu'), controls);
setupPrefs($('langOptions'), $('themeOptions'), $('unitsOptions'));
$button('openData').onclick = () => settings.open('data');
// The belt runs: settings are locked (the dialog itself checks this when it opens)
const renderSettingsLock = () => settings.setLocked(connected() && maybeRunning());
setInterval(renderSettingsLock, 500);
onLanguageChange(() => { settings.relabel(); renderStage(); });
onThemeChange(redrawChart);

$button('connect').onclick = () => { connMenu.close(); void connect('ble'); };
$button('demo').onclick = () => { connMenu.close(); void connect('demo'); };
$button('disconnect').onclick = () => { connMenu.close(); void disconnectClicked(); };
$button('openConn').onclick = () => { connMenu.open(); $button('connect').disabled ? $button('demo').focus() : $button('connect').focus(); };
$button('sbStop').onclick = () => void doStop();
$button('alarmAck').onclick = () => { $('alarm').hidden = true; };
$button('hiddenAck').onclick = () => { $('hiddenBanner').hidden = true; };
$button('simLoss').onclick = () => sim?.simulateConnectionLoss();
$button('simKey').onclick = () => sim?.pullSafetyKey();

$button('start').onclick = async () => {
  // A program that is running is not started again; stop it first
  if (runner.active) return;
  const kind = effectiveActive();
  if (kind === 'workout') { await runProgram(); return; }
  if (kind === 'route') { await runRoute(); return; }
  if (!(await confirmStart())) return;
  if (connected()) await doStart();
};
$button('shClear').onclick = () => setActive(null);
$button('pause').onclick = () => void doPause();
$button('stop').onclick = () => void doStop();

const slider = $input('slider');
slider.addEventListener('pointerdown', () => { sliderDragging = true; });
window.addEventListener('pointerup', () => { sliderDragging = false; });
slider.oninput = () => { $('target').textContent = t.control.speed(parseFloat(slider.value)); };
slider.onchange = () => { sliderDragging = false; requestSpeed(parseFloat(slider.value)); };
$button('minus').onclick = () => stepSpeed(-speedStep());
$button('plus').onclick = () => stepSpeed(speedStep());
document.querySelectorAll<HTMLButtonElement>('.preset').forEach(b => {
  b.onclick = () => requestSpeed(fromSpeed(parseFloat(b.dataset.speed ?? '')));
});
$input('cap').onchange = () => void limitChanged();
$input('maxStep').onchange = maxStepChanged;
$<HTMLSelectElement>('hiddenMode').onchange = e => store.set(HIDDEN_MODE_KEY, (e.target as HTMLSelectElement).value);

$input('inclLevelsInput').oninput = e => {
  inclLevelCount = parseLevelCount((e.target as HTMLInputElement).value);
  store.set(INCLINE_LEVELS_KEY, String(inclLevelCount));
  renderLevelCountField();
  renderIncline();
};
$input('inclSlider').oninput = e => { $('inclTarget').textContent = t.incline.value(parseFloat((e.target as HTMLInputElement).value)); };
$input('inclSlider').onchange = e => void setIncline(parseFloat((e.target as HTMLInputElement).value));


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
    e.preventDefault(); stepSpeed(speedStep());
  } else if (tag !== 'INPUT' && e.key === 'ArrowDown') {
    e.preventDefault(); stepSpeed(-speedStep());
  }
});

onUnitsChange(u => {
  store.set(UNITS_STORAGE_KEY, u);
  retranslate();
});

onLanguageChange(() => {
  renderLimitFields();
  renderLevelCountField();
  renderInfo();
  renderRangeInfo();
  renderSpeed();
  renderIncline();
  renderStats();
  redrawChart();
  if (document.hidden && hiddenSince !== null) document.title = t.hidden.title;
});

// ---------- Init ----------
setStatus(() => t.connection.notConnected);
booted = true;
renderStage();
setupViews(v => {
  view = v;
  applyStopPlacement();
  history.setVisible(v === 'history');
  workouts.setVisible(v === 'workouts');
  routes.setVisible(v === 'routes');
  // The plan or the runs may have changed in another view
  if (v === 'training') { void routes.refreshGoal(); void workouts.reload(); }
});
loadSettings();
renderInfo();
renderIncline();
renderStats();
applyLimits();
redrawChart();
setInterval(() => { redrawChart(); recorder.tick(Date.now()); }, 1000);
new ResizeObserver(redrawChart).observe($('chart'));

const env = { ua: navigator.userAgent, hasApi: !!navigator.bluetooth, secure: isSecureContext, touchPoints: navigator.maxTouchPoints };
if (bluetoothSupportHint(env)) {
  bindText($('unsupportedTitle'), () => bluetoothSupportHint(env)?.title ?? '');
  bindText($('unsupportedText'), () => bluetoothSupportHint(env)?.text ?? '');
  $('unsupported').hidden = false;
  setStatus(() => t.connection.noWebBluetooth);
} else if (!desktop) {
  // Not in the desktop app: there, this would already trigger the macOS Bluetooth prompt at launch
  void webAdapter.availability().then(a => {
    if (!a.ok && a.reason === 'no-adapter') setStatus(() => t.connection.adapterOff);
  });
}
setUi(false);
setupPwa(connected);
setupDesktop({
  onGlobalStop: () => { if (connected()) { log(t.stop.globalShortcutLog); void doStop(() => t.stop.globalShortcut); } },
  onOpenPackage: f => void routes.openPackage(f),
  log,
});

if (!isDisclaimerAccepted(store.get(DISCLAIMER_STORAGE_KEY))) void ensureDisclaimer();
