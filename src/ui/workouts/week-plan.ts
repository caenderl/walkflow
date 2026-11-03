// The week plan in the workouts view: minutes per day, the progress, a workout or route proposed for each day, and
// today's suggestion with its "Use" button. The plan itself is kept by the workouts view; this part draws and edits it.

import { lang, t } from '../../i18n/i18n';
import { routeName } from '../../core/routes/route-examples';
import type { Route } from '../../core/routes/routes';
import type { RunSummary } from '../../core/history/runs';
import {
  decodeSuggestion, encodeSuggestion, planFromMinutes, todaySuggestion, weekProgress,
  type PlanSuggestion, type WeekPlan, type Workout,
} from '../../core/training/workouts';
import { el } from '../components/elements';
import { $, $button } from '../ui';

export interface WeekPlanHost {
  plan(): WeekPlan;
  workouts(): Workout[];
  routes(): Route[];
  runs(): RunSummary[];
  /** The example workouts: [id as it is used in a suggestion, name] */
  examples(): [string, string][];
  /** The name of a workout by id (examples included), undefined if it is gone */
  workoutName(id: string): string | undefined;
  /** Keeps and stores the plan; rejects if it could not be stored */
  savePlan(plan: WeekPlan): Promise<void>;
  useRoute(id: string): void;
  useWorkout(id: string): void;
}

export function setupWeekPlan(host: WeekPlanHost) {
  /** What a suggestion points to, undefined when it has been deleted */
  function suggestionName(s: PlanSuggestion): string | undefined {
    if (s.kind === 'route') return (r => (r ? routeName(r, lang) : undefined))(host.routes().find(r => r.id === s.id));
    return host.workoutName(s.id);
  }

  function suggestSelect(day: string, current: PlanSuggestion | null) {
    const workouts = host.workouts(), routes = host.routes(), examples = host.examples();
    const sel = el('select', { className: 'plan-suggest' });
    sel.setAttribute('aria-label', t.workouts.suggestFor(day));
    const group = (label: string, items: [string, string][]) => {
      const g = el('optgroup', { label });
      g.append(...items.map(([value, text]) => el('option', { value, textContent: text })));
      return g;
    };
    const known: PlanSuggestion[] = [
      ...workouts.map((w): PlanSuggestion => ({ kind: 'workout', id: w.id })),
      ...examples.map(([id]): PlanSuggestion => ({ kind: 'workout', id })),
      ...routes.map((r): PlanSuggestion => ({ kind: 'route', id: r.id })),
    ];
    sel.append(el('option', { value: '', textContent: t.workouts.suggestNone }));
    if (workouts.length) sel.append(group(t.program.mine, workouts.map(w => [encodeSuggestion({ kind: 'workout', id: w.id }), w.name])));
    sel.append(group(t.program.examples, examples.map(([id, name]) => [encodeSuggestion({ kind: 'workout', id }), name])));
    if (routes.length) sel.append(group(t.routes.mineTitle, routes.map(r => [encodeSuggestion({ kind: 'route', id: r.id }), routeName(r, lang)])));
    // A target that is gone keeps its place, so changing another day does not silently drop it
    if (current && !known.some(k => encodeSuggestion(k) === encodeSuggestion(current))) {
      sel.append(el('option', { value: encodeSuggestion(current), textContent: t.workouts.suggestMissing }));
    }
    sel.value = current ? encodeSuggestion(current) : '';
    sel.onchange = () => void save();
    return sel;
  }

  function renderToday() {
    const sug = todaySuggestion(host.plan(), Date.now());
    const name = sug && suggestionName(sug);
    $('todayPlan').hidden = !sug || !name;
    if (!sug || !name) return;
    $('todayPlanText').textContent = t.workouts.todaySuggest(sug.kind === 'route' ? t.history.tagRoute : t.history.tagWorkout, name);
    const use = $button('todayPlanUse');
    use.title = t.workouts.use;
    use.setAttribute('aria-label', t.workouts.use);
    use.onclick = () => { if (sug.kind === 'route') host.useRoute(sug.id); else host.useWorkout(sug.id); };
  }

  function render() {
    const plan = host.plan();
    const progress = weekProgress(plan, host.runs(), Date.now());
    $('planList').replaceChildren(...progress.map((p, i) => {
      const day = t.workouts.weekday(p.day);
      const input = el('input', { type: 'number', min: '0', max: '600', step: '5', value: String(plan.minutes[i] ?? 0) });
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-label', t.workouts.target(day));
      input.onchange = () => void save();
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

  async function save() {
    const plan = planFromMinutes(
      [...$('planList').querySelectorAll('input')].map(i => i.valueAsNumber),
      [...$('planList').querySelectorAll<HTMLSelectElement>('select.plan-suggest')].map(s => decodeSuggestion(s.value)),
    );
    try { await host.savePlan(plan); } catch (e) { $('planSummary').textContent = t.workouts.failed(String(e)); return; }
    render();
  }

  return { render, renderToday };
}
