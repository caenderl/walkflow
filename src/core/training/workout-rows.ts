// A step as the workout editor shows it (an amount in a unit) and the conversion to and from a program step.
// Row values are metric (metres, km/h); the editor converts to the person's units for display.

import type { ProgramStep } from './program';

export type Unit = 'min' | 's' | 'm';

export interface Row {
  unit: Unit;
  amount: number;
  speed: number;
  /** Percent; undefined = none */
  incline?: number;
}

export function toRow(step: ProgramStep): Row {
  const incline = step.incline === undefined ? {} : { incline: step.incline };
  if (step.meters !== undefined) return { unit: 'm', amount: step.meters, speed: step.speed, ...incline };
  return step.sec % 60 === 0
    ? { unit: 'min', amount: step.sec / 60, speed: step.speed, ...incline }
    : { unit: 's', amount: step.sec, speed: step.speed, ...incline };
}

/** null = the numbers are not usable */
export function toStep(row: Row): ProgramStep | null {
  if (!Number.isFinite(row.amount) || !Number.isFinite(row.speed) || row.amount < 0) return null;
  const incline = row.incline !== undefined && Number.isFinite(row.incline) ? { incline: row.incline } : {};
  if (row.unit === 'm') return { meters: Math.round(row.amount), speed: row.speed, ...incline };
  return { sec: Math.round(row.amount * (row.unit === 'min' ? 60 : 1)), speed: row.speed, ...incline };
}
