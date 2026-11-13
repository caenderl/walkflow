// What the training view shows while a workout with steps runs: a strip of the steps (width = duration, height = speed)
// and the next ones. Pure data here so it can be tested; src/ui/workouts/interval-ui.ts draws it. Display only.

import type { ProgramStep } from './program';

export interface StepBar {
  /** Share of the whole workout, the widths add up to 1 */
  width: number;
  /** Speed relative to the fastest step, at least MIN_HEIGHT */
  height: number;
}

const MIN_HEIGHT = 0.15;
/** A step of 0 s or a few metres still gets a visible sliver */
const MIN_SECONDS = 1;

/** Seconds a step takes; a distance step at its own speed (the belt is capped, so this is an estimate) */
function stepSeconds(s: ProgramStep): number {
  const sec = s.sec !== undefined ? s.sec : s.speed > 0 ? s.meters / (s.speed / 3.6) : 0;
  return Math.max(MIN_SECONDS, sec);
}

export function stepBars(steps: readonly ProgramStep[]): StepBar[] {
  if (!steps.length) return [];
  const seconds = steps.map(stepSeconds);
  const total = seconds.reduce((a, b) => a + b, 0);
  const fastest = Math.max(...steps.map(s => s.speed), 0.1);
  return steps.map((s, i) => ({ width: seconds[i]! / total, height: Math.max(MIN_HEIGHT, s.speed / fastest) }));
}

/** The steps after `index` (-1 = before the first), at most `count` */
export function upcoming(steps: readonly ProgramStep[], index: number, count: number): ProgramStep[] {
  return steps.slice(index + 1, index + 1 + count);
}

/** The count of a timed step is in its last seconds: the panel blinks it red */
const ENDING_SOON_SECONDS = 10;

export function endingSoon(left: { sec: number } | { meters: number } | null): boolean {
  return left !== null && 'sec' in left && left.sec <= ENDING_SOON_SECONDS;
}
