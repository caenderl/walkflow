// Saved workouts (a program with a name) and the weekly plan. No DOM and no storage here, so it is all testable.
// What comes from a backup file or from input fields is checked field by field: a workout can only be a plain,
// bounded list of steps, nothing else ever reaches the runner.

import { newId } from '../id';
import type { ProgramStep } from './program';
import type { RunSummary } from '../history/runs';
import { countable, weekStart } from '../history/stats';

export interface Workout {
  id: string;
  name: string;
  steps: ProgramStep[];
  /** Unix ms of the last change */
  updated: number;
}

export const WORKOUT_MAX_STEPS = 200;
export const WORKOUT_NAME_MAX = 60;
/** Per step. The speed is capped to the personal limit when the program runs; this only bounds what is stored. */
const MAX_SPEED = 30;
const MAX_STEP_SEC = 86_400;
const MAX_STEP_METERS = 100_000;
/** Percent. Only bounds what is stored: nothing sends it to the treadmill. */
const INCLINE_MIN = -10;
const INCLINE_MAX = 40;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function readStep(v: unknown): ProgramStep | null {
  if (!isObject(v)) return null;
  const { sec, meters, speed, incline } = v;
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0 || speed > MAX_SPEED) return null;
  if (incline !== undefined && !(typeof incline === 'number' && incline >= INCLINE_MIN && incline <= INCLINE_MAX)) return null;
  const extra = incline === undefined ? {} : { incline };
  if (sec !== undefined && meters === undefined) return isInt(sec, 0, MAX_STEP_SEC) ? { sec, speed, ...extra } : null;
  // A distance step without a speed could never end
  if (meters !== undefined && sec === undefined) return isInt(meters, 0, MAX_STEP_METERS) && speed > 0 ? { meters, speed, ...extra } : null;
  return null;
}

export function readWorkout(v: unknown): Workout | null {
  if (!isObject(v)) return null;
  const { id, name, steps, updated } = v;
  if (typeof id !== 'string' || !id || id.length > 64) return null;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > WORKOUT_NAME_MAX) return null;
  if (!Array.isArray(steps) || !steps.length || steps.length > WORKOUT_MAX_STEPS) return null;
  if (typeof updated !== 'number' || !Number.isFinite(updated)) return null;
  const out: ProgramStep[] = [];
  for (const s of steps) {
    const step = readStep(s);
    if (!step) return null;
    out.push(step);
  }
  return { id, name: trimmed, steps: out, updated };
}

/** Valid workouts in order of first appearance; with the same id the later one wins. */
export function readWorkouts(v: unknown): { workouts: Workout[]; invalid: number } {
  if (!Array.isArray(v)) return { workouts: [], invalid: 0 };
  const byId = new Map<string, Workout>();
  let invalid = 0;
  for (const item of v) {
    const w = readWorkout(item);
    if (w) byId.set(w.id, w); else invalid++;
  }
  return { workouts: [...byId.values()], invalid };
}

export const newWorkoutId = newId;

/** Built-in examples, neutral: just a way to try the formats. Names come from the texts (id). */
export interface Template {
  id: 'intervals' | 'steady' | 'blocks';
  steps: ProgramStep[];
}

export const TEMPLATES: readonly Template[] = [
  { id: 'intervals', steps: [{ sec: 120, speed: 2 }, { sec: 180, speed: 3.5 }, { sec: 60, speed: 5 }, { sec: 180, speed: 3.5 }, { sec: 120, speed: 2 }] },
  { id: 'steady', steps: [{ sec: 1800, speed: 4 }] },
  {
    id: 'blocks',
    steps: [
      { sec: 180, speed: 2.5 },
      ...Array.from({ length: 4 }, (): ProgramStep[] => [{ meters: 400, speed: 4 }, { meters: 200, speed: 2.5 }]).flat(),
      { sec: 180, speed: 2.5 },
    ],
  },
];

// ---------- Weekly plan ----------

/** A workout or route that is proposed for a day. Only a pointer: the target is looked up when it is shown. */
export interface PlanSuggestion {
  kind: 'workout' | 'route';
  id: string;
}

/** A suggestion as the value of a form field: "workout:<id>" or "route:<id>" */
export const encodeSuggestion = (s: PlanSuggestion) => `${s.kind}:${s.id}`;

/** null for an empty or malformed value (the id itself may contain colons) */
export function decodeSuggestion(value: string): PlanSuggestion | null {
  const i = value.indexOf(':');
  const kind = value.slice(0, i), id = value.slice(i + 1);
  return i > 0 && id && (kind === 'workout' || kind === 'route') ? { kind, id } : null;
}

/**
 * Target minutes of moving time per weekday, Monday first. 0 = no target (rest day). A day may also point to a
 * workout or route as a suggestion; whether the day is done is still decided by the minutes alone.
 */
export interface WeekPlan {
  minutes: number[];
  suggest?: (PlanSuggestion | null)[];
}

export const PLAN_MAX_MINUTES = 600;

function readSuggest(v: unknown): (PlanSuggestion | null)[] | undefined {
  if (!Array.isArray(v) || v.length !== 7) return undefined;
  const out: (PlanSuggestion | null)[] = [];
  for (const s of v as unknown[]) {
    if (s === null) { out.push(null); continue; }
    if (!isObject(s) || (s.kind !== 'workout' && s.kind !== 'route')) return undefined;
    if (typeof s.id !== 'string' || !s.id || s.id.length > 64) return undefined;
    out.push({ kind: s.kind, id: s.id });
  }
  return out.some(s => s !== null) ? out : undefined;
}

export function readPlan(v: unknown): WeekPlan | null {
  if (!isObject(v) || !Array.isArray(v.minutes) || v.minutes.length !== 7) return null;
  if (!v.minutes.every(m => isInt(m, 0, PLAN_MAX_MINUTES))) return null;
  // Damaged suggestions cost the suggestions, not the plan
  const suggest = readSuggest(v.suggest);
  return { minutes: v.minutes as number[], ...(suggest ? { suggest } : {}) };
}

/** From input fields: whatever was typed ends up as a whole number in range */
export function planFromMinutes(values: readonly number[], suggest?: WeekPlan['suggest']): WeekPlan {
  const kept = readSuggest(suggest);
  return {
    minutes: Array.from({ length: 7 }, (_, i) => {
      const v = values[i] ?? 0;
      return Number.isFinite(v) ? Math.min(PLAN_MAX_MINUTES, Math.max(0, Math.round(v))) : 0;
    }),
    ...(kept ? { suggest: kept } : {}),
  };
}

/** What the plan proposes for the weekday of `now` (Monday first), if anything */
export function todaySuggestion(plan: WeekPlan, now: number): PlanSuggestion | null {
  return plan.suggest?.[(new Date(now).getDay() + 6) % 7] ?? null;
}

export interface DayProgress {
  /** Local midnight of the day */
  day: number;
  /** Minutes planned, 0 = none */
  target: number;
  /** Moving time of the runs that started on this day */
  doneSec: number;
  met: boolean;
  today: boolean;
}

/** The week of `now`, Monday first. Demo runs do not count. */
export function weekProgress(plan: WeekPlan, runs: readonly RunSummary[], now: number): DayProgress[] {
  const monday = new Date(weekStart(now));
  const at = (offset: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset).getTime();
  const days = Array.from({ length: 8 }, (_, i) => at(i));
  const done = new Array<number>(7).fill(0);
  for (const r of countable(runs)) {
    if (r.start < days[0]! || r.start >= days[7]!) continue;
    let i = 6;
    while (days[i]! > r.start) i--;
    done[i]! += r.movingSec;
  }
  return Array.from({ length: 7 }, (_, i) => {
    const target = plan.minutes[i] ?? 0;
    return {
      day: days[i]!,
      target,
      doneSec: done[i]!,
      met: target > 0 && done[i]! >= target * 60,
      today: now >= days[i]! && now < days[i + 1]!,
    };
  });
}

export interface DayGoal {
  /** Minutes planned for today */
  target: number;
  /** Whole minutes of moving time so far today */
  doneMin: number;
  /** Whole minutes still missing, 0 once the target is met */
  leftMin: number;
}

/** Where today stands against its target; null on a day without one */
export function todayGoal(plan: WeekPlan, runs: readonly RunSummary[], now: number): DayGoal | null {
  const day = weekProgress(plan, runs, now).find(p => p.today);
  if (!day || day.target <= 0) return null;
  return {
    target: day.target,
    doneMin: Math.floor(day.doneSec / 60),
    leftMin: Math.max(0, Math.ceil(day.target - day.doneSec / 60)),
  };
}
