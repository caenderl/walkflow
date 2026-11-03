// What the connected treadmill can do with the incline, and the levels the person has set for it.
// The treadmill is asked (FTMS features and the supported inclination range); nothing here is assumed.

import type { Features, Range } from './ftms';

/** Fitness Machine Feature bit 3: the incline is part of the treadmill data. */
const MACHINE_INCLINATION = 0x0008;
/** Target Setting Feature bit 1: the treadmill accepts a target incline. */
const TARGET_INCLINATION = 0x0002;

export const INCLINE_LEVEL_MIN = -10;
export const INCLINE_LEVEL_MAX = 40;
export const INCLINE_LEVELS_MAX = 20;

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

/** "0 2.5 5; 7,5" → [0, 2.5, 5, 7.5], sorted, without repeats and without what the app does not allow. */
export function parseLevels(text: string): number[] {
  const out = new Set<number>();
  for (const token of text.split(/[\s;]+/)) {
    const v = Number(token.replace(/,$/, '').replace(',', '.'));
    if (token === '' || !Number.isFinite(v)) continue;
    const r = round1(v);
    if (r >= INCLINE_LEVEL_MIN && r <= INCLINE_LEVEL_MAX) out.add(r);
  }
  return [...out].sort((a, b) => a - b).slice(0, INCLINE_LEVELS_MAX);
}

export function formatLevels(levels: readonly number[]): string {
  return levels.join(' ');
}

/** The levels the treadmill can reach: those outside its reported range are left out. */
export function usableLevels(levels: readonly number[], range: Range | undefined): { levels: number[]; dropped: number } {
  const ok = range ? levels.filter(l => l >= range.min && l <= range.max) : [...levels];
  return { levels: ok, dropped: levels.length - ok.length };
}

/** The value that is sent: inside the reported range, with the 0.1 % resolution of the protocol. */
export function clampIncline(pct: number, range: Range | undefined): number {
  const v = round1(pct);
  if (!range || Number.isNaN(v)) return v;
  return Math.min(range.max, Math.max(range.min, v));
}
