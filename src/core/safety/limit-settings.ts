// The speed limit and the step per command as the app stores and edits them: the storage keys, the stored format (a limit
// above 6 km/h counts only if it was stored as confirmed) and checking what the person types. The treadmill library only
// gets the numbers (setLimits); this is the app's part.

import { DEFAULT_SPEED_LIMIT, LIMIT_CONFIRM_ABOVE, LIMIT_MAX, LIMIT_MIN, MAX_STEP_MAX, MAX_STEP_MIN } from 'ftms-treadmill';

const EPS = 1e-9;

export const LIMIT_STORAGE_KEY = 'walkflow.speedLimit';
/** Key used by the prototype */
export const LEGACY_LIMIT_KEY = 'cap';
export const MAX_STEP_STORAGE_KEY = 'walkflow.maxStep';

/** Why a new speed limit was not taken (decideLimitChange) */
export type LimitProblem =
  | { code: 'limit-not-a-number' }
  | { code: 'limit-out-of-range'; min: number; max: number };

/** Why a stored limit was not taken as it was (loadLimit) */
export type LimitNote =
  | { code: 'limit-stored-unconfirmed'; value: number; applied: number }
  | { code: 'limit-legacy-not-adopted'; value: number; above: number };

export type LimitDecision =
  | { ok: true; value: number; needsConfirmation: boolean }
  | { ok: false; reason: LimitProblem };

export function decideLimitChange(raw: string, current: number): LimitDecision {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return { ok: false, reason: { code: 'limit-not-a-number' } };
  const value = Math.round(v * 10) / 10;
  if (value < LIMIT_MIN || value > LIMIT_MAX) {
    return { ok: false, reason: { code: 'limit-out-of-range', min: LIMIT_MIN, max: LIMIT_MAX } };
  }
  return { ok: true, value, needsConfirmation: value > LIMIT_CONFIRM_ABOVE && value > current };
}

export function serializeLimit(value: number, confirmedAbove6: boolean): string {
  return JSON.stringify({ value, confirmedAbove6 });
}

function validStoredLimit(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= LIMIT_MIN && v <= LIMIT_MAX;
}

/**
 * Loads the stored limit. Values above 6 km/h only count if they were stored as confirmed, and then say so (`confirmed`).
 * The prototype value ("cap") was never confirmed and is therefore only adopted up to 6 km/h.
 */
export function loadLimit(stored: string | null, legacyCap: string | null): { value: number; note?: LimitNote; confirmed?: true } {
  if (stored !== null) {
    try {
      const o = JSON.parse(stored) as { value?: unknown; confirmedAbove6?: unknown };
      if (validStoredLimit(o.value)) {
        if (o.value <= LIMIT_CONFIRM_ABOVE) return { value: o.value };
        if (o.confirmedAbove6 === true) return { value: o.value, confirmed: true };
        return { value: DEFAULT_SPEED_LIMIT, note: { code: 'limit-stored-unconfirmed', value: o.value, applied: DEFAULT_SPEED_LIMIT } };
      }
    } catch { /* broken → fall through */ }
  } else if (legacyCap !== null) {
    const v = parseFloat(legacyCap);
    if (validStoredLimit(v)) {
      if (v <= LIMIT_CONFIRM_ABOVE) return { value: v };
      return { value: DEFAULT_SPEED_LIMIT, note: { code: 'limit-legacy-not-adopted', value: v, above: LIMIT_CONFIRM_ABOVE } };
    }
  }
  return { value: DEFAULT_SPEED_LIMIT };
}

/** The step per command as typed in the settings; null if outside MAX_STEP_MIN..MAX_STEP_MAX */
export function parseMaxStep(raw: string): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v < MAX_STEP_MIN - EPS || v > MAX_STEP_MAX + EPS) return null;
  return Math.round(v * 10) / 10;
}
