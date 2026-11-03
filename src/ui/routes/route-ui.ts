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
import { descriptionAfterEdit, routeDescription, routeName } from '../../core/routes/route-examples';
import { safeFileName } from '../../core/routes/route-files';
import { createProfile, svgEl } from './route-profile';
import { backfillCountries, seedExamples } from './library-upkeep';
import { setupRouteImport } from './route-import';
import { createMapSlot, type MapSlot } from './route-map';
import { isDark, onThemeChange } from '../theme';
import { fromSpeed, toSpeed } from '../../i18n/units';
import { fmtDistance, type ProgramStep } from '../../core/training/program';
import { getRouteStore, type RouteStore } from '../../data/route-store';
import {
  analyzeRoute, DistanceTracker, gradeAhead, minutesLeft, newRouteId, pointAt, readRoute, ROUTE_DESCRIPTION_MAX, ROUTE_NAME_MAX,
  ROUTE_SPEED_MAX, ROUTE_SPEED_MIN, routeSpeed, walkSeconds, walkSteps, type Route, type RouteStats,
} from '../../core/routes/routes';
import { getRunStore } from '../../data/run-store';
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
  const mapStyles = __MAP_STYLES__;
  /** The style for the current theme */
  const pickStyle = () => { const dark = isDark(); return { url: dark ? mapStyles!.dark : mapStyles!.light, dark }; };
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
  interface Editor { id: string; el: HTMLElement; speed: HTMLInputElement; text: HTMLTextAreaElement; status: HTMLElement }
  let editor: Editor | null = null;

  function buildEditor(r: Route): Editor {
    // Stored in km/h, typed and shown in the units of the settings
    const shown = (kmh: number) => String(Math.round(toSpeed(kmh) * 100) / 100);
    const speed = el('input', { type: 'number', min: shown(ROUTE_SPEED_MIN), max: shown(ROUTE_SPEED_MAX), step: '0.1', value: shown(routeSpeed(r)) });
    speed.setAttribute('inputmode', 'decimal');
    const text = el('textarea', { maxLength: ROUTE_DESCRIPTION_MAX, rows: 3, placeholder: t.routes.descriptionPlaceholder, value: routeDescription(r, lang)?.text ?? '' });
    const status = el('p', { className: 'hint' });
    status.setAttribute('role', 'status');
    const save = button(t.routes.save, () => void saveEditor(r.id));
    save.classList.add('primary');
    const root = el('div', { className: 'rt-edit grid' },
      el('label', { className: 'hint field' }, el('span', { textContent: t.routes.speed }), speed),
      el('label', { className: 'hint field' }, el('span', { textContent: t.routes.description }), text),
      el('div', { className: 'row' }, save, button(t.common.cancel, () => { editor = null; renderList(); })),
      status);
    return { id: r.id, el: root, speed, text, status };
  }

  async function saveEditor(id: string) {
    const route = routes.find(r => r.id === id);
    if (!editor || editor.id !== id || !route) return;
    // An empty field means "no speed of its own": the app's default is used
    const raw = editor.speed.value.trim().replace(',', '.');
    const kmh = raw ? Math.round(fromSpeed(Number(raw)) * 100) / 100 : undefined;
    if (kmh !== undefined && !(kmh >= ROUTE_SPEED_MIN && kmh <= ROUTE_SPEED_MAX)) { editor.status.textContent = t.routes.speedInvalid(ROUTE_SPEED_MIN, ROUTE_SPEED_MAX); return; }
    const next = readRoute({ ...route, defaultSpeed: kmh, description: undefined, example: undefined, texts: undefined, ...descriptionAfterEdit(route, editor.text.value, lang) });
    if (!next) return;
    try { await (await ready).put(next); } catch (e) { editor.status.textContent = t.routes.failed(String(e)); return; }
    editor = null;
    await reload();
  }

  // ---------- Routes view: the library, one route can be opened to show its map, profile and figures ----------
  interface Detail { id: string; el: HTMLElement; profile: ReturnType<typeof createProfile>; noEle: HTMLElement; facts: HTMLElement; problem: HTMLElement; top: HTMLElement; slot: MapSlot | null }
  let detail: Detail | null = null;

  function buildDetail(id: string): Detail {
    const profileBox = el('div', { className: 'profile' });
    const noEle = el('p', { className: 'hint' });
    const mapBox = el('div', { className: 'route-map', role: 'region' });
    const problem = el('p', { className: 'hint' });
    problem.hidden = true;
    const facts = el('dl', { className: 'records' });
    // Walking speed and description (or their editor) at the top of the right column
    const top = el('div', { className: 'rt-top' });
    // Map on the left, what there is to know about the route on the right; one column when there is no map or little room
    const info = el('div', { className: 'rt-info' }, top, profileBox, facts, noEle);
    const root = el('div', { className: `rt-detail${mapStyles ? ' with-map' : ''}` },
      ...(mapStyles ? [el('div', { className: 'rt-map-col' }, mapBox, problem)] : []), info);
    const slot = mapStyles ? createMapSlot(mapBox, pickStyle, message => { problem.textContent = message ?? ''; problem.hidden = !message; }) : null;
    slot?.setEnabled(true);
    return { id, el: root, profile: createProfile(profileBox), noEle, facts, problem, top, slot };
  }

  function closeDetail() {
    detail?.slot?.setEnabled(false);
    if (editor && editor.id === detail?.id) editor = null;
    detail = null;
  }

  function toggleDetail(r: Route) {
    if (detail?.id === r.id) closeDetail(); else { closeDetail(); detail = buildDetail(r.id); }
    renderList();
  }

  /** The description as an element (none without one); the lang attribute is set when the text is in a language we know */
  function describe(r: Route, className: string, tag: 'p' | 'div' = 'p'): HTMLElement[] {
    const d = routeDescription(r, lang);
    if (!d) return [];
    const e = el(tag, { className, textContent: d.text });
    if (d.lang) e.lang = d.lang;
    return [e];
  }

  /** Walking speed and description as text, with the icon that opens the editor */
  function summary(r: Route): HTMLElement[] {
    return [
      el('div', { className: 'rt-speed' },
        el('div', {}, el('span', { className: 'hint', textContent: t.routes.speedLabel }), el('strong', { textContent: t.control.speed(routeSpeed(r)) })),
        iconButton('edit', t.routes.edit, () => { editor = buildEditor(r); renderList(); })),
      ...describe(r, 'rt-desc-full'),
    ];
  }

  function fillDetail(route: Route, stats: RouteStats) {
    if (!detail) return;
    detail.profile.draw({ route, stats });
    detail.profile.mark(null);
    // The note is only there when there is nothing to show instead
    detail.noEle.hidden = stats.hasElevation;
    detail.noEle.textContent = t.routes.noElevation;
    detail.top.replaceChildren(...(editor?.id === route.id ? [editor.el] : summary(route)));
    detail.el.querySelector('.route-map')?.setAttribute('aria-label', t.routes.mapLabel);
    // The length is in the route's row; what is left are the figures of the elevation
    const facts: [string, string][] = stats.hasElevation ? [
      [t.routes.ascent, t.routes.meters(stats.ascent)],
      [t.routes.descent, t.routes.meters(stats.descent)],
      [t.routes.highest, t.routes.meters(stats.max!)],
      [t.routes.lowest, t.routes.meters(stats.min!)],
    ] : [];
    detail.facts.hidden = !facts.length;
    detail.facts.replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]));
    detail.slot?.setRoute(route);
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
            ...(r.id === selectedId && host.wanted() ? [' ', el('span', { className: 'badge rec', textContent: t.routes.useHint })] : [])),
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
            { icon: 'package', label: t.routes.exportPackage, run: () => download(serializePackage(packageFromRoute(r)), 'application/json', packageFileName(r.name)) },
            { icon: 'trash', label: t.routes.delete, run: () => void remove(r), danger: true },
          ])),
      );
      if (open && detail) { item.append(detail.el); fillDetail(r, stats); }
      return item;
    }));
  }

  let statusText: (() => string) | null = null;
  function setStatus(text: (() => string) | null) {
    statusText = text;
    $('rtStatus').textContent = text ? text() : '';
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
    await seedExamples(s);
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
