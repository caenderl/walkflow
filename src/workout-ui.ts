// Workouts view: the library, the step editor and the week plan, plus the workout picker in the training view.
// A workout is only ever started from the training controls (confirmation dialog, connection state), never from
// here: "Use" just selects it. What the editor produces is checked by readWorkout before it is saved.

import { confirmDialog } from './dialogs';
import { onLanguageChange, t } from './i18n';
import { fmtLength, formatProgram, parseProgram, programLength, type ProgramStep } from './program';
import { getRouteStore } from './route-store';
import type { Route } from './routes';
import { getRunStore } from './run-store';
import type { RunSummary } from './runs';
import { $, $button, $input, button, el, store } from './ui';
import { getWorkoutStore, type WorkoutStore } from './workout-store';
import {
  newWorkoutId, planFromMinutes, readWorkout, TEMPLATES, todaySuggestion, weekProgress, WORKOUT_NAME_MAX,
  type PlanSuggestion, type WeekPlan, type Workout,
} from './workouts';

export const SELECTED_STORAGE_KEY = 'walkflow.workout';
const TEMPLATE_PREFIX = 'tpl:';
const DEFAULT_SELECTED = `${TEMPLATE_PREFIX}intervals`;

export interface WorkoutsHost {
  /** Effective speed limit in km/h, for the "runs at the limit" note */
  maxSpeed(): number;
  /** Today's suggestion is a route: select it in the route card */
  useRoute(id: string): void;
}

type Unit = 'min' | 's' | 'm';

/** A step as the editor shows it: amount in a unit */
interface Row {
  unit: Unit;
  amount: number;
  speed: number;
  /** Percent; undefined = none */
  incline?: number;
}

interface Draft {
  /** null = new workout */
  id: string | null;
  name: string;
  rows: Row[];
}

function toRow(step: ProgramStep): Row {
  const incline = step.incline === undefined ? {} : { incline: step.incline };
  if (step.meters !== undefined) return { unit: 'm', amount: step.meters, speed: step.speed, ...incline };
  return step.sec % 60 === 0
    ? { unit: 'min', amount: step.sec / 60, speed: step.speed, ...incline }
    : { unit: 's', amount: step.sec, speed: step.speed, ...incline };
}

/** null = the numbers are not usable */
function toStep(row: Row): ProgramStep | null {
  if (!Number.isFinite(row.amount) || !Number.isFinite(row.speed) || row.amount < 0) return null;
  const incline = row.incline !== undefined && Number.isFinite(row.incline) ? { incline: row.incline } : {};
  if (row.unit === 'm') return { meters: Math.round(row.amount), speed: row.speed, ...incline };
  return { sec: Math.round(row.amount * (row.unit === 'min' ? 60 : 1)), speed: row.speed, ...incline };
}

const templateSteps = (id: string): ProgramStep[] | undefined => TEMPLATES.find(tpl => tpl.id === id)?.steps;

export function setupWorkouts(host: WorkoutsHost) {
  const ready: Promise<WorkoutStore> = getWorkoutStore();
  let visible = false;
  let workouts: Workout[] = [];
  let routes: Route[] = [];
  let plan: WeekPlan = { minutes: [0, 0, 0, 0, 0, 0, 0] };
  let runs: RunSummary[] = [];
  let selected = store.get(SELECTED_STORAGE_KEY) ?? DEFAULT_SELECTED;
  let draft: Draft | null = null;
  let persistent = true;

  const exampleName = (id: string) => t.workouts.exampleNames[id] ?? id;

  // ---------- Selection (training view) ----------
  function selectedSteps(): ProgramStep[] | null {
    if (selected.startsWith(TEMPLATE_PREFIX)) return templateSteps(selected.slice(TEMPLATE_PREFIX.length)) ?? null;
    return workouts.find(w => w.id === selected)?.steps ?? null;
  }

  /** The selected workout with the name it is known by, for the tag of the run */
  function selectedInfo(): { id: string; name: string; steps: ProgramStep[] } | null {
    const steps = selectedSteps();
    if (!steps) return null;
    const name = selected.startsWith(TEMPLATE_PREFIX) ? exampleName(selected.slice(TEMPLATE_PREFIX.length)) : workouts.find(w => w.id === selected)?.name;
    return name ? { id: selected, name, steps } : null;
  }

  function select(id: string) {
    selected = id;
    store.set(SELECTED_STORAGE_KEY, id);
    renderPicker();
    renderLists();
  }

  function renderPicker() {
    const sel = $<HTMLSelectElement>('progSelect');
    const group = (label: string, items: [string, string][]) => {
      const g = el('optgroup', { label });
      g.append(...items.map(([value, text]) => el('option', { value, textContent: text })));
      return g;
    };
    sel.replaceChildren(
      ...(workouts.length ? [group(t.program.mine, workouts.map(w => [w.id, w.name]))] : []),
      group(t.program.examples, TEMPLATES.map(tpl => [TEMPLATE_PREFIX + tpl.id, exampleName(tpl.id)])),
    );
    // A workout that no longer exists falls back to the first example
    if (!selectedSteps()) selected = DEFAULT_SELECTED;
    sel.value = selected;
    const steps = selectedSteps() ?? [];
    $('progSummary').textContent = t.program.summary(steps.length, fmtLength(programLength(steps)));
  }

  // ---------- Library ----------
  function listItem(name: string, steps: ProgramStep[], id: string, actions: HTMLElement[]) {
    const isSelected = id === selected;
    const li = el('li', { className: 'wk-item' });
    li.append(
      el('div', { className: 'wk-info' },
        el('div', { className: 'wk-name' }, name, ...(isSelected ? [' ', el('span', { className: 'badge rec', textContent: t.workouts.useHint })] : [])),
        el('div', { className: 'hint', textContent: t.program.summary(steps.length, fmtLength(programLength(steps))) })),
      el('div', { className: 'wk-actions' }, ...actions),
    );
    return li;
  }

  function useButton(id: string) {
    return button(t.workouts.use, () => { select(id); location.hash = ''; });
  }

  function renderLists() {
    $('wkEmpty').hidden = workouts.length > 0;
    $('wkStorage').hidden = persistent;
    $('wkStorage').textContent = t.workouts.memoryOnly;
    $('wkList').replaceChildren(...workouts.map(w => listItem(w.name, w.steps, w.id, [
      useButton(w.id),
      button(t.workouts.edit, () => startEdit({ id: w.id, name: w.name, rows: w.steps.map(toRow) })),
      button(t.workouts.delete, () => void remove(w)),
    ])));
    $('wkExamples').replaceChildren(...TEMPLATES.map(tpl => listItem(exampleName(tpl.id), tpl.steps, TEMPLATE_PREFIX + tpl.id, [
      useButton(TEMPLATE_PREFIX + tpl.id),
      button(t.workouts.copy, () => startEdit({ id: null, name: t.workouts.copyName(exampleName(tpl.id)), rows: tpl.steps.map(toRow) })),
    ])));
  }

  async function remove(w: Workout) {
    if (!(await confirmDialog(t.workouts.deleteTitle, [t.workouts.deleteText(w.name)], t.workouts.delete, 'stop'))) return;
    try { await (await ready).delete(w.id); } catch (e) { setStatus(() => t.workouts.failed(String(e))); return; }
    if (draft?.id === w.id) draft = null;
    await reload();
  }

  // ---------- Editor ----------
  function startEdit(d: Draft) {
    draft = d;
    setStatus(null);
    renderEditor();
    $('wkEditor').scrollIntoView({ block: 'nearest' });
    $input('wkName').focus();
  }

  let statusText: (() => string) | null = null;
  function setStatus(text: (() => string) | null) {
    statusText = text;
    $('wkStatus').textContent = text ? text() : '';
  }

  function draftSteps(d: Draft): (ProgramStep | null)[] {
    return d.rows.map(toStep);
  }

  function renderEditor() {
    const d = draft;
    $('wkEditor').hidden = !d;
    if (!d) return;
    $('wkEditorTitle').textContent = d.id ? t.workouts.editorEdit : t.workouts.editorNew;
    $input('wkName').value = d.name;
    $('wkSteps').replaceChildren(...d.rows.map((row, i) => stepRow(d, row, i)));
    renderTotals();
    $<HTMLTextAreaElement>('wkText').value = formatProgram(draftSteps(d).filter((s): s is ProgramStep => s !== null));
    if (statusText) $('wkStatus').textContent = statusText();
  }

  /** Total length and the note about steps above the limit; cheap, so it runs on every input */
  function renderTotals() {
    if (!draft) return;
    const steps = draftSteps(draft).filter((s): s is ProgramStep => s !== null);
    const max = host.maxSpeed();
    $('wkTotal').textContent = [
      t.workouts.total(fmtLength(programLength(steps))),
      ...(steps.some(s => s.speed > max) ? [t.workouts.capped(max)] : []),
    ].join(' ');
  }

  function stepRow(d: Draft, row: Row, i: number) {
    const num = (value: number, step: string, label: string, onInput: (v: number) => void, placeholder = '', min = '0') => {
      const input = el('input', { type: 'number', min, step, placeholder, value: Number.isFinite(value) ? String(value) : '' });
      input.setAttribute('aria-label', `${t.workouts.step(i + 1)}: ${label}`);
      input.setAttribute('inputmode', 'decimal');
      input.oninput = () => { onInput(input.valueAsNumber); renderTotals(); };
      return input;
    };
    const unit = el('select');
    unit.setAttribute('aria-label', `${t.workouts.step(i + 1)}: ${t.workouts.unit}`);
    for (const [value, text] of [['min', t.workouts.unitMin], ['s', t.workouts.unitSec], ['m', t.workouts.unitMeters]] as const) {
      unit.append(el('option', { value, textContent: text, selected: row.unit === value }));
    }
    unit.onchange = () => { row.unit = unit.value as Unit; renderTotals(); };

    const move = (by: number) => {
      const j = i + by;
      if (j < 0 || j >= d.rows.length) return;
      [d.rows[i], d.rows[j]] = [d.rows[j]!, d.rows[i]!];
      renderEditor();
    };
    const icon = (text: string, label: string, onClick: () => void, disabled = false) => {
      const b = button(text, onClick, disabled);
      b.setAttribute('aria-label', `${t.workouts.step(i + 1)}: ${label}`);
      b.title = label;
      return b;
    };
    const incline = num(row.incline ?? NaN, '0.1', t.workouts.incline, v => { row.incline = Number.isFinite(v) ? v : undefined; }, t.workouts.inclShort, '-10');
    incline.max = '40';
    incline.classList.add('wk-incl');
    return el('li', { className: 'wk-step' },
      el('span', { className: 'wk-n', textContent: String(i + 1) }),
      num(row.amount, 'any', t.workouts.amount, v => { row.amount = v; }),
      unit,
      num(row.speed, '0.1', t.workouts.speed, v => { row.speed = v; }, 'km/h'),
      incline,
      el('span', { className: 'wk-move' },
        icon('↑', t.workouts.up, () => move(-1), i === 0),
        icon('↓', t.workouts.down, () => move(1), i === d.rows.length - 1),
        icon('✕', t.workouts.remove, () => { d.rows.splice(i, 1); renderEditor(); })),
    );
  }

  async function save() {
    const d = draft;
    if (!d) return;
    const name = d.name.trim();
    if (!name) { setStatus(() => t.workouts.nameMissing); return; }
    if (name.length > WORKOUT_NAME_MAX) { setStatus(() => t.workouts.nameTooLong(WORKOUT_NAME_MAX)); return; }
    if (!d.rows.length) { setStatus(() => t.workouts.stepsMissing); return; }
    const steps: ProgramStep[] = [];
    for (const [i, row] of d.rows.entries()) {
      const step = toStep(row);
      // Each step on its own, so the message can name the one to fix
      if (!step || !readWorkout({ id: 'x', name: 'x', steps: [step], updated: 0 })) { setStatus(() => t.workouts.stepInvalid(i + 1)); return; }
      steps.push(step);
    }
    const w = readWorkout({ id: d.id ?? newWorkoutId(Date.now()), name, steps, updated: Date.now() });
    if (!w) { setStatus(() => t.workouts.stepsMissing); return; }
    try { await (await ready).put(w); } catch (e) { setStatus(() => t.workouts.failed(String(e))); return; }
    draft = null;
    setStatus(null);
    await reload();
    setStatus(() => t.workouts.saved(w.name));
    // A new workout becomes the selection, so "save, then start" is one step less
    if (!d.id) select(w.id);
  }

  // ---------- Week plan ----------
  const encode = (s: PlanSuggestion) => `${s.kind}:${s.id}`;
  function decode(value: string): PlanSuggestion | null {
    const i = value.indexOf(':');
    const kind = value.slice(0, i), id = value.slice(i + 1);
    return i > 0 && id && (kind === 'workout' || kind === 'route') ? { kind, id } : null;
  }

  /** What a suggestion points to, undefined when it has been deleted */
  function suggestionName(s: PlanSuggestion): string | undefined {
    if (s.kind === 'route') return routes.find(r => r.id === s.id)?.name;
    if (s.id.startsWith(TEMPLATE_PREFIX)) return templateSteps(s.id.slice(TEMPLATE_PREFIX.length)) ? exampleName(s.id.slice(TEMPLATE_PREFIX.length)) : undefined;
    return workouts.find(w => w.id === s.id)?.name;
  }

  function suggestSelect(day: string, current: PlanSuggestion | null) {
    const sel = el('select', { className: 'plan-suggest' });
    sel.setAttribute('aria-label', t.workouts.suggestFor(day));
    const group = (label: string, items: [string, string][]) => {
      const g = el('optgroup', { label });
      g.append(...items.map(([value, text]) => el('option', { value, textContent: text })));
      return g;
    };
    const known: PlanSuggestion[] = [
      ...workouts.map((w): PlanSuggestion => ({ kind: 'workout', id: w.id })),
      ...TEMPLATES.map((tpl): PlanSuggestion => ({ kind: 'workout', id: TEMPLATE_PREFIX + tpl.id })),
      ...routes.map((r): PlanSuggestion => ({ kind: 'route', id: r.id })),
    ];
    sel.append(el('option', { value: '', textContent: t.workouts.suggestNone }));
    if (workouts.length) sel.append(group(t.program.mine, workouts.map(w => [encode({ kind: 'workout', id: w.id }), w.name])));
    sel.append(group(t.program.examples, TEMPLATES.map(tpl => [encode({ kind: 'workout', id: TEMPLATE_PREFIX + tpl.id }), exampleName(tpl.id)])));
    if (routes.length) sel.append(group(t.routes.mineTitle, routes.map(r => [encode({ kind: 'route', id: r.id }), r.name])));
    // A target that is gone keeps its place, so changing another day does not silently drop it
    if (current && !known.some(k => encode(k) === encode(current))) {
      sel.append(el('option', { value: encode(current), textContent: t.workouts.suggestMissing }));
    }
    sel.value = current ? encode(current) : '';
    sel.onchange = () => void savePlan();
    return sel;
  }

  function renderToday() {
    const sug = todaySuggestion(plan, Date.now());
    const name = sug && suggestionName(sug);
    $('todayPlan').hidden = !sug || !name;
    if (!sug || !name) return;
    $('todayPlanText').textContent = t.workouts.todaySuggest(sug.kind === 'route' ? t.history.tagRoute : t.history.tagWorkout, name);
    const use = $button('todayPlanUse');
    use.textContent = t.workouts.use;
    use.onclick = () => { if (sug.kind === 'route') host.useRoute(sug.id); else select(sug.id); };
  }

  function renderPlan() {
    const progress = weekProgress(plan, runs, Date.now());
    $('planList').replaceChildren(...progress.map((p, i) => {
      const day = t.workouts.weekday(p.day);
      const input = el('input', { type: 'number', min: '0', max: '600', step: '5', value: String(plan.minutes[i] ?? 0) });
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-label', t.workouts.target(day));
      input.onchange = () => void savePlan();
      const done = Math.floor(p.doneSec / 60);
      return el('li', { className: `plan-day${p.today ? ' today' : ''}${p.met ? ' met' : ''}` },
        el('span', { className: 'plan-name' },
          el('strong', { textContent: day }), ' ',
          el('span', { className: 'hint', textContent: p.today ? t.workouts.today : t.workouts.dayDate(p.day) })),
        input,
        el('span', { className: 'plan-progress', textContent: p.target ? t.workouts.progress(done, p.target) : t.workouts.progressRest(done) }),
        el('span', { className: 'plan-mark', textContent: p.met ? '✓' : '' }, ...(p.met ? [el('span', { className: 'sr-only', textContent: t.workouts.metLabel })] : [])),
        suggestSelect(day, plan.suggest?.[i] ?? null),
      );
    }));
    const planned = progress.filter(p => p.target > 0);
    $('planSummary').textContent = t.workouts.summary(planned.filter(p => p.met).length, planned.length);
  }

  async function savePlan() {
    plan = planFromMinutes(
      [...$('planList').querySelectorAll('input')].map(i => i.valueAsNumber),
      [...$('planList').querySelectorAll<HTMLSelectElement>('select.plan-suggest')].map(s => decode(s.value)),
    );
    try { await (await ready).setPlan(plan); } catch (e) { $('planSummary').textContent = t.workouts.failed(String(e)); return; }
    renderPlan();
  }

  // ---------- Loading ----------
  async function reload() {
    const s = await ready;
    persistent = s.persistent;
    workouts = await s.list();
    plan = (await s.plan()) ?? plan;
    runs = await (await getRunStore()).list().catch(() => []);
    routes = await (await getRouteStore()).list().catch(() => []);
    renderAll();
  }

  function renderAll() {
    renderPicker();
    renderLists();
    renderEditor();
    renderPlan();
    renderToday();
  }

  // ---------- Events ----------
  $<HTMLSelectElement>('progSelect').onchange = e => select((e.target as HTMLSelectElement).value);
  $button('wkNew').onclick = () => startEdit({ id: null, name: '', rows: [{ unit: 'min', amount: 5, speed: 3 }] });
  $button('wkAdd').onclick = () => {
    if (!draft) return;
    const last = draft.rows.at(-1);
    draft.rows.push({ unit: last?.unit ?? 'min', amount: last?.amount ?? 5, speed: last?.speed ?? 3 });
    renderEditor();
  };
  $input('wkName').oninput = e => { if (draft) draft.name = (e.target as HTMLInputElement).value; };
  $button('wkApplyText').onclick = () => {
    if (!draft) return;
    const steps = parseProgram($<HTMLTextAreaElement>('wkText').value);
    if (!steps.length) { setStatus(() => t.workouts.textEmpty); return; }
    draft.rows = steps.map(toRow);
    setStatus(null);
    renderEditor();
  };
  $button('wkSave').onclick = () => void save();
  $button('wkCancel').onclick = () => { draft = null; setStatus(null); renderEditor(); };
  onLanguageChange(renderAll);

  void reload();

  return {
    selectedInfo,
    /** The limit changed: the note in the editor depends on it */
    refreshLimit: renderTotals,
    setVisible(on: boolean) {
      const was = visible;
      visible = on;
      // Runs may have been saved since: the week plan shows the current state each time the view opens
      if (on && !was) void reload();
    },
    /** After a backup restore */
    reload,
  };
}
