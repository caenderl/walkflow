// The incline levels in the training view: how many the person says the treadmill has (a setting), the percent each level
// sends, and which level the card shows when the treadmill reports its incline. The app's part; the library only checks
// what the treadmill supports and clamps what is sent.

import type { Range } from 'ftms-treadmill/protocol';

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The fewest levels the settings offer: a single level is no choice */
export const INCLINE_LEVELS_MIN = 2;
/** The most levels the settings offer */
export const INCLINE_LEVELS_MAX = 10;

const validCount = (n: number) => Number.isInteger(n) && n >= INCLINE_LEVELS_MIN && n <= INCLINE_LEVELS_MAX;

/** The number of levels from the settings (0 for none, or INCLINE_LEVELS_MIN to INCLINE_LEVELS_MAX); anything else counts as none */
export function parseLevelCount(raw: string | null | undefined): number {
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return 0;
  const n = Number(raw);
  return validCount(n) ? n : 0;
}

/**
 * The levels slider in the settings runs from INCLINE_LEVELS_MIN - 1 to INCLINE_LEVELS_MAX: its first position is none,
 * then come the counts. Anything it cannot read counts as none.
 */
export function levelCountFromSlider(raw: string): number {
  return parseLevelCount(raw);
}

/** The slider position for a number of levels (none: the first position) */
export function sliderFromLevelCount(count: number): string {
  return String(validCount(count) ? count : INCLINE_LEVELS_MIN - 1);
}

/**
 * The levels of a treadmill whose highest level is `count`: level 0 to level `count`, so `count` + 1 of them (a sPad 500 has
 * 0 to 5), spread evenly over the range the treadmill reported, both ends included. Always inside that range; none without a
 * valid count or a range.
 */
export function levelsFromCount(count: number, range: Range | undefined): number[] {
  if (!validCount(count) || !range || !(range.max > range.min)) return [];
  return Array.from({ length: count + 1 }, (_, i) => round1(Math.min(range.max, Math.max(range.min, range.min + ((range.max - range.min) * i) / count))));
}

/** How long a chosen incline is shown although the treadmill still reports another (its motor takes a few seconds) */
export const INCLINE_SETTLE_MS = 15000;

/** The incline the person chose last, and when; null once the treadmill reported it (or gave up on it) */
export interface InclineChoice { pct: number; at: number }

/**
 * Which incline the card shows when the treadmill reports one: the reported one, so that a change on the treadmill itself
 * (its own buttons) shows in the app. Only a choice made in the app wins for a while, until the treadmill reports it
 * (its motor passes the levels in between) or INCLINE_SETTLE_MS are over.
 */
export function followReportedIncline(reported: number, choice: InclineChoice | null, now: number): { shown: number; choice: InclineChoice | null } {
  if (choice && Math.abs(reported - choice.pct) >= 0.05 && now - choice.at < INCLINE_SETTLE_MS) return { shown: choice.pct, choice };
  return { shown: round1(reported), choice: null };
}

/**
 * The level the treadmill is on: the one whose incline is nearest to the one it reports (its motor may stop a little off).
 * null without levels or without a reading.
 */
export function levelOf(reported: number, levels: readonly number[]): number | null {
  if (!levels.length || !Number.isFinite(reported)) return null;
  let best = 0;
  for (let i = 1; i < levels.length; i++) if (Math.abs(levels[i]! - reported) < Math.abs(levels[best]! - reported)) best = i;
  return best;
}
