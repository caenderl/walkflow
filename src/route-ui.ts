// Routes view and the route card in the training view. A route only shows where on the track you are: it follows the
// treadmill's own distance counter and never sends anything to the treadmill (no speed, no incline).
// Import reads the file on this device (src/gpx.ts); what is saved has passed readRoute.

import { confirmDialog } from './dialogs';
import { GPX_MAX_CHARS, parseGpx, serializeGpx } from './gpx';
import { onLanguageChange, t } from './i18n';
import { fmtDistance, type ProgramStep } from './program';
import { getRouteStore, type RouteStore } from './route-store';
import {
  analyzeRoute, DistanceTracker, elevationSeries, gradeAhead, newRouteId, pointAt, readRoute, ROUTE_NAME_MAX,
  walkSeconds, walkSteps, type Route, type RouteStats,
} from './routes';
import { getRunStore } from './run-store';
import { $, $button, $input, button, download, el, store } from './ui';
import { getWorkoutStore } from './workout-store';
import { todayGoal, type DayGoal } from './workouts';

export const SELECTED_STORAGE_KEY = 'walkflow.route';
const SPEED_STORAGE_KEY = 'walkflow.routeSpeed';
const DEFAULT_SPEED = 3;
/** How often the standing against today's goal is read again while data keeps coming in */
const GOAL_REFRESH_MS = 60_000;

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROFILE_W = 300;
const PROFILE_H = 80;
const PROFILE_PAD = 4;
/** A flatter route than this still gets a profile this tall, so a few metres do not look like a mountain */
const MIN_ELEVATION_SPAN = 20;
const PROFILE_SAMPLES = 160;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, className?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (className) e.setAttribute('class', className);
  return e;
}

/** An elevation profile with a marker for the current position */
function createProfile(host: HTMLElement) {
  const svg = svgEl('svg', { viewBox: `0 0 ${PROFILE_W} ${PROFILE_H}`, preserveAspectRatio: 'none', role: 'img' }, 'profile-svg');
  const area = svgEl('path', {}, 'profile-area');
  const line = svgEl('path', {}, 'profile-line');
  const marker = svgEl('line', { x1: 0, x2: 0, y1: 0, y2: PROFILE_H }, 'profile-marker');
  svg.append(area, line, marker);
  host.replaceChildren(svg);

  return {
    draw(shown: { route: Route; stats: RouteStats } | null) {
      const series = shown && elevationSeries(shown.route, shown.stats, Math.min(PROFILE_SAMPLES, shown.route.points.length));
      host.hidden = !series;
      if (!series) return;
      const lo = Math.min(...series), hi = Math.max(...series, lo + MIN_ELEVATION_SPAN);
      const xy = series.map((e, i) => [
        (i / (series.length - 1)) * PROFILE_W,
        PROFILE_H - PROFILE_PAD - ((e - lo) / (hi - lo)) * (PROFILE_H - 2 * PROFILE_PAD),
      ] as const);
      const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
      line.setAttribute('d', path);
      area.setAttribute('d', `${path}L${PROFILE_W} ${PROFILE_H}L0 ${PROFILE_H}Z`);
      svg.setAttribute('aria-label', t.routes.profileLabel);
    },
    mark(fraction: number | null) {
      marker.setAttribute('visibility', fraction === null ? 'hidden' : 'visible');
      if (fraction === null) return;
      const x = (Math.min(1, Math.max(0, fraction)) * PROFILE_W).toFixed(1);
      marker.setAttribute('x1', x);
      marker.setAttribute('x2', x);
    },
  };
}

function safeFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'route'}.gpx`;
}

/** The name a route gets when the file has none: the file name without its extension */
export const nameFromFile = (fileName: string) => fileName.replace(/\.(gpx|xml)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, ROUTE_NAME_MAX).trim();

export interface RoutesHost {
  /** Effective speed limit in km/h: the estimate is made at the speed the belt will really run */
  maxSpeed(): number;
  /** Walk the route as a workout. Confirmation, connection check and the runner are the app's, not this file's. */
  walk(route: Route, steps: ProgramStep[], kmh: number): Promise<void>;
}

export function setupRoutes(host: RoutesHost) {
  const ready: Promise<RouteStore> = getRouteStore();
  const tracker = new DistanceTracker();
  const trainingProfile = createProfile($('routeProfile'));
  const detailProfile = createProfile($('rtProfile'));
  let visible = false;
  let routes: Route[] = [];
  let persistent = true;
  let selectedId = store.get(SELECTED_STORAGE_KEY) ?? '';
  /** Analysed once per selection, not on every update from the treadmill */
  let analysed: { route: Route; stats: RouteStats } | null = null;
  let goal: DayGoal | null = null;
  let goalAt = 0;

  const selectedRoute = () => routes.find(r => r.id === selectedId) ?? null;

  function select(id: string) {
    selectedId = id;
    store.set(SELECTED_STORAGE_KEY, id);
    const route = selectedRoute();
    analysed = route ? { route, stats: analyzeRoute(route) } : null;
    // A new route starts at its beginning, wherever the counter is now
    tracker.reset();
    renderAll();
  }

  // ---------- Training card ----------
  function renderPicker() {
    const sel = $<HTMLSelectElement>('routeSelect');
    sel.replaceChildren(
      el('option', { value: '', textContent: t.routes.none }),
      ...routes.map(r => el('option', { value: r.id, textContent: r.name })),
    );
    // A route that no longer exists is no selection
    if (selectedId && !selectedRoute()) selectedId = '';
    sel.value = selectedId;
  }

  const speedInput = $input('routeSpeed');
  speedInput.value = store.get(SPEED_STORAGE_KEY) ?? String(DEFAULT_SPEED);

  /** The walking speed typed in, NaN if it is not a usable one */
  function typedSpeed(): number {
    const v = speedInput.valueAsNumber;
    return Number.isFinite(v) && v > 0 ? v : NaN;
  }

  /** Duration at the speed the belt will really run, and what it means for today's goal */
  function renderEstimate() {
    $('routeWalk').hidden = !analysed;
    if (!analysed) return;
    const kmh = typedSpeed();
    if (Number.isNaN(kmh)) { $('routeEstimate').textContent = t.routes.speedInvalid; return; }
    const max = host.maxSpeed();
    const sec = walkSeconds(analysed.stats.total, Math.min(kmh, max));
    const left = goal?.leftMin ?? 0;
    $('routeEstimate').textContent = [
      t.routes.estimate(Math.max(1, Math.round(sec / 60)), Math.min(kmh, max)),
      ...(kmh > max ? [t.program.capped(max)] : []),
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
    live.hidden = !analysed;
    if (!analysed) return;
    const { route, stats } = analysed;
    const pos = pointAt(route, stats, tracker.covered);
    const bar = $<HTMLProgressElement>('routeBar');
    bar.value = Math.round(pos.fraction * 1000);
    bar.setAttribute('aria-label', t.routes.progressLabel);
    $('routeText').textContent = pos.done
      ? t.routes.finished
      : `${t.routes.progress(t.number(pos.meters / 1000, 2), t.number(stats.total / 1000, 2))} · ${t.routes.remaining(fmtDistance(stats.total - pos.meters))}`;
    const grade = pos.done ? undefined : gradeAhead(route, stats, pos.meters);
    $('routeDetail').textContent = pos.ele === undefined
      ? t.routes.noElevation
      : [t.routes.elevation(pos.ele), ...(grade === undefined ? [] : [t.routes.grade(grade)])].join(' · ');
    trainingProfile.mark(stats.hasElevation ? pos.fraction : null);
  }

  /** From the live data of the treadmill (distance in metres) */
  function update(distance: number | undefined) {
    // Runs inside the handler for treadmill data: whatever goes wrong here must not reach the control path
    try {
      tracker.update(distance);
      if (analysed) renderProgress();
      if (analysed && Date.now() - goalAt >= GOAL_REFRESH_MS) void refreshGoal();
    } catch { /* display only */ }
  }

  // ---------- Routes view ----------
  function summary(stats: RouteStats) {
    return t.routes.summary(fmtDistance(stats.total), stats.hasElevation ? stats.ascent : undefined, stats.hasElevation ? stats.descent : undefined);
  }

  function renderList() {
    $('rtEmpty').hidden = routes.length > 0;
    $('rtStorage').hidden = persistent;
    $('rtStorage').textContent = t.routes.memoryOnly;
    $('rtList').replaceChildren(...routes.map(r => {
      const stats = r.id === analysed?.route.id ? analysed.stats : analyzeRoute(r);
      return el('li', { className: 'wk-item' },
        el('div', { className: 'wk-info' },
          el('div', { className: 'wk-name' }, r.name, ...(r.id === selectedId ? [' ', el('span', { className: 'badge rec', textContent: t.routes.useHint })] : [])),
          el('div', { className: 'hint', textContent: summary(stats) })),
        el('div', { className: 'wk-actions' },
          button(t.routes.use, () => { select(r.id); location.hash = ''; }),
          button(t.routes.export, () => download(serializeGpx(r), 'application/gpx+xml', safeFileName(r.name))),
          button(t.routes.delete, () => void remove(r))),
      );
    }));
  }

  function renderPreview() {
    const card = $('rtPreview');
    card.hidden = !analysed;
    if (!analysed) return;
    const { route, stats } = analysed;
    $('rtPreviewTitle').textContent = route.name;
    detailProfile.draw(analysed);
    detailProfile.mark(null);
    $('rtNoEle').hidden = stats.hasElevation;
    $('rtNoEle').textContent = t.routes.noElevation;
    const facts: [string, string][] = [
      [t.routes.length, fmtDistance(stats.total)],
      ...(stats.hasElevation ? ([
        [t.routes.ascent, t.routes.meters(stats.ascent)],
        [t.routes.descent, t.routes.meters(stats.descent)],
        [t.routes.highest, t.routes.meters(stats.max!)],
        [t.routes.lowest, t.routes.meters(stats.min!)],
      ] as [string, string][]) : []),
    ];
    $('rtFacts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]));
  }

  let statusText: (() => string) | null = null;
  function setStatus(text: (() => string) | null) {
    statusText = text;
    $('rtStatus').textContent = text ? text() : '';
  }

  async function remove(r: Route) {
    if (!(await confirmDialog(t.routes.deleteTitle, [t.routes.deleteText(r.name)], t.routes.delete, 'stop'))) return;
    try { await (await ready).delete(r.id); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await reload();
  }

  async function importFile(file: File) {
    const fail = (key: 'unreadable' | 'tooLarge' | 'unsafe' | 'noPoints') => setStatus(() => t.routes[key]);
    if (file.size > GPX_MAX_CHARS) { fail('tooLarge'); return; }
    let text: string;
    try { text = await file.text(); } catch { fail('unreadable'); return; }
    const parsed = parseGpx(text);
    if (!parsed.ok) { fail(parsed.reason); return; }
    const name = (parsed.name ?? nameFromFile(file.name)) || t.routes.cardTitle;
    const route = readRoute({ id: newRouteId(Date.now()), name, points: parsed.points, updated: Date.now() });
    if (!route) { fail('noPoints'); return; }
    try { await (await ready).put(route); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await reload();
    select(route.id);
    const stats = analyzeRoute(route);
    setStatus(() => [
      t.routes.imported(route.name, stats.total / 1000),
      ...(parsed.skipped ? [t.routes.skippedPoints(parsed.skipped)] : []),
      ...(parsed.simplified ? [t.routes.simplified] : []),
    ].join(' '));
  }

  // ---------- Loading ----------
  async function reload() {
    const s = await ready;
    persistent = s.persistent;
    routes = await s.list();
    const route = selectedRoute();
    // Keep the progress when the same route is still selected (a reload does not restart the walk)
    if (route?.id !== analysed?.route.id) {
      analysed = route ? { route, stats: analyzeRoute(route) } : null;
      tracker.reset();
    }
    renderAll();
  }

  function renderAll() {
    renderPicker();
    renderList();
    renderPreview();
    renderEstimate();
    if (statusText) $('rtStatus').textContent = statusText();
    trainingProfile.draw(analysed);
    renderProgress();
  }

  // ---------- Events ----------
  $<HTMLSelectElement>('routeSelect').onchange = e => select((e.target as HTMLSelectElement).value);
  $button('routeRestart').onclick = () => { tracker.reset(); renderProgress(); };
  speedInput.oninput = () => {
    if (!Number.isNaN(typedSpeed())) store.set(SPEED_STORAGE_KEY, String(typedSpeed()));
    renderEstimate();
  };
  $button('routeStart').onclick = () => {
    if (!analysed) return;
    const kmh = typedSpeed();
    const steps = Number.isNaN(kmh) ? null : walkSteps(analysed.stats, kmh);
    if (!steps) {
      $('routeEstimate').textContent = Number.isNaN(kmh) ? t.routes.speedInvalid : t.routes.cannotWalk;
      return;
    }
    void host.walk(analysed.route, steps, kmh);
  };
  const fileInput = $<HTMLInputElement>('rtFile');
  $button('rtImport').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importFile(file);
  };
  onLanguageChange(renderAll);

  void reload();
  void refreshGoal();

  return {
    update,
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
