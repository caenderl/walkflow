// Workouts view: the library, the step editor and the week plan, plus the workout picker in the training view.
// A workout is only ever started from the training controls (confirmation dialog, connection state), never from
// here: "Use" just selects it. What the editor produces is checked by readWorkout before it is saved.

import { confirmDialog } from '../components/dialogs';
import { lang, onLanguageChange, t } from '../../i18n/i18n';
import { fmtLength, formatProgram, parseProgram, programLength, type ProgramStep } from '../../core/training/program';
import { toRow, toStep, type Row } from '../../core/training/workout-rows';
import { getRouteStore } from '../../data/route-store';
import type { Route } from '../../core/routes/routes';
import { getRunStore } from '../../data/run-store';
import type { RunSummary } from '../../core/history/runs';
import { $, $button, $input, download } from '../ui';
import { button, el, iconButton } from '../components/elements';
import { overflowMenu } from '../components/overflow-menu';
import { setupWorkoutImport } from './workout-import';
import { stepRow } from './step-row';
import { setupWeekPlan } from './week-plan';
import { store } from '../store';
import { getWorkoutStore, type WorkoutStore } from '../../data/workout-store';
import {
  nameAfterEdit, newWorkoutId, readWorkout, TEMPLATES, workoutDescription, workoutName, WORKOUT_NAME_MAX,
  type WeekPlan, type Workout,
} from '../../core/training/workouts';
import { serializeWorkoutPackage, workoutPackage, workoutPackageFileName } from '../../core/training/workout-package';

export const SELECTED_STORAGE_KEY = 'walkflow.workout';
const TEMPLATE_PREFIX = 'tpl:';
const DEFAULT_SELECTED = `${TEMPLATE_PREFIX}intervals`;

export interface WorkoutsHost {
  /** Effective speed limit in km/h, for the "runs at the limit" note */
  maxSpeed(): number;
  /** Today's suggestion is a route: choose it for the training view */
  useRoute(id: string): void;
  /** A workout was chosen ("Use", or today's suggestion): the training view is about it now */
  useWorkout(): void;
  /** True while the training view is about a workout (and not about a route or free training) */
  wanted(): boolean;
  /** What is shown for the chosen workout may have changed (library loaded, workout edited) */
  changed(): void;
}

interface Draft {
  /** null = new workout */
  id: string | null;
  name: string;
  rows: Row[];
  /** The workout being edited, for what the editor does not show: names in other languages, description, credit */
  source?: Workout;
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

  /** The selected workout with the name it is known by, for the tag of the run, and its description if it has one */
  function selectedInfo(): { id: string; name: string; steps: ProgramStep[]; description: { text: string; lang: string | null } | null } | null {
    const steps = selectedSteps();
    if (!steps) return null;
    const own = selected.startsWith(TEMPLATE_PREFIX) ? undefined : workouts.find(w => w.id === selected);
    const name = selected.startsWith(TEMPLATE_PREFIX) ? exampleName(selected.slice(TEMPLATE_PREFIX.length)) : own && workoutName(own, lang);
    return name ? { id: selected, name, steps, description: own ? workoutDescription(own, lang) : null } : null;
  }

  function select(id: string) {
    selected = id;
    store.set(SELECTED_STORAGE_KEY, id);
    renderLists();
  }

  /** A workout that no longer exists falls back to the first example */
  function keepSelectionValid() {
    if (!selectedSteps()) selected = DEFAULT_SELECTED;
  }

  // ---------- Library ----------
  function listItem(name: string, steps: ProgramStep[], id: string, actions: HTMLElement[]) {
    const isSelected = id === selected && host.wanted();
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
    const b = iconButton('walkflow', t.workouts.use, () => { select(id); host.useWorkout(); location.hash = ''; });
    b.classList.add('primary');
    return b;
  }

  function renderLists() {
    $('wkEmpty').hidden = workouts.length > 0;
    $('wkStorage').hidden = persistent;
    $('wkStorage').textContent = t.workouts.memoryOnly;
    $('wkList').replaceChildren(...workouts.map(w => listItem(workoutName(w, lang), w.steps, w.id, [
      useButton(w.id),
      button(t.workouts.edit, () => startEdit({ id: w.id, name: workoutName(w, lang), rows: w.steps.map(toRow), source: w })),
      overflowMenu(t.routes.moreActions, [
        { icon: 'package', label: t.workouts.exportPackage, run: () => download(serializeWorkoutPackage(workoutPackage(w)), 'application/json', workoutPackageFileName(workoutName(w, lang))) },
        { icon: 'trash', label: t.workouts.delete, run: () => void remove(w), danger: true },
      ]),
    ])));
    $('wkExamples').replaceChildren(...TEMPLATES.map(tpl => listItem(exampleName(tpl.id), tpl.steps, TEMPLATE_PREFIX + tpl.id, [
      useButton(TEMPLATE_PREFIX + tpl.id),
      button(t.workouts.copy, () => startEdit({ id: null, name: t.workouts.copyName(exampleName(tpl.id)), rows: tpl.steps.map(toRow) })),
    ])));
  }

  async function remove(w: Workout) {
    if (!(await confirmDialog(t.workouts.deleteTitle, [t.workouts.deleteText(workoutName(w, lang))], t.workouts.delete, 'stop'))) return;
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
    $('wkSteps').replaceChildren(...d.rows.map((_, i) => stepRow(d.rows, i, { totalsChanged: renderTotals, rowsChanged: renderEditor })));
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
    // A workout with names in several languages keeps them while the name is left as shown
    const w = readWorkout({
      id: d.id ?? newWorkoutId(Date.now()), ...(d.source ? nameAfterEdit(d.source, name, lang) : { name }),
      texts: d.source?.texts, meta: d.source?.meta, steps, updated: Date.now(),
    });
    if (!w) { setStatus(() => t.workouts.stepsMissing); return; }
    try { await (await ready).put(w); } catch (e) { setStatus(() => t.workouts.failed(String(e))); return; }
    draft = null;
    setStatus(null);
    await reload();
    setStatus(() => t.workouts.saved(workoutName(w, lang)));
    // A new workout becomes the selection, so "save, then start" is one step less
    if (!d.id) select(w.id);
  }

  const weekPlan = setupWeekPlan({
    plan: () => plan,
    workouts: () => workouts,
    routes: () => routes,
    runs: () => runs,
    examples: () => TEMPLATES.map(tpl => [TEMPLATE_PREFIX + tpl.id, exampleName(tpl.id)]),
    workoutName: id => id.startsWith(TEMPLATE_PREFIX)
      ? (templateSteps(id.slice(TEMPLATE_PREFIX.length)) ? exampleName(id.slice(TEMPLATE_PREFIX.length)) : undefined)
      : (w => w && workoutName(w, lang))(workouts.find(w => w.id === id)),
    savePlan: async next => { plan = next; await (await ready).setPlan(next); },
    useRoute: id => host.useRoute(id),
    useWorkout: id => { select(id); host.useWorkout(); },
  });

  const importer = setupWorkoutImport({
    store: () => ready,
    setStatus: text => { $('wkImportStatus').textContent = text ? text() : ''; },
    added: async w => { await reload(); select(w.id); },
  });

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
    keepSelectionValid();
    renderLists();
    renderEditor();
    weekPlan.render();
    weekPlan.renderToday();
    host.changed();
  }

  // ---------- Events ----------
  const fileInput = $input('wkFile');
  $button('wkImport').onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importer.importFile(file);
  };
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
    const steps = parseProgram($<HTMLTextAreaElement>('wkText').value, draftSteps(draft).filter((s): s is ProgramStep => s !== null));
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
    /** The training view's choice changed: the "selected" marks in the library follow */
    refresh: renderLists,
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
    /** A package opened from outside (double click in the Finder or Explorer) */
    openPackage: importer.openPackage,
  };
}
