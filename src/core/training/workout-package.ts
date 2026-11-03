// The workout package: one JSON file that holds a workout with what goes with it (the name and a description in several
// languages, credit, tags), so it can be shared, kept in a catalogue and installed. Format "walkflow-workout", version 1;
// described in docs/WORKOUT-PACKAGE.md. No DOM and no storage here.
//
// A package is data and never code. Reading one checks everything (readWorkout) and makes a new workout: an id or a date
// inside the file is not used, so an import can never replace a workout that is already there. The speeds in a package are
// what the person who made it ran at; the speed limit of the person who imports it still applies when it runs.

import { plainName, readCredit, readLangMap, type Credit } from '../routes/routes';
import type { ProgramStep } from './program';
import { readWorkout, WORKOUT_NAME_MAX, type Workout } from './workouts';

export const WORKOUT_PACKAGE_FORMAT = 'walkflow-workout';
export const WORKOUT_PACKAGE_VERSION = 1;
/** 200 steps are about 12 KB; the rest is texts in many languages */
export const WORKOUT_PACKAGE_MAX_CHARS = 500_000;
/** Language key for a text whose language is not known (a name the person typed) */
const UNDETERMINED = 'und';

export interface WorkoutPackage extends Credit {
  format: typeof WORKOUT_PACKAGE_FORMAT;
  version: number;
  /** Language code → name; at least one. "und" for a name whose language is not known. */
  name: Record<string, string>;
  /** Language code → text */
  description?: Record<string, string>;
  steps: ProgramStep[];
}

/** The package of a workout. It has no id and no date. */
export function workoutPackage(w: Workout): WorkoutPackage {
  return {
    format: WORKOUT_PACKAGE_FORMAT,
    version: WORKOUT_PACKAGE_VERSION,
    name: w.names ? { ...w.names } : { [UNDETERMINED]: w.name },
    ...(w.meta?.tags ? { tags: [...w.meta.tags] } : {}),
    ...(w.meta?.author ? { author: w.meta.author } : {}),
    ...(w.meta?.license ? { license: w.meta.license } : {}),
    ...(w.meta?.source ? { source: w.meta.source } : {}),
    ...(w.texts ? { description: { ...w.texts } } : {}),
    steps: w.steps.map(s => ({ ...s })),
  };
}

/** JSON with one step per line, so a change to a workout shows line by line in a review */
export function serializeWorkoutPackage(p: WorkoutPackage): string {
  const { steps, ...head } = p;
  const lines = steps.map(s => `    ${JSON.stringify(s).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`);
  return `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "steps": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export type WorkoutPackageResult =
  | { ok: true; workout: Workout }
  | { ok: false; reason: 'unreadable' | 'tooLarge' | 'newer' | 'invalid' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads the text of a package file into a new workout with the given id and time. */
export function readWorkoutPackage(text: string, id: string, now: number): WorkoutPackageResult {
  if (text.length > WORKOUT_PACKAGE_MAX_CHARS) return { ok: false, reason: 'tooLarge' };
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: 'unreadable' }; }
  if (!isObject(v) || v.format !== WORKOUT_PACKAGE_FORMAT) return { ok: false, reason: 'unreadable' };
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return { ok: false, reason: 'invalid' };
  if (v.version > WORKOUT_PACKAGE_VERSION) return { ok: false, reason: 'newer' };
  const names = readLangMap(v.name, WORKOUT_NAME_MAX, true);
  const name = names && plainName(names);
  if (!names || !name) return { ok: false, reason: 'invalid' };
  // A name without a language is just the name; names are kept only when there are real languages
  const onlyUnknown = Object.keys(names).every(k => k === UNDETERMINED);
  const workout = readWorkout({
    id, name, ...(onlyUnknown ? {} : { names }), steps: v.steps, updated: now,
    texts: v.description, meta: readCredit(v),
  });
  return workout ? { ok: true, workout } : { ok: false, reason: 'invalid' };
}

/** The name of the file to save a package as */
export function workoutPackageFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'workout'}.walkflow`;
}
