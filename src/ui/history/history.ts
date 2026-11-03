// History view: overview, list of runs, backup and restore. main.ts feeds the recorder from the live data;
// everything here only reads and writes the store and never touches the treadmill.

import { drawBarChart, drawSpeedChart } from '../components/chart';
import { desktop } from '../desktop';
import { confirmDialog } from '../components/dialogs';
import { buildTcx, exportFilename, toCsv, type Sample, type TcxSport } from '../../core/history/export';
import { lang, onLanguageChange, t } from '../../i18n/i18n';
import { toDist } from '../../i18n/units';
import { bindText } from '../i18n-dom';
import { getRouteStore } from '../../data/route-store';
import { getRunStore } from '../../data/run-store';
import { getWorkoutStore } from '../../data/workout-store';
import { decodeTrack, parseBackup, RunRecorder, serializeBackup, type RunSummary } from '../../core/history/runs';
import { countable, overview, records, streaks, weeklyDistance, type WeekTotal } from '../../core/history/stats';
import { onThemeChange } from '../theme';
import { $, $button, $input, download, store } from '../ui';

const SAVE_RUNS_KEY = 'walkflow.saveRuns';
const PAGE = 20;
const WEEKS = 12;

export interface HistoryHost {
  log(msg: string): void;
  tcxSport(): TcxSport;
  /** A backup was restored: workouts, routes and the week plan may have changed */
  onRestored?(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function setupHistory(host: HistoryHost) {
  const ready = getRunStore();
  let visible = false;
  let shown = PAGE;
  let runs: RunSummary[] = [];
  let weeks: WeekTotal[] = [];
  let activeWeek = -1;
  let barCentres: number[] = [];
  let failing = false;
  let persistAsked = false;
  let storage: 'memory' | 'desktop' | 'persisted' | 'best-effort' | null = null;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ids of the runs whose details are open, kept across re-renders */
  const open = new Set<string>();
  /** Redraw functions of the charts on screen */
  const charts = new Map<HTMLCanvasElement, () => void>();

  const recorder = new RunRecorder({
    save: async run => (await ready).put(run),
    onSaved: (run, final) => {
      failing = false;
      if (final) host.log(t.history.savedLog(run.summary.dist, run.summary.movingSec));
      if (run.summary.source === 'ble') void askPersistence();
      if (visible) scheduleRender();
    },
    onError: e => {
      // Once per series of failures, not every 15 s
      if (!failing) host.log(t.history.saveFailedLog(e instanceof Error ? e.message : String(e)));
      failing = true;
    },
  });

  // ---------- Storage info ----------
  async function checkStorage() {
    const s = await ready;
    if (!s.persistent) storage = 'memory';
    else if (desktop) storage = 'desktop';
    else {
      let persisted = false;
      try { persisted = !!(await navigator.storage?.persisted?.()); } catch { /* not supported */ }
      storage = persisted ? 'persisted' : 'best-effort';
    }
    bindText($('storageInfo'), () => {
      switch (storage) {
        case 'memory': return t.history.storageMemory;
        case 'desktop': return t.history.storageDesktop;
        case 'persisted': return t.history.storageLocal;
        case 'best-effort': return `${t.history.storageLocal} ${t.history.storageMayBeCleared}`;
        default: return '';
      }
    });
  }

  /** Asks the browser not to clear the runs when space runs low (granted silently or not at all in Chromium). */
  async function askPersistence() {
    if (persistAsked || desktop) return;
    persistAsked = true;
    try {
      if (!(await navigator.storage?.persisted?.())) await navigator.storage?.persist?.();
    } catch { /* not supported */ }
    await checkStorage();
  }

  // ---------- Rendering ----------
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => void render(), 300);
  }

  async function render() {
    try {
      runs = await (await ready).list();
    } catch (e) {
      host.log(t.history.saveFailedLog(e instanceof Error ? e.message : String(e)));
      return;
    }
    renderOverview();
    renderList();
  }

  function renderOverview() {
    const now = Date.now();
    const real = countable(runs);
    const o = overview(real, now);
    const period = (id: string, x: typeof o.week) => {
      $(id).textContent = t.history.km(x.dist);
      $(`${id}Sub`).textContent = t.history.period(x.runs, x.movingSec);
    };
    period('hWeek', o.week);
    period('hMonth', o.month);
    period('hAll', o.all);

    weeks = weeklyDistance(real, now, WEEKS);
    drawWeeks();
    const table = $<HTMLTableElement>('weekTable');
    table.replaceChildren(...weeks.map(w => {
      const tr = el('tr');
      tr.append(el('th', undefined, `${t.history.tableWeek} ${t.history.weekOf(w.start)}`), el('td', undefined, t.history.km(w.dist)));
      return tr;
    }));

    const st = streaks(real, now);
    const rec = records(real);
    $('hStreak').textContent = real.length ? t.history.streakValue(st.current, st.longest) : '–';
    $('hFarthest').textContent = rec.longestDist ? t.history.recordDist(rec.longestDist.dist, rec.longestDist.start) : '–';
    $('hLongest').textContent = rec.longestTime ? t.history.recordTime(rec.longestTime.movingSec, rec.longestTime.start) : '–';
    $('hBestWeek').textContent = rec.bestWeek ? t.history.recordWeek(rec.bestWeek.dist, rec.bestWeek.start) : '–';
    $('hDemoNote').hidden = real.length === runs.length;
  }

  function drawWeeks() {
    if (!weeks.length) return;
    barCentres = drawBarChart($<HTMLCanvasElement>('weekChart'), weeks.map(w => toDist(w.dist)), {
      labels: weeks.map(w => t.history.weekOf(w.start)),
      active: activeWeek,
      format: v => t.number(v),
    });
    const w = weeks[activeWeek] ?? weeks.at(-1)!;
    $('weekReadout').textContent = t.history.weekValue(w.start, w.dist);
  }

  function renderList() {
    const list = $('runList');
    const items = runs.slice(0, shown);
    $('runEmpty').hidden = runs.length > 0;
    $('runMore').hidden = runs.length <= shown;
    const current = recorder.currentId;
    const existing = new Map([...list.children].map(li => [(li as HTMLElement).dataset.id, li as HTMLElement]));
    // Rows that did not change stay in place, so an open run keeps its chart and the focus
    items.forEach((r, i) => {
      const key = `${lang}|${r.id === current}|${JSON.stringify(r)}`;
      let li = existing.get(r.id);
      if (!li || li.dataset.key !== key) {
        const fresh = renderRun(r, r.id === current);
        fresh.dataset.key = key;
        if (li) li.replaceWith(fresh);
        li = fresh;
      }
      if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null);
    });
    while (list.children.length > items.length) list.lastElementChild!.remove();
    for (const c of charts.keys()) if (!c.isConnected) { charts.delete(c); resize.unobserve(c); }
  }

  function renderRun(r: RunSummary, isCurrent: boolean): HTMLLIElement {
    const li = el('li', 'run');
    li.dataset.id = r.id;
    const det = el('details');
    const sum = el('summary');
    const head = el('span', 'run-head');
    head.append(el('span', 'run-when', t.history.when(r.start)));
    if (isCurrent) head.append(el('span', 'badge rec', t.history.recording));
    if (r.source === 'demo') head.append(el('span', 'badge', t.history.demo));
    if (r.tag) head.append(el('span', 'badge tag', r.tag.name));
    sum.append(head, el('span', 'run-line', t.history.line(r.dist, r.movingSec, r.avgKmh)));
    det.append(sum);
    det.addEventListener('toggle', () => {
      if (det.open) { open.add(r.id); void fillDetail(det, r, isCurrent); } else open.delete(r.id);
    });
    li.append(det);
    if (open.has(r.id)) det.open = true;
    return li;
  }

  async function fillDetail(det: HTMLDetailsElement, r: RunSummary, isCurrent: boolean) {
    if (det.querySelector('.run-body')) return;
    const body = el('div', 'run-body');
    det.append(body);
    let samples: Sample[] = [];
    try {
      const track = await (await ready).track(r.id);
      if (track) samples = decodeTrack(r.start, track);
    } catch { /* show the summary anyway */ }

    const canvas = el('canvas', 'run-chart');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', t.history.line(r.dist, r.movingSec, r.avgKmh));
    const facts = el('dl', 'run-facts');
    const fact = (label: string, value: string) => {
      const d = el('div');
      d.append(el('dt', undefined, label), el('dd', undefined, value));
      facts.append(d);
    };
    fact(t.history.distance, t.history.distValue(r.dist));
    fact(t.history.moving, t.history.clock(r.movingSec));
    fact(t.history.duration, t.history.clock((r.end - r.start) / 1000));
    if (r.tag) fact(t.history.tagLabel, t.history.tagValue(r.tag.kind === 'route' ? t.history.tagRoute : t.history.tagWorkout, r.tag.name, r.tag.completed));
    fact(t.history.avgSpeed, t.history.speedValue(r.avgKmh));
    fact(t.history.maxSpeed, t.history.speedValue(r.maxKmh));
    if (r.kcal !== undefined) fact(t.history.kcal, t.number(r.kcal, 0));
    if (r.avgHr !== undefined && r.maxHr !== undefined) fact(t.history.heartRate, t.history.hrValue(r.avgHr, r.maxHr));

    const row = el('div', 'row');
    const csv = el('button', undefined, t.history.csv);
    csv.type = 'button';
    csv.onclick = () => download(toCsv(samples), 'text/csv', exportFilename(new Date(r.start), 'csv'));
    const tcx = el('button', undefined, t.history.tcx);
    tcx.type = 'button';
    tcx.onclick = () => {
      const xml = buildTcx(samples, { sport: host.tcxSport(), notes: t.settings.tcxNotes });
      if (xml) download(xml, 'application/vnd.garmin.tcx+xml', exportFilename(new Date(r.start), 'tcx'));
    };
    csv.disabled = tcx.disabled = !samples.length;
    row.append(csv, tcx);
    // The run being recorded would come back with the next save
    if (!isCurrent) {
      const del = el('button', undefined, t.history.delete);
      del.type = 'button';
      del.onclick = () => void deleteRun(r);
      row.append(del);
    }
    body.append(canvas, facts, row);

    const draw = () => drawSpeedChart(canvas, samples, {
      from: r.start, to: r.end, ymax: Math.max(6, Math.ceil(r.maxKmh)),
      startLabel: t.history.time(r.start), endLabel: t.history.time(r.end),
    });
    charts.set(canvas, draw);
    resize.observe(canvas);
    draw();
  }

  // ---------- Actions ----------
  async function deleteRun(r: RunSummary) {
    if (!(await confirmDialog(t.history.deleteTitle, [t.history.deleteText(t.history.when(r.start))], t.history.delete))) return;
    await (await ready).delete(r.id);
    open.delete(r.id);
    await render();
  }

  async function deleteAll() {
    if (!runs.length) return;
    if (!(await confirmDialog(t.history.deleteAllTitle(runs.length), [t.history.deleteAllText], t.history.deleteAll))) return;
    await (await ready).clear();
    open.clear();
    await render();
  }

  async function backup() {
    const all = await (await ready).all();
    const w = await getWorkoutStore();
    const [workouts, plan, routes] = [await w.list(), await w.plan(), await (await getRouteStore()).list()];
    if (!all.length && !workouts.length && !routes.length && !plan) { bindText($('histStatus'), () => t.history.noRuns); return; }
    download(serializeBackup(all, new Date(), { workouts, routes, plan }), 'application/json', `walkflow-backup-${localDate(new Date())}.json`);
  }

  async function restore(file: File) {
    const result = parseBackup(await file.text());
    if (!result.ok) {
      const reason = result.reason;
      bindText($('histStatus'), () => (reason === 'newer' ? t.history.newer : t.history.unreadable));
      return;
    }
    const s = await ready;
    const present = new Set((await s.list()).map(r => r.id));
    let added = 0;
    for (const run of result.runs) {
      if (present.has(run.summary.id)) continue;
      await s.put(run);
      present.add(run.summary.id);
      added++;
    }
    const { invalid } = result, already = result.runs.length - added;
    // Like the runs: what is already here stays as it is, only what is missing is added
    const ws = await getWorkoutStore();
    const haveWorkouts = new Set((await ws.list()).map(x => x.id));
    let workoutsAdded = 0;
    for (const w of result.workouts) {
      if (haveWorkouts.has(w.id)) continue;
      await ws.put(w);
      workoutsAdded++;
    }
    const rs = await getRouteStore();
    const haveRoutes = new Set((await rs.list()).map(x => x.id));
    let routesAdded = 0;
    for (const r of result.routes) {
      if (haveRoutes.has(r.id)) continue;
      await rs.put(r);
      routesAdded++;
    }
    const planRestored = !!result.plan && !(await ws.plan());
    if (result.plan && planRestored) await ws.setPlan(result.plan);
    const invalidExtra = result.invalidWorkouts + result.invalidRoutes;
    const extra = workoutsAdded || routesAdded || planRestored || invalidExtra;
    bindText($('histStatus'), () => t.history.restored(added, already, invalid) + (extra ? ` ${t.history.restoredExtra(workoutsAdded, routesAdded, planRestored, invalidExtra)}` : ''));
    host.onRestored?.();
    await render();
  }

  // ---------- Events ----------
  const resize = new ResizeObserver(entries => {
    for (const e of entries) {
      if (e.target.id === 'weekChart') drawWeeks();
      else charts.get(e.target as HTMLCanvasElement)?.();
    }
  });
  const weekCanvas = $<HTMLCanvasElement>('weekChart');
  resize.observe(weekCanvas);
  weekCanvas.addEventListener('pointermove', e => {
    const x = e.clientX - weekCanvas.getBoundingClientRect().left;
    const slot = barCentres.length > 1 ? barCentres[1]! - barCentres[0]! : Infinity;
    const i = barCentres.findIndex(c => Math.abs(c - x) <= slot / 2);
    if (i !== activeWeek) { activeWeek = i; drawWeeks(); }
  });
  weekCanvas.addEventListener('pointerleave', () => { activeWeek = -1; drawWeeks(); });

  const autoSave = $input('autoSave');
  autoSave.checked = store.get(SAVE_RUNS_KEY) !== '0';
  recorder.setEnabled(autoSave.checked);
  autoSave.onchange = () => {
    store.set(SAVE_RUNS_KEY, autoSave.checked ? '1' : '0');
    recorder.setEnabled(autoSave.checked);
  };
  $button('runMore').onclick = () => { shown += PAGE; renderList(); };
  $button('backup').onclick = () => void backup();
  $button('deleteAll').onclick = () => void deleteAll();
  const file = $input('restoreFile');
  $button('restore').onclick = () => file.click();
  file.onchange = () => {
    const f = file.files?.[0];
    file.value = '';
    if (f) void restore(f);
  };

  onLanguageChange(() => { if (visible) void render(); });
  onThemeChange(() => {
    if (!visible) return;
    drawWeeks();
    for (const draw of charts.values()) draw();
  });
  void checkStorage();

  return {
    recorder,
    setVisible(v: boolean) {
      visible = v;
      if (v) void render();
    },
  };
}
