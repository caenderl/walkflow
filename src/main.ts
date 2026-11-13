import './style.css';
import { bluetoothSupportHint } from './ui/browser';
import { desktop, setupDesktop } from './ui/desktop';
import type { TcxSport } from './core/history/export';
import { setupExportControls } from './ui/history/export-controls';
import { setupHistory } from './ui/history/history';
import { onLanguageChange, retranslate, t, type Text } from './i18n/i18n';
import { bindText, clearText, initLanguage } from './ui/i18n-dom';
import { setupMenu, setupPrefs } from './ui/settings/menus';
import { setupInterval } from './ui/workouts/interval-ui';
import { ProgramRunner } from './core/training/program';
import { setupPwa } from './ui/pwa';
import { setupInstall } from './ui/install';
import { COMMUNITY_ENABLED, STORE_BASE } from './platform/features';
import { setupBackground } from './ui/background';
import { setupCommunity } from './ui/community/community';
import { disclaimerAccepted, ensureDisclaimer } from './ui/disclaimer';
import { setupConnection } from './ui/live/connection';
import { makeConfirmStart } from './ui/live/confirm-start';
import { setupControls } from './ui/live/controls';
import { setupInclineCard } from './ui/live/incline-card';
import { setupConsole } from './ui/live/console';
import { newFigures, setupLiveData } from './ui/live/live-data';
import { setupReadout } from './ui/live/readout';
import { loadChosen, setupStage } from './ui/live/stage';
import { setupSpeedControls } from './ui/live/speed-controls';
import { renderInfo } from './ui/settings/info';
import { setupSettings } from './ui/settings/settings-ui';
import { setupTreadmillSettings } from './ui/settings/treadmill';
import { initTheme, onThemeChange } from './ui/theme';
import { BeltBanner } from './ui/live/belt-banner';
import { createTreadmill, MOVING_KMH } from 'ftms-treadmill';
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
/**
 * The treadmill: the connection, what is known about the belt, and everything that drives it (limit, ramp, start and stop,
 * standstill). The training view only asks it and draws what it says (ftms-treadmill, docs/ARCHITECTURE.md).
 */
const tm = createTreadmill();
/** The latest figures and the samples since the page was opened */
const figures = newFigures();
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
// The speed controls and the stored limits; the treadmill caps and ramps every speed
const speed = setupSpeedControls({
  tm,
  limitsChanged: () => workouts.refreshLimit(),
  limitSet: () => { readout.redrawChart(); treadmill.render(); },
});
// Settings → treadmill: the speeds of the slow/mid/run buttons
const treadmill = setupTreadmillSettings({ limit: speed.limit, presets: speed.presets, save: p => speed.setPresets(p) });
const effectiveMax = () => tm.state.effectiveMax;

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

// The route store: routes from the route-store repository, read from GitHub when the person opens the list (none without a repository)
const routeStore = setupRouteStore({ base: STORE_BASE, library: () => routes.libraryMarks(), take: (file, opts) => routes.takeFromStore(file, opts) });

// Routes and workouts that other devices share. It reads the library from the stores, so it needs nothing but the two views to reload.
// Not in this build unless it says so (platform/features.ts): then nothing of it is shown, set up or connected.
const community = COMMUNITY_ENABLED
  ? setupCommunity({ libraryChanged: () => { void workouts.reload(); void routes.reload(); } })
  : { libraryChanged() { /* no Community in this build */ } };
if (!COMMUNITY_ENABLED) document.querySelectorAll('[data-view="community"], .community-part').forEach(e => e.remove());

// Start, pause and stop. A reason is what a running program shows as its end; without one it shows what the treadmill says.
const belt = {
  start: () => tm.start(),
  stop: (reason?: Text) => { if (reason) runner.abort(reason); return tm.stop(); },
  pause: (reason?: Text) => { if (reason) runner.abort(reason); return tm.pause(); },
};

/** A Stop or Pause that did not get through although the treadmill is connected: the person has to stop the belt on the treadmill */
const stopFailed = (failed: boolean) => {
  $('stopAlarm').hidden = !failed;
  if (failed) { log(t.alarm.stopTitle); $('stopAlarm').scrollIntoView({ block: 'start' }); }
};
const runner = new ProgramRunner({
  start: belt.start,
  stop: () => belt.stop(),
  setTarget: kmh => { tm.setSpeed(kmh, { source: 'program' }); },
  currentTarget: () => tm.state.target,
  distance: () => figures.cur.dist,
  // Only what the person has to know stays on screen; start, stop and progress are shown by the banner and the workout panel
  status: (text, attention) => { if (text && attention) bindText($('progStatus'), text); else clearText($('progStatus')); stage.render(); },
  log,
});

// The question before a start (quiet mode skips it)
const confirmStart = makeConfirmStart(() => settings.quiet);

// What the training view shows and starts: the chosen workout or route
const stage = setupStage({
  chosen, workouts, routes, interval, runner, recorder, tm,
  connected: () => tm.state.connected, effectiveMax, confirmStart, redrawChart: () => readout.redrawChart(),
});

const incline = setupInclineCard({
  setIncline: pct => tm.setIncline(pct),
  uiConnected: () => connection.uiConnected(),
  now,
  levelsChanged: () => readout.renderStats(),
});
// The incline can only be set while the belt moves, and the card follows what the treadmill reports
tm.on('data', d => {
  const kmh = tm.state.lastMeasured;
  incline.beltMoving(kmh !== undefined && kmh >= MOVING_KMH);
  if (d.incl !== undefined) incline.reported(d.incl);
});
tm.on('disconnected', () => incline.beltMoving(false));

// The figures, the banner, the buttons and the chart (display only)
const readout = setupReadout({
  tm, figures, banner, now,
  inclineReported: () => incline.supportReported(),
  inclineWanted: () => incline.wanted(),
  inclineShowsLevels: () => incline.showsLevels(),
  inclineLevel: pct => incline.levelOf(pct),
});

// The tab goes to the background, the page is closed: keep the screen on while connected, warn or pause, save the run
const background = setupBackground({
  connected: () => tm.state.connected,
  maybeRunning: () => tm.state.maybeRunning,
  pause: reason => belt.pause(reason),
  tick: () => runner.tick(),
  flush: () => recorder.flush(),
});

// What the treadmill reports while connected
const live = setupLiveData({
  tm, figures, banner, runner, recorder, now, log, stopFailed,
  distance: meters => routes.update(meters),
  renderStats: readout.renderStats,
  redrawChart: readout.redrawChart,
});

// The settings are locked while the belt runs (the dialog itself checks this when it opens)
const renderSettingsLock = () => settings.setLocked(tm.state.connected && tm.state.maybeRunning);

const connection = setupConnection({
  tm, banner, runner, speed, incline, background, recorder, live, now,
  stop: reason => belt.stop(reason),
  renderStats: readout.renderStats,
  renderBanner: readout.renderBanner,
  renderControls: () => { readout.renderControls(); speed.renderPresets(); },
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

setupControls({ connected: () => tm.state.connected, runner, stage, belt, speed, confirmStart });

setupExportControls(figures.samples, readout.redrawChart);

setupConsole({ tm, confirmStart });

onUnitsChange(u => {
  store.set(UNITS_STORAGE_KEY, u);
  retranslate();
});

onLanguageChange(() => {
  speed.relabel();
  treadmill.render();
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
treadmill.render();
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
setupPwa(() => tm.state.connected);
// Settings → Info: install the web app as an app of its own (web build only)
setupInstall();
setupDesktop({
  onGlobalStop: () => { if (tm.state.connected) { log(t.stop.globalShortcutLog); void belt.stop(() => t.stop.globalShortcut); } },
  // A file opened from outside goes to the view that fits what is in it; anything else gets the routes' message
  onOpenPackage: f => void (f.text !== undefined && packageKind(f.text) === 'workout' ? workouts.openPackage(f) : routes.openPackage(f)),
  log,
});

if (!disclaimerAccepted()) void ensureDisclaimer();
