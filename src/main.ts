import './style.css';
import { bluetoothSupportHint } from './ui/browser';
import { desktop, setupDesktop } from './ui/desktop';
import type { TcxSport } from './core/history/export';
import { setupExportControls } from './ui/history/export-controls';
import { setupHistory } from './ui/history/history';
import { onLanguageChange, retranslate, t } from './i18n/i18n';
import { bindText, clearText, initLanguage } from './ui/i18n-dom';
import { setupMenu, setupPrefs } from './ui/settings/menus';
import { setupInterval } from './ui/workouts/interval-ui';
import { ProgramRunner } from './core/training/program';
import { setupPwa } from './ui/pwa';
import { StandstillDetector } from './core/safety/safety';
import { COMMUNITY_ENABLED, STORE_BASE } from './platform/features';
import { setupBackground } from './ui/background';
import { setupCommunity } from './ui/community/community';
import { disclaimerAccepted, ensureDisclaimer } from './ui/disclaimer';
import { setupBelt } from './ui/live/belt';
import { setupConnection } from './ui/live/connection';
import { makeConfirmStart } from './ui/live/confirm-start';
import { setupControls } from './ui/live/controls';
import { setupInclineCard } from './ui/live/incline-card';
import { setupConsole } from './ui/live/console';
import { setupLiveData } from './ui/live/live-data';
import { setupReadout } from './ui/live/readout';
import { Session } from './ui/live/session';
import { loadChosen, setupStage } from './ui/live/stage';
import { setupSpeedControls } from './ui/live/speed-controls';
import { renderInfo } from './ui/settings/info';
import { setupSettings } from './ui/settings/settings-ui';
import { initTheme, onThemeChange } from './ui/theme';
import { BeltBanner } from './core/safety/belt-banner';
import { $, $button, log } from './ui/ui';
import { store } from './ui/store';
import { packageKind } from './core/share/package-kind';
import { onUnitsChange, parseUnits, setUnits, UNITS_STORAGE_KEY } from './i18n/units';
import { setupRoutes } from './ui/routes/route-ui';
import { setupRouteStore } from './ui/routes/route-store';
import { setupViews } from './ui/views';
import { setupWorkouts } from './ui/workouts/workout-ui';

initTheme();
initLanguage();
// Units before anything is drawn
setUnits(parseUnits(store.get(UNITS_STORAGE_KEY)));

const now = () => performance.now();

// ---------- State ----------
/** The connection and what is known about the belt; shared by the modules of the training view */
const session = new Session();
const { samples } = session;
/** The banner over the live figures: ready to start, stopping, not connected. Display only. */
const banner = new BeltBanner();
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
  connected: () => session.connected(),
  now,
  limitsChanged: () => workouts.refreshLimit(),
  limitSet: () => readout.redrawChart(),
});
const governor = speed.governor;
const effectiveMax = () => speed.effectiveMax();

/** What the training view is about; the workouts and routes views ask for it while they are set up */
const chosen = loadChosen();
const workouts = setupWorkouts({
  maxSpeed: effectiveMax,
  useRoute: id => { routes.use(id); stage.setActive('route'); },
  useWorkout: () => stage.setActive('workout'),
  wanted: () => chosen.get() === 'workout',
  changed: () => { if (booted) { stage.render(); community.libraryChanged(); } },
});
const routes = setupRoutes({
  maxSpeed: effectiveMax,
  changed: () => { if (booted) { stage.render(); community.libraryChanged(); routeStore.refresh(); } },
  chosen: () => stage.setActive('route'),
  wanted: () => chosen.get() === 'route',
});

// The route store: routes from the project's repository, read from GitHub when the person opens the list (none without a repository)
const routeStore = setupRouteStore({ base: STORE_BASE, library: () => routes.libraryMarks(), take: (file, opts) => routes.takeFromStore(file, opts) });

// Routes and workouts that other devices share. It reads the library from the stores, so it needs nothing but the two views to reload.
// Not in this build unless it says so (platform/features.ts): then nothing of it is shown, set up or connected.
const community = COMMUNITY_ENABLED
  ? setupCommunity({ libraryChanged: () => { void workouts.reload(); void routes.reload(); } })
  : { libraryChanged() { /* no Community in this build */ } };
if (!COMMUNITY_ENABLED) document.querySelectorAll('[data-view="community"], .community-part').forEach(e => e.remove());

const standstill = new StandstillDetector();

// Start, pause and stop: the commands and what has to happen around them
/** A Stop or Pause that did not get through although the treadmill is connected: the person has to stop the belt on the treadmill */
const stopFailed = (failed: boolean) => {
  $('stopAlarm').hidden = !failed;
  if (failed) { log(t.alarm.stopTitle); $('stopAlarm').scrollIntoView({ block: 'start' }); }
};
const belt = setupBelt({
  session, banner, governor, standstill, now, log, stopFailed,
  abortRun: reason => runner.abort(reason),
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
});

const runner = new ProgramRunner({
  start: belt.start,
  stop: () => belt.stop(),
  setTarget: kmh => { governor.request(kmh); standstill.arm(); },
  currentTarget: () => governor.target,
  distance: () => session.cur.dist,
  // Only what the person has to know stays on screen; start, stop and progress are shown by the banner and the workout panel
  status: (text, attention) => { if (text && attention) bindText($('progStatus'), text); else clearText($('progStatus')); stage.render(); },
  log,
});

// The question before a start (quiet mode skips it)
const confirmStart = makeConfirmStart(() => settings.quiet);

// What the training view shows and starts: the chosen workout or route
const stage = setupStage({
  chosen, workouts, routes, interval, runner, recorder, governor, standstill,
  connected: () => session.connected(), effectiveMax, confirmStart, redrawChart: () => readout.redrawChart(),
});

const incline = setupInclineCard({
  send: bytes => session.send(bytes),
  uiConnected: () => connection.uiConnected(),
});

// The figures, the banner, the buttons and the chart (display only)
const readout = setupReadout({
  session, banner, now,
  programActive: () => runner.active,
  inclineReported: () => incline.supportReported(),
  effectiveMax,
  target: () => governor.target,
});

// The tab goes to the background, the page is closed: keep the screen on while connected, warn or pause, save the run
const background = setupBackground({
  connected: () => session.connected(),
  maybeRunning: () => session.maybeRunning(),
  pause: reason => belt.pause(reason),
  tick: () => runner.tick(),
  flush: () => recorder.flush(),
});

// What the treadmill reports while connected
const live = setupLiveData({
  session, banner, governor, standstill, runner, recorder, now, log, stopFailed,
  distance: meters => routes.update(meters),
  renderStats: readout.renderStats,
  redrawChart: readout.redrawChart,
});

// The settings are locked while the belt runs (the dialog itself checks this when it opens)
const renderSettingsLock = () => settings.setLocked(session.connected() && session.maybeRunning());

const connection = setupConnection({
  session, banner, governor, standstill, runner, speed, incline, background, recorder, live, now,
  events: live.events,
  stop: reason => belt.stop(reason),
  renderStats: readout.renderStats,
  renderBanner: readout.renderBanner,
  renderControls: readout.renderControls,
  renderSettingsLock,
});

// ---------- Events ----------
// The header menus never cover the controls (Start/Pause/Stop, ±)
const controls = () => [document.querySelector('.dock')];
const connMenu = setupMenu($button('statusBtn'), $('connMenu'), controls);
setupPrefs($('langOptions'), $('themeOptions'), $('paletteOptions'), $('unitsOptions'));
$button('openData').onclick = () => settings.open('data');
setInterval(renderSettingsLock, 500);
onLanguageChange(() => { settings.relabel(); stage.render(); });
onThemeChange(readout.redrawChart);

$button('connect').onclick = () => { connMenu.close(); void connection.connect('ble'); };
$button('demo').onclick = () => { connMenu.close(); void connection.connect('demo'); };
$button('disconnect').onclick = () => { connMenu.close(); void connection.disconnectClicked(); };
$button('openConn').onclick = () => { connMenu.open(); $button('connect').disabled ? $button('demo').focus() : $button('connect').focus(); };
$button('alarmAck').onclick = () => { $('alarm').hidden = true; };
$button('stopAlarmAck').onclick = () => { $('stopAlarm').hidden = true; };
$button('hiddenAck').onclick = () => { $('hiddenBanner').hidden = true; };
$button('simLoss').onclick = () => connection.simulator()?.simulateConnectionLoss();
$button('simKey').onclick = () => connection.simulator()?.pullSafetyKey();

setupControls({ connected: () => session.connected(), runner, stage, belt, speed, confirmStart });

setupExportControls(samples, readout.redrawChart);

setupConsole({
  session,
  governor,
  effectiveMax,
  confirmStart,
  abortRun: reason => runner.abort(reason),
  disarmStandstill: () => standstill.disarm(),
});

onUnitsChange(u => {
  store.set(UNITS_STORAGE_KEY, u);
  retranslate();
});

onLanguageChange(() => {
  speed.relabel();
  renderInfo();
  incline.relabel();
  readout.renderStats();
  readout.redrawChart();
  background.relabel();
});

// ---------- Init ----------
connection.setStatus(() => t.connection.notConnected);
booted = true;
stage.render();
setupViews(v => {
  connection.setView(v);
  history.setVisible(v === 'history');
  workouts.setVisible(v === 'workouts');
  routes.setVisible(v === 'routes');
  // The plan or the runs may have changed in another view
  // The chart is not drawn while it is hidden, so it is drawn now, before the first frame of the view
  if (v === 'training') { void routes.refreshGoal(); void workouts.reload(); readout.redrawChart(); }
});
speed.load();
renderInfo();
incline.render();
readout.renderStats();
speed.applyLimits();
readout.redrawChart();
setInterval(() => { readout.redrawChart(); recorder.tick(Date.now()); }, 1000);
setInterval(() => { readout.renderBanner(); readout.renderControls(); }, 100);
new ResizeObserver(readout.redrawChart).observe($('chart'));

const env = { ua: navigator.userAgent, hasApi: !!navigator.bluetooth, secure: isSecureContext, touchPoints: navigator.maxTouchPoints };
if (bluetoothSupportHint(env)) {
  bindText($('unsupportedTitle'), () => bluetoothSupportHint(env)?.title ?? '');
  bindText($('unsupportedText'), () => bluetoothSupportHint(env)?.text ?? '');
  $('unsupported').hidden = false;
  connection.setStatus(() => t.connection.noWebBluetooth);
} else if (!desktop) {
  // Not in the desktop app: there, this would already trigger the macOS Bluetooth prompt at launch
  void connection.availability().then(a => {
    if (!a.ok && a.reason === 'no-adapter') connection.setStatus(() => t.connection.adapterOff);
  });
}
connection.setUi(false);
setupPwa(() => session.connected());
setupDesktop({
  onGlobalStop: () => { if (session.connected()) { log(t.stop.globalShortcutLog); void belt.stop(() => t.stop.globalShortcut); } },
  // A file opened from outside goes to the view that fits what is in it; anything else gets the routes' message
  onOpenPackage: f => void (f.text !== undefined && packageKind(f.text) === 'workout' ? workouts.openPackage(f) : routes.openPackage(f)),
  log,
});

if (!disclaimerAccepted()) void ensureDisclaimer();
