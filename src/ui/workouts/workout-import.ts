// Importing workouts: a package chosen in the workouts view, or opened from outside (double click). What is saved has passed
// readWorkoutPackage; a package always becomes a new workout and never replaces one that is there already. A file that comes
// from outside is never imported on its own: the person is asked first.

import { packageKind } from '../../core/share/package-kind';
import { fmtLength, programLength } from '../../core/training/program';
import { readWorkoutPackage, WORKOUT_PACKAGE_MAX_CHARS } from '../../core/training/workout-package';
import { newWorkoutId, workoutName, type Workout } from '../../core/training/workouts';
import type { WorkoutStore } from '../../data/workout-store';
import { lang, t } from '../../i18n/i18n';
import { confirmDialog } from '../components/dialogs';

export interface WorkoutImportHost {
  store(): Promise<WorkoutStore>;
  /** A message under the buttons, or null to clear it */
  setStatus(text: (() => string) | null): void;
  /** A workout was saved: the library is loaded again and the workout is selected */
  added(workout: Workout): Promise<void>;
}

type Failure = 'unreadable' | 'packageTooLarge' | 'packageNewer' | 'packageInvalid' | 'isRoutePackage';

const REASONS = { unreadable: 'unreadable', tooLarge: 'packageTooLarge', newer: 'packageNewer', invalid: 'packageInvalid' } as const;

export function setupWorkoutImport(host: WorkoutImportHost) {
  const fail = (key: Failure) => host.setStatus(() => t.workouts[key]);

  /** The text of a package of the right kind, or the message why not */
  function readText(file: { text?: string; error?: 'unreadable' | 'tooLarge' }): string | null {
    if (file.text === undefined) { fail(file.error === 'tooLarge' ? 'packageTooLarge' : 'unreadable'); return null; }
    const kind = packageKind(file.text);
    if (kind === 'route') { fail('isRoutePackage'); return null; }
    if (kind !== 'workout') { fail('unreadable'); return null; }
    return file.text;
  }

  async function importFile(file: File) {
    if (file.size > WORKOUT_PACKAGE_MAX_CHARS) { fail('packageTooLarge'); return; }
    let text: string;
    try { text = await file.text(); } catch { fail('unreadable'); return; }
    const checked = readText({ text });
    if (checked !== null) await importPackage(checked);
  }

  /** A package opened from outside: it is read and checked first, then the person is asked */
  async function openPackage(file: { name: string; text?: string; error?: 'unreadable' | 'tooLarge' }) {
    location.hash = '#workouts';
    const text = readText(file);
    if (text === null) return;
    const read = readWorkoutPackage(text, newWorkoutId(Date.now()), Date.now());
    if (!read.ok) { fail(REASONS[read.reason]); return; }
    const summary = t.program.summary(read.workout.steps.length, fmtLength(programLength(read.workout.steps)));
    if (!(await confirmDialog(t.workouts.openPackageTitle, [t.workouts.openPackageText(workoutName(read.workout, lang), summary)], t.workouts.openPackageConfirm))) return;
    await importPackage(text);
  }

  /** A package always becomes a new workout, with a new id */
  async function importPackage(text: string) {
    const read = readWorkoutPackage(text, newWorkoutId(Date.now()), Date.now());
    if (!read.ok) { fail(REASONS[read.reason]); return; }
    const workout = read.workout;
    try { await (await host.store()).put(workout); } catch (e) { host.setStatus(() => t.workouts.failed(String(e))); return; }
    await host.added(workout);
    host.setStatus(() => t.workouts.imported(workoutName(workout, lang)));
  }

  return { importFile, openPackage };
}
