// Statistics over the saved runs. Calendar maths in local time; weeks start on Monday.

import type { RunSummary } from './runs';

export interface Totals {
  runs: number;
  /** m */
  dist: number;
  movingSec: number;
  kcal: number;
}

export interface WeekTotal {
  /** Local Monday 00:00 */
  start: number;
  dist: number;
}

/** Demo runs are listed, but they do not count. */
export const countable = (runs: readonly RunSummary[]) => runs.filter(r => r.source !== 'demo');

export function totals(runs: readonly RunSummary[]): Totals {
  const t: Totals = { runs: 0, dist: 0, movingSec: 0, kcal: 0 };
  for (const r of runs) {
    t.runs++;
    t.dist += r.dist;
    t.movingSec += r.movingSec;
    t.kcal += r.kcal ?? 0;
  }
  return t;
}

// Built from the local date parts, so a clock change does not shift the result by an hour
export function weekStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

export function monthStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Local calendar day as a running number */
function dayNumber(ts: number): number {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function overview(runs: readonly RunSummary[], now: number): { week: Totals; month: Totals; all: Totals } {
  const w = weekStart(now), m = monthStart(now);
  return {
    week: totals(runs.filter(r => r.start >= w)),
    month: totals(runs.filter(r => r.start >= m)),
    all: totals(runs),
  };
}

function weekSums(runs: readonly RunSummary[]): Map<number, number> {
  const sums = new Map<number, number>();
  for (const r of runs) {
    const w = weekStart(r.start);
    sums.set(w, (sums.get(w) ?? 0) + r.dist);
  }
  return sums;
}

/** The last `weeks` weeks, oldest first, ending with the current one; weeks without runs included. */
export function weeklyDistance(runs: readonly RunSummary[], now: number, weeks: number): WeekTotal[] {
  const sums = weekSums(runs);
  const cur = new Date(weekStart(now));
  return Array.from({ length: weeks }, (_, i) => {
    const start = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 7 * (weeks - 1 - i)).getTime();
    return { start, dist: sums.get(start) ?? 0 };
  });
}

/** Days in a row with at least one run. Today without a run (yet) does not break the current streak. */
export function streaks(runs: readonly RunSummary[], now: number): { current: number; longest: number } {
  const days = new Set(runs.map(r => dayNumber(r.start)));
  const sorted = [...days].sort((a, b) => a - b);
  let longest = 0, len = 0;
  sorted.forEach((d, i) => {
    len = i > 0 && d === sorted[i - 1]! + 1 ? len + 1 : 1;
    longest = Math.max(longest, len);
  });
  const today = dayNumber(now);
  let d = days.has(today) ? today : today - 1, current = 0;
  while (days.has(d)) { current++; d--; }
  return { current, longest };
}

export interface Records {
  longestDist?: RunSummary;
  longestTime?: RunSummary;
  bestWeek?: WeekTotal;
}

export function records(runs: readonly RunSummary[]): Records {
  const r: Records = {};
  for (const run of runs) {
    if (!r.longestDist || run.dist > r.longestDist.dist) r.longestDist = run;
    if (!r.longestTime || run.movingSec > r.longestTime.movingSec) r.longestTime = run;
  }
  for (const [start, dist] of weekSums(runs)) {
    if (!r.bestWeek || dist > r.bestWeek.dist) r.bestWeek = { start, dist };
  }
  return r;
}
