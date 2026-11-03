import './style.css';
import { TreadmillClient, WebBluetoothAdapter, type BleAdapter, type TreadmillEvents } from './device/ble';
import { bluetoothSupportHint } from './ui/browser';
import { drawChart } from './ui/components/chart';
import { APP_VERSION } from './platform/config';
import { desktop, setupDesktop } from './ui/desktop';
import { choose, confirmDialog } from './ui/components/dialogs';
import type { TcxSport } from './core/history/export';
import { setupExportControls } from './ui/history/export-controls';
import { cmdPause, cmdRequestControl, cmdStart, cmdStop, describeMachineStatus, hex, parseMachineStatus, parseTrainingStatus, type TreadmillData } from './core/protocol/ftms';
import { setupHistory } from './ui/history/history';
import { onLanguageChange, retranslate, t, type Text } from './i18n/i18n';
import { bindText, clearText, initLanguage } from './ui/i18n-dom';
import { setupMenu, setupPrefs } from './ui/settings/menus';
import { setupInterval } from './ui/workouts/interval-ui';
import { fmtTime, ProgramRunner } from './core/training/program';
import { setupPwa } from './ui/pwa';
import type { RunSource } from './core/history/runs';
import { controlAvailability, DISCLAIMER_STORAGE_KEY, DISCLAIMER_VERSION, isDisclaimerAccepted, StandstillDetector } from './core/safety/safety';
import { setupBackground } from './ui/background';
import { setupInclineCard } from './ui/live/incline-card';
import { setupConsole } from './ui/live/console';
import { Session } from './ui/live/session';
import { loadChosen, setupStage } from './ui/live/stage';
import { setupSpeedControls } from './ui/live/speed-controls';
import { renderInfo } from './ui/settings/info';
import { setupSettings } from './ui/settings/settings-ui';
import { SimulatorAdapter } from './device/sim';
import { initTheme, onThemeChange } from './ui/theme';
import { BeltBanner } from './core/safety/belt-banner';
import { $, $button, log } from './ui/ui';
import { store } from './ui/store';
import { packageKind } from './core/share/package-kind';
import { onUnitsChange, parseUnits, setUnits, toDist, toSpeed, UNITS_STORAGE_KEY } from './i18n/units';
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
/** The connection and what is known about the belt; shared by the modules of the training view */
const session = new Session();
const { cur, samples } = session;
/** The banner over the live figures: ready to start, stopping, not connected. Display only. */
const banner = new BeltBanner();
let lastSample = 0;
let runSource: RunSource = 'ble';
let view: View = 'training';
let uiConnected = false;
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
// The speed and its limits; it owns the governor, the only sender of speed commands
const speed = setupSpeedControls({
  send: bytes => session.send(bytes),
  connected: () => connected(),
  now,
  limitsChanged: () => workouts.refreshLimit(),
  limitSet: () => redrawChart(),
});
const governor = speed.governor;
function effectiveMax() { return speed.effectiveMax(); }

/** What the training view is about; the workouts and routes views ask for it while they are set up */
const chosen = loadChosen();
const workouts = setupWorkouts({
  maxSpeed: () => effectiveMax(),
  useRoute: id => { routes.use(id); stage.setActive('route'); },
  useWorkout: () => stage.setActive('workout'),
  wanted: () => chosen.get() === 'workout',
  changed: () => { if (booted) stage.render(); },
});
const routes = setupRoutes({
  maxSpeed: () => effectiveMax(),
  changed: () => { if (booted) stage.render(); },
  chosen: () => stage.setActive('route'),
  wanted: () => chosen.get() === 'route',
});

const connected = () => session.connected();
const maybeRunning = () => session.maybeRunning();

const standstill = new StandstillDetector();

const runner = new ProgramRunner({
  start: doStart,
  stop: () => doStop(),
  setTarget: kmh => { governor.request(kmh); standstill.arm(); },
  currentTarget: () => governor.target,
  distance: () => cur.dist,
  // Only what the person has to know stays on screen; start, stop and progress are shown by the banner and the workout panel
  status: (text, attention) => { if (text && attention) bindText($('progStatus'), text); else clearText($('progStatus')); stage.render(); },
  log,
});

// What the training view shows and starts: the chosen workout or route
const stage = setupStage({ chosen, workouts, routes, interval, runner, recorder, governor, standstill, connected, effectiveMax, confirmStart, redrawChart });

const incline = setupInclineCard({
  send: bytes => session.send(bytes),
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
    session.lastMeasured = r.speed;
    session.lastMeasuredAt = now();
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
      measuredKmh: session.lastMeasured,
      measuredAgeMs: now() - session.lastMeasuredAt,
      startedByApp: session.beltStarted,
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
  $('sbState').textContent = (session.lastMeasured ?? 0) > 0 ? t.stopBar.running : t.stopBar.idle;
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
      session.beltStarted = false;
      if (runner.active) runner.abort(() => t.program.endedBy(describeMachineStatus(e)));
      governor.reset();
      standstill.disarm();
      break;
    case 'started':
      session.beltStarted = true;
      break;
    case 'control-lost':
      session.controlLost = true;
      log(t.machine.controlLostLog);
      break;
    default:
      break;
  }
}

function redrawChart() {
  drawChart($<HTMLCanvasElement>('chart'), samples, { now: Date.now(), limit: effectiveMax(), target: governor.target ?? 0 });
}

// ---------- Start / stop / program ----------
async function doStop(reason: Text = () => t.stop.stopped): Promise<boolean> {
  banner.stopRequested(now());
  runner.abort(reason);
  governor.reset();
  standstill.disarm();
  const c = session.client;
  if (!c) return false;
  let ok: boolean;
  if (session.controlLost) {
    void c.send(cmdRequestControl(), { urgent: true });
    ok = await c.send(cmdStop());
  } else {
    ok = await c.send(cmdStop(), { urgent: true });
  }
  if (ok) session.beltStarted = false;
  return ok;
}

async function doPause(reason: Text = () => t.stop.paused): Promise<boolean> {
  banner.stopRequested(now());
  runner.abort(reason);
  governor.reset();
  standstill.disarm();
  const c = session.client;
  if (!c) return false;
  const ok = await c.send(cmdPause(), { urgent: true });
  if (ok) session.beltStarted = false;
  return ok;
}

async function doStart(): Promise<boolean> {
  const c = session.client;
  if (!c) return false;
  governor.reset();
  standstill.disarm();
  const a = await c.send(cmdRequestControl());
  if (a) session.controlLost = false;
  const b = await c.send(cmdStart());
  if (b) { session.beltStarted = true; banner.startRequested(now()); }
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
    session.client = c;
    runSource = kind === 'demo' ? 'demo' : 'ble';
    speed.setDeviceRange(1.0, 12.0);
    incline.reset();
    const info = await c.connect();

    if (info.speedRange) speed.setDeviceRange(info.speedRange.min, info.speedRange.max);
    incline.onConnected(info, runSource === 'ble');
    renderStats();

    session.forgetBelt();
    governor.reset();
    await background.acquireWakeLock();
    speed.applyLimits();
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
      session.client = null;
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
  session.client = null;
  session.forgetBelt();
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
  if (!session.client) return;
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
        const force = await confirmDialog(t.disconnect.stillMovingTitle, [t.disconnect.stillMovingText(session.lastMeasured)], t.disconnect.force);
        if (!force) return;
      }
    }
  }
  session.client?.disconnect();
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

// ---------- Events ----------
// The header menus never cover the controls (Start/Pause/Stop, ±)
const controls = () => [document.querySelector('.dock')];
const connMenu = setupMenu($button('statusBtn'), $('connMenu'), controls);
setupPrefs($('langOptions'), $('themeOptions'), $('unitsOptions'));
$button('openData').onclick = () => settings.open('data');
// The belt runs: settings are locked (the dialog itself checks this when it opens)
const renderSettingsLock = () => settings.setLocked(connected() && maybeRunning());
setInterval(renderSettingsLock, 500);
onLanguageChange(() => { settings.relabel(); stage.render(); });
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
  const kind = stage.effectiveActive();
  if (kind === 'workout') { await stage.runProgram(); return; }
  if (kind === 'route') { await stage.runRoute(); return; }
  if (!(await confirmStart())) return;
  if (connected()) await doStart();
};
$button('shClear').onclick = () => stage.setActive(null);
$button('pause').onclick = () => void doPause();
$button('stop').onclick = () => void doStop();

setupExportControls(samples, redrawChart);

setupConsole({
  session,
  governor,
  effectiveMax,
  confirmStart,
  abortRun: reason => runner.abort(reason),
  disarmStandstill: () => standstill.disarm(),
});

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
    e.preventDefault(); speed.step(1);
  } else if (tag !== 'INPUT' && e.key === 'ArrowDown') {
    e.preventDefault(); speed.step(-1);
  }
});

onUnitsChange(u => {
  store.set(UNITS_STORAGE_KEY, u);
  retranslate();
});

onLanguageChange(() => {
  speed.relabel();
  renderInfo();
  incline.relabel();
  renderStats();
  redrawChart();
  background.relabel();
});

// ---------- Init ----------
setStatus(() => t.connection.notConnected);
booted = true;
stage.render();
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
speed.load();
renderInfo();
incline.render();
renderStats();
speed.applyLimits();
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
  // A file opened from outside goes to the view that fits what is in it; anything else gets the routes' message
  onOpenPackage: f => void (f.text !== undefined && packageKind(f.text) === 'workout' ? workouts.openPackage(f) : routes.openPackage(f)),
  log,
});

if (!isDisclaimerAccepted(store.get(DISCLAIMER_STORAGE_KEY))) void ensureDisclaimer();
