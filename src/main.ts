import './style.css';
import { TreadmillClient, WebBluetoothAdapter, type BleAdapter, type TreadmillEvents } from './device/ble';
import { bluetoothSupportHint } from './ui/browser';
import { drawChart } from './ui/components/chart';
import { APP_VERSION } from './platform/config';
import { desktop, setupDesktop } from './ui/desktop';
import { choose, confirmDialog } from './ui/components/dialogs';
import type { Sample, TcxSport } from './core/history/export';
import { setupExportControls } from './ui/history/export-controls';
import {
  cmdPause, cmdRequestControl, cmdSetSpeed, cmdStart, cmdStop, describeMachineStatus, hex,
  OP, parseMachineStatus, parseTrainingStatus, type TreadmillData,
} from './core/protocol/ftms';
import { setupHistory } from './ui/history/history';
import { lang, onLanguageChange, retranslate, t, type Text } from './i18n/i18n';
import { routeDescription, routeName } from './core/routes/route-examples';
import { bindText, clearText, initLanguage } from './ui/i18n-dom';
import { setupMenu, setupPrefs } from './ui/settings/menus';
import { setupInterval } from './ui/workouts/interval-ui';
import { fmtDistance, fmtLength, fmtTime, ProgramRunner, programLength, type ProgramStep } from './core/training/program';
import { setupPwa } from './ui/pwa';
import type { RunSource, RunTag } from './core/history/runs';
import {
  beltMaybeRunning, checkConsoleCommand, controlAvailability, decideLimitChange, DISCLAIMER_STORAGE_KEY, DISCLAIMER_VERSION,
  effectiveMax as calcEffectiveMax, isDisclaimerAccepted, LEGACY_LIMIT_KEY, LIMIT_CONFIRM_ABOVE, LIMIT_MAX, LIMIT_MIN, LIMIT_STORAGE_KEY,
  loadLimit, MAX_STEP_MAX, MAX_STEP_MIN, MAX_STEP_STORAGE_KEY, parseHexBytes, parseMaxStep, RAMP_INTERVAL_MS,
  serializeLimit, SpeedGovernor, StandstillDetector,
} from './core/safety/safety';
import { ACTIVE_STORAGE_KEY, readActive, type Active } from './core/training/selection';
import { setupBackground } from './ui/background';
import { setupInclineCard } from './ui/live/incline-card';
import { renderInfo } from './ui/settings/info';
import { setupSettings } from './ui/settings/settings-ui';
import { SimulatorAdapter } from './device/sim';
import { initTheme, onThemeChange } from './ui/theme';
import { BeltBanner } from './core/safety/belt-banner';
import { $, $button, $input, log, store } from './ui/ui';
import { fromSpeed, onUnitsChange, parseUnits, setUnits, speedFromInput, speedPresets, speedStep, toDist, toSpeed, UNITS_STORAGE_KEY } from './i18n/units';
import { askBeforeStart } from './core/safety/quiet';
import { setupRoutes } from './ui/routes/route-ui';
import { setupViews, stopPlacement, type View } from './ui/views';
import { setupWorkouts } from './ui/workouts/workout-ui';

initTheme();
initLanguage();
// Units before anything is drawn
setUnits(parseUnits(store.get(UNITS_STORAGE_KEY)));

const now = () => performance.now();

// ---------- State ----------
const webAdapter = new WebBluetoothAdapter();
let sim: SimulatorAdapter | null = null;
let client: TreadmillClient | null = null;
let devMin = 1.0, devMax = 12.0;
let limit = 6;
/** Started by the app or according to Machine Status, and not stopped since */
let beltStarted = false;
/** The banner over the live figures: ready to start, stopping, not connected. Display only. */
const banner = new BeltBanner();
let lastMeasured: number | undefined;
/** When the speed was last reported (performance.now), to tell a fresh reading from an old one */
let lastMeasuredAt = 0;
let controlLost = false;
let sliderDragging = false;
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
settings.onDevMode(on => desktop?.setDevMode(on));
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
  // Only what the person has to know stays on screen; start, stop and progress are shown by the banner and the workout panel
  status: (text, attention) => { if (text && attention) bindText($('progStatus'), text); else clearText($('progStatus')); renderStage(); },
  log,
});

const incline = setupInclineCard({
  send: bytes => (client ? client.send(bytes) : Promise.resolve(false)),
  uiConnected: () => uiConnected,
});

// The tab goes to the background, the page is closed: keep the screen on while connected, warn or pause, save the run
const background = setupBackground({
  connected: () => connected(),
  maybeRunning: () => maybeRunning(),
  pause: reason => doPause(reason),
  tick: () => runner.tick(),
  flush: () => recorder.flush(),
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
    banner.speed(r.speed, now());
    lastMeasured = r.speed;
    lastMeasuredAt = now();
    governor.noteMeasured(r.speed);
    if (standstill.feed(r.speed, now()) && runner.active) {
      log(t.program.standstillLog);
      runner.abort(() => t.program.standstill, true);
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

/**
 * Start waits while the belt moves, a start was just sent or a program runs; Pause is there while the belt may be running.
 * Stop is not touched here: setUi enables it with the connection, and nothing takes it away (controlAvailability).
 */
function renderControls() {
  try {
    const a = controlAvailability({
      connected: connected(),
      measuredKmh: lastMeasured,
      measuredAgeMs: now() - lastMeasuredAt,
      startedByApp: beltStarted,
      startingNow: banner.state(now()).kind === 'start',
      programActive: runner.active,
    });
    $button('start').disabled = !a.start;
    $button('pause').disabled = !a.pause;
  } catch { /* display only */ }
}

/** Follows the banner state: kind, colour, text and how strong it is. Display only: nothing here may get in the way of a stop. */
function renderBanner() {
  try {
    const { kind, opacity } = banner.state(now());
    const el = $('beltBanner');
    el.hidden = kind === 'none';
    if (kind === 'none') return;
    el.className = `belt-banner ${kind === 'start' ? 'bb-start' : kind === 'offline' ? 'bb-offline' : 'bb-stop'}`;
    el.style.opacity = kind === 'offline' ? '' : String(opacity);
    $('bbText').textContent = kind === 'start' ? t.banner.start : kind === 'stopping' ? t.banner.stopping : kind === 'stopped' ? t.banner.stopped : t.connection.offlineHint;
  } catch { /* display only */ }
}

function renderStats() {
  const f = (v: number | undefined, digits: number) => (v === undefined ? '–' : t.number(v, digits));
  // Without a connection the current speed is unknown; do not leave the last value standing
  $('vSpeed').textContent = connected() ? f(cur.speed === undefined ? undefined : toSpeed(cur.speed), 1) : '–';
  $('vDist').textContent = f(cur.dist === undefined ? undefined : toDist(cur.dist), 2);
  $('vIncl').textContent = f(cur.incl, 1);
  $('statIncl').hidden = !incline.supportReported() && cur.incl === undefined;
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
      banner.stopRequested(now());
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

// ---------- Start / stop / program ----------
async function doStop(reason: Text = () => t.stop.stopped): Promise<boolean> {
  banner.stopRequested(now());
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
  banner.stopRequested(now());
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
  if (b) { beltStarted = true; banner.startRequested(now()); }
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
  // The label stays "Start" (a longer one does not fit the button); what it starts is the tooltip
  $('startLabel').textContent = t.control.start;
  $('start').title = kind === 'workout' ? t.program.start : kind === 'route' ? t.routes.walk : '';
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
    incline.reset();
    const info = await c.connect();

    if (info.speedRange) { devMin = info.speedRange.min; devMax = info.speedRange.max; }
    incline.onConnected(info, runSource === 'ble');
    renderStats();

    beltStarted = false; lastMeasured = undefined; controlLost = false;
    governor.reset();
    await background.acquireWakeLock();
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

function onDisconnected() {
  const wasRunning = maybeRunning();
  log(t.disconnect.log);
  runner.abort(() => t.disconnect.programEnded);
  governor.reset();
  standstill.disarm();
  background.releaseWakeLock();
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
  banner.setConnected(isConnected);
  renderBanner();
  document.documentElement.classList.toggle('connected', isConnected);
  applyStopPlacement();
  renderSettingsLock();
  $button('connect').disabled = isConnected || !$('unsupported').hidden;
  $button('demo').disabled = isConnected;
  $button('disconnect').disabled = !isConnected;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.needs-conn').forEach(el => { el.disabled = !isConnected; });
  renderControls();
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

setupExportControls(samples, redrawChart);

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
  renderInfo();
  renderRangeInfo();
  renderSpeed();
  incline.relabel();
  renderStats();
  redrawChart();
  background.relabel();
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
  // The chart is not drawn while it is hidden, so it is drawn now, before the first frame of the view
  if (v === 'training') { void routes.refreshGoal(); void workouts.reload(); redrawChart(); }
});
loadSettings();
renderInfo();
incline.render();
renderStats();
applyLimits();
redrawChart();
setInterval(() => { redrawChart(); recorder.tick(Date.now()); }, 1000);
setInterval(() => { renderBanner(); renderControls(); }, 100);
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
