// The stage of the training view: what the person has chosen (a workout, a route or nothing) with its details, and as the main
// element the steps of a workout, the map of a route or the speed chart. It also starts what was chosen: workouts and routes
// run the same way, through the program runner. Drawing is display only.

import type { RunRecorder, RunTag } from '../../core/history/runs';
import { routeDescription, routeName } from '../../core/routes/route-examples';
import { fmtDistance, fmtLength, programLength, type ProgramRunner, type ProgramStep } from '../../core/training/program';
import { ACTIVE_STORAGE_KEY, readActive, type Active } from '../../core/training/selection';
import type { SpeedGovernor, StandstillDetector } from '../../core/safety/safety';
import { lang, t } from '../../i18n/i18n';
import { bindText } from '../i18n-dom';
import type { setupRoutes } from '../routes/route-ui';
import { $, $button } from '../ui';
import { store } from '../store';
import type { setupInterval } from '../workouts/interval-ui';
import type { setupWorkouts } from '../workouts/workout-ui';

/** What the training view is about: a workout, a route, or nothing (free training). Chosen in the workouts and routes views,
 *  remembered across visits. Kept apart from the stage because those views ask for it while they are being set up. */
export function loadChosen() {
  let kind: Active = readActive(store.get(ACTIVE_STORAGE_KEY));
  return {
    get: () => kind,
    set(next: Active) { kind = next; store.set(ACTIVE_STORAGE_KEY, next ?? ''); },
  };
}
export type Chosen = ReturnType<typeof loadChosen>;

export interface StageHost {
  chosen: Chosen;
  workouts: Pick<ReturnType<typeof setupWorkouts>, 'selectedInfo' | 'refresh'>;
  routes: Pick<ReturnType<typeof setupRoutes>, 'current' | 'mapActive' | 'refresh' | 'refreshGoal' | 'restart' | 'walkRequest'>;
  interval: Pick<ReturnType<typeof setupInterval>, 'render' | 'renderPreview' | 'reset'>;
  runner: ProgramRunner;
  recorder: RunRecorder;
  governor: SpeedGovernor;
  standstill: StandstillDetector;
  connected(): boolean;
  effectiveMax(): number;
  /** The question before a start, with an optional introduction */
  confirmStart(intro?: string): Promise<boolean>;
  /** The speed chart is drawn again (it is not drawn while hidden) */
  redrawChart(): void;
}

export function setupStage(host: StageHost) {
  const { workouts, routes, interval, runner, recorder } = host;
  const { chosen } = host;
  let activeRun: { kind: RunTag['kind']; name: string } | null = null;

  /** What the Start button starts, if what was chosen still exists */
  function effectiveActive(): Active {
    if (chosen.get() === 'workout' && workouts.selectedInfo()) return 'workout';
    if (chosen.get() === 'route' && routes.current()) return 'route';
    return null;
  }

  function setActive(kind: Active) {
    chosen.set(kind);
    routes.refresh();
    workouts.refresh();
    render();
  }

  /** The chosen workout or route with its details, and as the main element the steps of a workout, the map of a route (if
   *  the map is on) or the speed chart. Display only. */
  function render() {
    const kind = effectiveActive();
    const p = runner.progress();
    const runningSteps = p !== null && activeRun?.kind === 'workout';
    const mode = runningSteps || kind === 'workout' ? 'interval' : kind === 'route' && routes.mapActive() ? 'map' : 'chart';
    const stage = $('stage');
    const was = stage.dataset.mode;
    stage.dataset.mode = mode;
    stage.dataset.kind = kind ?? '';

    const workout = kind === 'workout' ? workouts.selectedInfo() : null;
    const route = kind === 'route' ? routes.current() : null;
    $('stageHead').hidden = $('stageInfo').hidden = !kind;
    $('shKind').textContent = kind === 'workout' ? t.history.tagWorkout : t.history.tagRoute;
    $('shName').textContent = workout?.name ?? (route ? routeName(route.route, lang) : '');
    $('shInfo').textContent = workout ? t.program.summary(workout.steps.length, fmtLength(programLength(workout.steps))) : route?.info ?? '';
    const desc = route ? routeDescription(route.route, lang) : workout?.description ?? null;
    $('shDesc').textContent = desc?.text ?? '';
    $('shDesc').hidden = !desc;
    if (desc?.lang) $('shDesc').lang = desc.lang; else $('shDesc').removeAttribute('lang');
    const clear = $button('shClear');
    clear.textContent = t.stage.clear;
    clear.disabled = runner.active;

    $('stageInterval').hidden = mode !== 'interval';
    if (runningSteps) interval.render(p, host.governor.target);
    else if (workout) interval.renderPreview(workout.steps);
    $('stageChart').hidden = mode !== 'chart';
    $('stageFreeHint').hidden = kind !== null;
    // The label stays "Start" (a longer one does not fit the button); what it starts is the tooltip
    $('startLabel').textContent = t.control.start;
    $('start').title = kind === 'workout' ? t.program.start : kind === 'route' ? t.routes.walk : '';
    if (mode === 'chart' && was !== 'chart') host.redrawChart();
  }

  /**
   * Workouts and routes start the same way: confirmation, connection check, then the runner with its ramp, limit and
   * stop rules. `tag` says what the run was, so the history can show it. A route is a workout of one distance step.
   */
  async function runSteps(steps: ProgramStep[], tag: Omit<RunTag, 'completed'>, intro: string, onStart?: () => void) {
    const max = host.effectiveMax();
    const text = intro + (steps.some(s => s.speed > max) ? ` ${t.program.capped(max)}` : '');
    if (!(await host.confirmStart(text))) return;
    if (!host.connected()) return;
    onStart?.();
    const token = recorder.begin(tag);
    const mine = activeRun = { kind: tag.kind, name: tag.name };
    interval.reset();
    const result = await runner.run(steps);
    // A newer run may have replaced this one in the meantime
    if (activeRun === mine) activeRun = null;
    render();
    recorder.complete(token, result === 'finished');
    host.standstill.disarm();
    // The run is saved by now (or has failed): today's goal in the route card may have moved
    void recorder.settled().then(() => routes.refreshGoal());
  }

  async function runProgram() {
    const selected = workouts.selectedInfo();
    if (!selected?.steps.length) { bindText($('progStatus'), () => t.program.empty); return; }
    await runSteps(selected.steps, { kind: 'workout', id: selected.id, name: selected.name },
      t.program.confirm(selected.steps.length, fmtLength(programLength(selected.steps))));
  }

  async function runRoute() {
    const walk = routes.walkRequest();
    if (!walk) { bindText($('progStatus'), () => t.routes.cannotWalk); return; }
    const shown = Math.min(walk.kmh, host.effectiveMax());
    await runSteps(walk.steps, { kind: 'route', id: walk.route.id, name: routeName(walk.route, lang) },
      t.routes.walkConfirm(routeName(walk.route, lang), fmtDistance(walk.steps[0]?.meters ?? 0), shown), () => routes.restart());
  }

  return {
    effectiveActive, setActive, render, runProgram, runRoute,
  };
}
