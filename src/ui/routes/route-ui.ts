// Routes view and the route card in the training view. A route only shows where on the track you are: it follows the
// treadmill's own distance counter and never sends anything to the treadmill (no speed, no incline).
// Import reads the file on this device (src/core/routes/gpx.ts); what is saved has passed readRoute.

import { countryName } from '../../core/routes/country';
import { confirmDialog } from '../components/dialogs';
import { flagUrl } from './flags';
import { routeOutline } from '../../core/routes/map-geo';
import { overflowMenu } from '../components/overflow-menu';
import { serializeGpx } from '../../core/routes/gpx';
import { packageFileName, packageFromRoute, serializePackage } from '../../core/routes/route-package';
import { lang, onLanguageChange, t } from '../../i18n/i18n';
import { routeName } from '../../core/routes/route-text';
import { editedRoute } from '../../core/routes/route-edit';
import { safeFileName } from '../../core/routes/route-files';
import { createProfile, svgEl } from './route-profile';
import { backfillCountries } from './library-upkeep';
import { nextWaypoint, placeWaypoints, waypointText, type PlacedWaypoint } from '../../core/routes/route-waypoints';
import { buildDetail, describe, fillDetail, type Detail } from './route-detail';
import { buildEditor, type Editor, type EditorHost } from './route-editor';
import { setupRouteImport } from './route-import';
import { createMapSlot, mapStyles, pickStyle, type MapSlot } from './route-map';
import { onThemeChange } from '../theme';
import { fmtDistance, type ProgramStep } from '../../core/training/program';
import { getRouteStore, type RouteStore } from '../../data/route-store';
import {
  analyzeRoute, DistanceTracker, gradeAhead, minutesLeft, pointAt, readRoute,
  ROUTE_SPEED_MAX, ROUTE_SPEED_MIN, routeSpeed, walkSeconds, walkSteps, type Route, type RouteStats,
} from '../../core/routes/routes';
import { getRunStore } from '../../data/run-store';
import { COMMUNITY_ENABLED } from '../../platform/features';
import { $, $button, download } from '../ui';
import { button, el, iconButton } from '../components/elements';
import { store } from '../store';
import { getWorkoutStore } from '../../data/workout-store';
import { todayGoal, type DayGoal } from '../../core/training/workouts';

export const SELECTED_STORAGE_KEY = 'walkflow.route';
const MAP_STORAGE_KEY = 'walkflow.map';
/** How often the standing against today's goal is read again while data keeps coming in */
const GOAL_REFRESH_MS = 60_000;

export interface RoutesHost {
  /** Effective speed limit in km/h: the estimate is made at the speed the belt will really run */
  maxSpeed(): number;
  /** The route or the map switch changed: the training view decides what its main element is */
  changed(): void;
  /** "Use" was pressed: the training view is about this route now */
  chosen(): void;
  /** True while the training view is about a route (and not about a workout or free training) */
  wanted(): boolean;
}

export function setupRoutes(host: RoutesHost) {
  const ready: Promise<RouteStore> = getRouteStore();
  const tracker = new DistanceTracker();
  const trainingProfile = createProfile($('routeProfile'));
  let visible = false;
  let routes: Route[] = [];
  let persistent = true;
  let selectedId = store.get(SELECTED_STORAGE_KEY) ?? '';
  /** Analysed once per selection, not on every update from the treadmill */
  let analysed: { route: Route; stats: RouteStats } | null = null;
  let goal: DayGoal | null = null;
  let goalAt = 0;

  const selectedRoute = () => routes.find(r => r.id === selectedId) ?? null;
  /** The chosen route, but only while the training view is about a route */
  const trainingRoute = () => (host.wanted() ? analysed : null);

  // ---------- Map ----------
  // The map belongs to the route. In the training view it is the main element once it is switched on (the choice is
  // kept); in the routes view a route in the library can be opened to show it. Nothing is loaded before one of the two.
  let mapOn = mapStyles !== null && store.get(MAP_STORAGE_KEY) === '1';
  const training = { slot: null as MapSlot | null, toggle: $button('routeMapToggle'), note: $('routeMapNote'), problem: null as string | null };
  if (mapStyles) {
    training.slot = createMapSlot($('routeMap'), pickStyle, message => { training.problem = message; renderMaps(); });
    training.slot.setEnabled(mapOn);
    training.toggle.onclick = () => setMapOn(!mapOn);
  }

  function renderMaps() {
    training.toggle.hidden = !trainingRoute() || !mapStyles;
    training.toggle.textContent = mapOn ? t.routes.mapHide : t.routes.mapShow;
    training.toggle.setAttribute('aria-pressed', String(mapOn));
    const problem = mapOn ? training.problem : null;
    training.note.hidden = !problem;
    training.note.textContent = problem ?? '';
  }

  function setMapOn(on: boolean) {
    mapOn = on;
    store.set(MAP_STORAGE_KEY, on ? '1' : '0');
    training.slot?.setEnabled(on);
    renderMaps();
    host.changed();
  }

  function select(id: string) {
    selectedId = id;
    store.set(SELECTED_STORAGE_KEY, id);
    const route = selectedRoute();
    analysed = route ? { route, stats: analyzeRoute(route) } : null;
    // A new route starts at its beginning, wherever the counter is now
    tracker.reset();
    renderAll();
  }

  // ---------- Training view ----------
  /** How long the route takes at the speed the belt will really run (the limit caps it) */
  function walkMinutes(route: Route, stats: RouteStats): { min: number; kmh: number } {
    const kmh = Math.min(routeSpeed(route), host.maxSpeed());
    return { min: Math.max(1, Math.round(walkSeconds(stats.total, kmh) / 60)), kmh };
  }

  /** What the route means for today's goal, and a note when the limit caps the speed */
  function renderEstimate() {
    const shown = trainingRoute();
    if (!shown) { $('routeEstimate').textContent = ''; return; }
    const { route, stats } = shown;
    const max = host.maxSpeed();
    const sec = walkSeconds(stats.total, Math.min(routeSpeed(route), max));
    const left = goal?.leftMin ?? 0;
    $('routeEstimate').textContent = [
      ...(routeSpeed(route) > max ? [t.program.capped(max)] : []),
      ...(!goal ? [] : left === 0 ? [t.routes.goalDone] : sec / 60 >= left ? [t.routes.goalCompletes(left)] : [t.routes.goalLeft(left)]),
    ].join(' ');
  }

  /** Reads the plan and the saved runs again. Display only, so a failure just leaves the old text. */
  async function refreshGoal() {
    goalAt = Date.now();
    try {
      const plan = await (await getWorkoutStore()).plan();
      goal = plan ? todayGoal(plan, await (await getRunStore()).list(), Date.now()) : null;
    } catch { goal = null; }
    renderEstimate();
  }

  /** The waypoints of the route in the training view, placed along it once (not at every update from the treadmill) */
  let placedFor: { route: Route; placed: PlacedWaypoint[] } | null = null;
  /** Within this distance the text of the next waypoint is shown as well as its name */
  const WAYPOINT_TEXT_AHEAD = 150;

  /** The next waypoint and how far it is, from the route and the metres walked; display only */
  function renderNextWaypoint(route: Route, stats: RouteStats, covered: number, done: boolean) {
    const box = $('routeWaypoint');
    if (placedFor?.route !== route) placedFor = { route, placed: placeWaypoints(route, stats) };
    const next = done ? null : nextWaypoint(placedFor.placed, covered);
    box.hidden = !next;
    if (!next) return;
    const text = next.ahead <= WAYPOINT_TEXT_AHEAD ? waypointText(next.waypoint.text, lang) : undefined;
    box.replaceChildren(
      el('div', { className: 'rw-next', textContent: t.routes.waypointNext(waypointText(next.waypoint.name, lang) ?? '', fmtDistance(next.ahead)) }),
      ...(text ? [el('div', { className: 'hint', textContent: text })] : []),
    );
  }

  function renderProgress() {
    const live = $('routeLive');
    const shown = trainingRoute();
    live.hidden = $('routeProgress').hidden = !shown;
    if (!shown) { training.slot?.mark(null); return; }
    const { route, stats } = shown;
    const pos = pointAt(route, stats, tracker.covered);
    const bar = $<HTMLProgressElement>('routeBar');
    bar.value = Math.round(pos.fraction * 1000);
    bar.setAttribute('aria-label', t.routes.progressLabel);
    $('routeText').textContent = pos.done
      ? t.routes.finished
      : [t.routes.progress(pos.meters, stats.total), t.routes.remaining(fmtDistance(stats.total - pos.meters)), t.routes.timeLeft(minutesLeft(stats.total - pos.meters, Math.min(routeSpeed(route), host.maxSpeed())))].join(' · ');
    const grade = pos.done ? undefined : gradeAhead(route, stats, pos.meters);
    $('routeDetail').textContent = pos.ele === undefined
      ? t.routes.noElevation
      : [t.routes.elevation(pos.ele), ...(grade === undefined ? [] : [t.routes.grade(grade)])].join(' · ');
    renderNextWaypoint(route, stats, pos.meters, pos.done);
    trainingProfile.mark(stats.hasElevation ? pos.fraction : null);
    training.slot?.mark({ lat: pos.lat, lon: pos.lon });
  }

  /** From the live data of the treadmill (distance in metres) */
  function update(distance: number | undefined) {
    // Runs inside the handler for treadmill data: whatever goes wrong here must not reach the control path
    try {
      tracker.update(distance);
      if (trainingRoute()) renderProgress();
      if (trainingRoute() && Date.now() - goalAt >= GOAL_REFRESH_MS) void refreshGoal();
    } catch { /* display only */ }
  }

  // ---------- Routes view ----------

  // ---------- Walking speed and description of a route ----------
  let editor: Editor | null = null;
  const editorHost = (id: string): EditorHost => ({ save: () => void saveEditor(id), cancel: () => { editor = null; renderList(); } });

  async function saveEditor(id: string) {
    const route = routes.find(r => r.id === id);
    if (!editor || editor.id !== id || !route) return;
    const result = editedRoute(route, { speed: editor.speed.value, description: editor.text.value }, lang);
    if (!result.ok) {
      if (result.reason === 'speed') editor.status.textContent = t.routes.speedInvalid(ROUTE_SPEED_MIN, ROUTE_SPEED_MAX);
      return;
    }
    const next = result.route;
    try { await (await ready).put(next); } catch (e) { editor.status.textContent = t.routes.failed(String(e)); return; }
    editor = null;
    await reload();
  }

  // ---------- Routes view: the library, one route can be opened to show its map, profile and figures ----------
  let detail: Detail | null = null;

  function closeDetail() {
    detail?.slot?.setEnabled(false);
    if (editor && editor.id === detail?.id) editor = null;
    detail = null;
  }

  function toggleDetail(r: Route) {
    if (detail?.id === r.id) closeDetail(); else { closeDetail(); detail = buildDetail(r.id); }
    renderList();
  }

  /** The shape of the route, drawn from its points (no map, nothing is requested) */
  function outlineEl(r: Route): SVGSVGElement {
    const { d, start } = routeOutline(r.points, 64, 7);
    const svg = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' }, 'rt-outline');
    svg.append(svgEl('path', { d }, 'rt-outline-line'), svgEl('circle', { cx: start[0], cy: start[1], r: 3.2 }, 'rt-outline-start'));
    return svg;
  }

  function renderList() {
    $('rtEmpty').hidden = routes.length > 0;
    $('rtStorage').hidden = persistent;
    $('rtStorage').textContent = t.routes.memoryOnly;
    // A route that was deleted closes its details and its editor
    if (detail && !routes.some(r => r.id === detail!.id)) closeDetail();
    if (editor && !routes.some(r => r.id === editor!.id)) editor = null;
    $('rtList').replaceChildren(...routes.map(r => {
      const stats = r.id === analysed?.route.id ? analysed.stats : analyzeRoute(r);
      const open = detail?.id === r.id;
      const toggle = iconButton('chevron', open ? (mapStyles ? t.routes.mapHide : t.routes.detailsHide) : (mapStyles ? t.routes.mapShow : t.routes.detailsShow), () => toggleDetail(r));
      toggle.setAttribute('aria-expanded', String(open));
      const flag = r.country ? flagUrl(r.country) : null;
      const kmh = routeSpeed(r);
      const minutes = Math.max(1, Math.round(walkSeconds(stats.total, kmh) / 60));
      const use = iconButton('walkflow', t.routes.use, () => { select(r.id); host.chosen(); location.hash = ''; });
      use.classList.add('primary');
      const item = el('li', { className: 'wk-item rt-item' },
        outlineEl(r),
        el('div', { className: 'wk-info' },
          el('div', { className: 'wk-name' },
            ...(flag ? [el('img', { className: 'flag', src: flag, alt: countryName(r.country!, lang), title: countryName(r.country!, lang) })] : []), routeName(r, lang),
            ...(r.id === selectedId && host.wanted() ? [' ', el('span', { className: 'badge rec', textContent: t.routes.useHint })] : []),
            ...(COMMUNITY_ENABLED && r.shared ? [' ', el('span', { className: 'badge', textContent: t.community.sharedBadge })] : [])),
          el('div', { className: 'rt-meta' },
            el('span', { className: 'rt-length', textContent: fmtDistance(stats.total) }),
            el('span', { className: 'hint', textContent: t.routes.duration(minutes, kmh) }),
            ...(stats.hasElevation ? [el('span', { className: 'hint', textContent: t.routes.climb(stats.ascent, stats.descent) })] : [])),
          // Two lines in the list; the whole text is in the opened details
          ...(open ? [] : describe(r, 'rt-desc hint', 'div'))),
        el('div', { className: 'wk-actions' },
          use,
          toggle,
          overflowMenu(t.routes.moreActions, [
            { icon: 'route', label: t.routes.export, run: () => download(serializeGpx(r), 'application/gpx+xml', safeFileName(r.name)) },
            ...(COMMUNITY_ENABLED ? [{ icon: 'share' as const, label: r.shared ? t.community.unshare : t.community.share, run: () => void toggleShare(r) }] : []),
            { icon: 'package', label: t.routes.exportPackage, run: () => download(serializePackage(packageFromRoute(r)), 'application/json', packageFileName(r.name)) },
            { icon: 'trash', label: t.routes.delete, run: () => void remove(r), danger: true },
          ])),
      );
      if (open && detail) {
        item.append(detail.el);
        fillDetail(detail, r, stats, editor?.id === r.id ? editor.el : null, () => { editor = buildEditor(r, editorHost(r.id)); renderList(); });
      }
      return item;
    }));
  }

  let statusText: (() => string) | null = null;
  function setStatus(text: (() => string) | null) {
    statusText = text;
    $('rtStatus').textContent = text ? text() : '';
  }

  /** Sharing with the community is the person's choice for each route, and asked about the first time: a route shows where it is */
  async function toggleShare(r: Route) {
    if (!r.shared && !(await confirmDialog(t.community.shareRouteTitle, [t.community.shareRouteText(routeName(r, lang))], t.community.shareConfirm))) return;
    const { shared: _was, ...rest } = r;
    try { await (await ready).put(r.shared ? rest : { ...r, shared: true }); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await reload();
    setStatus(() => (r.shared ? t.community.shareStopped : t.community.shareStarted));
  }

  async function remove(r: Route) {
    if (!(await confirmDialog(t.routes.deleteTitle, [t.routes.deleteText(routeName(r, lang))], t.routes.delete, 'stop'))) return;
    try { await (await ready).delete(r.id); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await reload();
  }

  const importer = setupRouteImport({
    store: () => ready,
    setStatus,
    added: async route => { await reload(); select(route.id); },
  });
  const { importFile, openPackage } = importer;

  // ---------- Loading ----------
  async function reload() {
    const s = await ready;
    persistent = s.persistent;
    await backfillCountries(s);
    routes = await s.list();
    // A route that no longer exists is no selection
    if (selectedId && !selectedRoute()) selectedId = '';
    const route = selectedRoute();
    // Keep the progress when the same route is still selected (a reload does not restart the walk)
    const same = route?.id === analysed?.route.id;
    analysed = route ? { route, stats: analyzeRoute(route) } : null;
    if (!same) tracker.reset();
    renderAll();
  }

  function renderAll() {
    renderList();
    renderEstimate();
    if (statusText) $('rtStatus').textContent = statusText();
    trainingProfile.draw(analysed);
    renderProgress();
    training.slot?.setRoute(trainingRoute()?.route ?? null);
    renderMaps();
    host.changed();
  }

  // ---------- Events ----------
  $button('routeRestart').onclick = () => { tracker.reset(); renderProgress(); };
  const fileInput = $<HTMLInputElement>('rtFile');
  $button('rtImport').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importFile(file);
  };
  onLanguageChange(renderAll);
  const rebuildMaps = () => { training.slot?.rebuild(); detail?.slot?.rebuild(); };
  onLanguageChange(rebuildMaps);
  onThemeChange(rebuildMaps);

  void reload();
  void refreshGoal();

  return {
    update,
    openPackage,
    takeFromStore: importer.takeFromStore,
    /** What of the library came from the route store, to tell what is new there and what can be updated */
    libraryMarks: () => routes.map(({ id, storeFile, revision }) => ({ id, storeFile, revision })),
    /** The route chosen for the training view, with a line about its length and duration; null if none is chosen */
    current(): { route: Route; info: string } | null {
      if (!analysed) return null;
      const { min, kmh } = walkMinutes(analysed.route, analysed.stats);
      return { route: analysed.route, info: `${fmtDistance(analysed.stats.total)} · ${t.routes.duration(min, kmh)}` };
    },
    /** The walk the Start button begins: the route as one distance step at its own speed; null if that is not possible */
    walkRequest(): { route: Route; steps: ProgramStep[]; kmh: number } | null {
      if (!analysed) return null;
      const kmh = routeSpeed(analysed.route);
      const steps = walkSteps(analysed.stats, kmh);
      return steps ? { route: analysed.route, steps, kmh } : null;
    },
    /** The training view's choice changed (workout, route or none): show or hide what belongs to the route */
    refresh: renderAll,
    /** The training view is about a route and the map is on: the map is its main element */
    mapActive: () => mapOn && trainingRoute() !== null,
    /** Choose a route from outside (the plan's suggestion); the one that is already selected keeps its progress */
    use(id: string) { if (id !== selectedId) select(id); },
    /** A walk starts: the route begins at its start, wherever the counter is now */
    restart() { tracker.reset(); renderProgress(); },
    /** A run was saved: today's goal may have moved */
    refreshGoal,
    setVisible(on: boolean) {
      const was = visible;
      visible = on;
      if (on && !was) void reload();
    },
    /** After a backup restore */
    reload,
  };
}
