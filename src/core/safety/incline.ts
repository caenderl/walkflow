// What the connected treadmill can do with the incline, and the number of levels the person has set for it.
// The treadmill is asked (FTMS features and the supported inclination range); nothing here is assumed.

import type { Features, Range } from '../protocol/ftms';

/** Fitness Machine Feature bit 3: the incline is part of the treadmill data. */
const MACHINE_INCLINATION = 0x0008;
/** Target Setting Feature bit 1: the treadmill accepts a target incline. */
const TARGET_INCLINATION = 0x0002;

/** The most levels the settings offer */
export const INCLINE_LEVELS_MAX = 10;

export interface InclineSupport {
  /** Set Inclination is accepted: the incline can be controlled from the app */
  settable: boolean;
  /** The incline comes with the treadmill data: it can be shown */
  reported: boolean;
}

/**
 * Features say what the treadmill supports. Without readable features the range characteristic is the only
 * hint, and an empty range (min = max) never counts as controllable.
 */
export function inclineSupport(features: Features | undefined, range: Range | undefined): InclineSupport {
  const usableRange = range !== undefined && range.max > range.min;
  if (!features) return { settable: usableRange, reported: false };
  const accepted = (features.target & TARGET_INCLINATION) !== 0;
  return {
    settable: accepted && (range === undefined || usableRange),
    reported: (features.machine & MACHINE_INCLINATION) !== 0,
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The number of levels from the settings (a whole number from 0 to INCLINE_LEVELS_MAX); anything else counts as none */
export function parseLevelCount(raw: string | null | undefined): number {
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return 0;
  const n = Number(raw);
  return n <= INCLINE_LEVELS_MAX ? n : 0;
}

/**
 * The levels of a treadmill with `count` of them: spread evenly over the range the treadmill reported, both ends
 * included (a single level is the top of the range). Always inside that range; none without a count or a range.
 */
export function levelsFromCount(count: number, range: Range | undefined): number[] {
  if (!Number.isInteger(count) || count < 1 || count > INCLINE_LEVELS_MAX || !range || !(range.max > range.min)) return [];
  if (count === 1) return [round1(range.max)];
  return Array.from({ length: count }, (_, i) => round1(Math.min(range.max, Math.max(range.min, range.min + ((range.max - range.min) * i) / (count - 1)))));
}

/** The value that is sent: inside the reported range, with the 0.1 % resolution of the protocol. */
export function clampIncline(pct: number, range: Range | undefined): number {
  const v = round1(pct);
  if (!range || Number.isNaN(v)) return v;
  return Math.min(range.max, Math.max(range.min, v));
}
