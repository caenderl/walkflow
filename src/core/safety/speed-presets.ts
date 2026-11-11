// The three speed presets of the training view (slow, mid, run), set in settings → treadmill. Pure logic, tested in
// speed-presets.test.ts. Values are km/h.
//
// Safety: a preset never commands more than the current maximum. A preset above a lowered limit stays stored (the limit
// may be raised again), but presetCommand returns null for it and its button is disabled. It is not clamped to the
// limit: a button labelled "run 5.0" that drives 3.0 would say one thing and do another, and clamping two presets to the
// same limit would give two buttons the same speed, breaking slow < mid < run. Disabling keeps the enabled buttons in
// strict order. The governor caps every command to the limit anyway.

import { LIMIT_MAX } from './safety';

export type PresetKey = 'slow' | 'mid' | 'run';
export const PRESET_KEYS: readonly PresetKey[] = ['slow', 'mid', 'run'];
export type SpeedPresets = Record<PresetKey, number>;

/** The lowest speed a preset may have */
export const PRESET_MIN = 2;
/** Spread like the old quick buttons (2 to 5 km/h), within the default limit of 6 km/h */
export const DEFAULT_SPEED_PRESETS: Readonly<SpeedPresets> = Object.freeze({ slow: 2.5, mid: 3.5, run: 5 });
export const SPEED_PRESETS_STORAGE_KEY = 'walkflow.speedPresets';

const EPS = 1e-9;
const round01 = (x: number) => Math.round(x * 10) / 10;

const ordered = (p: SpeedPresets) => p.slow < p.mid - EPS && p.mid < p.run - EPS;

export function serializeSpeedPresets(p: SpeedPresets): string {
  return JSON.stringify({ slow: p.slow, mid: p.mid, run: p.run });
}

/**
 * The stored presets. Anything missing, broken, out of order or outside [PRESET_MIN, LIMIT_MAX] gives the defaults.
 * Presets above the current limit are kept: presetCommand does not let them through.
 */
export function loadSpeedPresets(stored: string | null): SpeedPresets {
  if (stored) {
    try {
      const o = JSON.parse(stored) as Record<string, unknown> | null;
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const values = PRESET_KEYS.map(k => o[k]);
        if (values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= PRESET_MIN - EPS && v <= LIMIT_MAX + EPS)) {
          const p = { slow: values[0], mid: values[1], run: values[2] } as SpeedPresets;
          if (ordered(p)) return p;
        }
      }
    } catch { /* broken → defaults */ }
  }
  return { ...DEFAULT_SPEED_PRESETS };
}

export type PresetCheck =
  | { ok: true; presets: SpeedPresets }
  | { ok: false; error: 'notANumber' | 'range' | 'notAbovePrevious' | 'notBelowNext' };

/**
 * One preset typed in settings (km/h). Rounded to 0.1 km/h; it must lie within [PRESET_MIN, limit] and strictly
 * between its stored neighbours. Returns the new presets to store, or why it is refused (nothing is stored then):
 * not above the previous preset, or not below the next one.
 */
export function checkPresetChange(stored: SpeedPresets, key: PresetKey, kmh: number, limit: number): PresetCheck {
  if (!Number.isFinite(kmh)) return { ok: false, error: 'notANumber' };
  const value = round01(kmh);
  if (value < PRESET_MIN - EPS || value > limit + EPS) return { ok: false, error: 'range' };
  const i = PRESET_KEYS.indexOf(key);
  const prev = PRESET_KEYS[i - 1], next = PRESET_KEYS[i + 1];
  if (prev !== undefined && value <= stored[prev] + EPS) return { ok: false, error: 'notAbovePrevious' };
  if (next !== undefined && value >= stored[next] - EPS) return { ok: false, error: 'notBelowNext' };
  return { ok: true, presets: { ...stored, [key]: value } };
}

/** The speed a preset button asks for, or null (button disabled) while the preset is above the highest allowed speed */
export function presetCommand(presets: SpeedPresets, key: PresetKey, max: number): number | null {
  const v = presets[key];
  return Number.isFinite(max) && v <= max + EPS ? v : null;
}
