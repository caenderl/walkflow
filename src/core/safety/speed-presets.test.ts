import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_LIMIT, LIMIT_MIN } from './safety';
import {
  checkPresetChange, DEFAULT_SPEED_PRESETS, loadSpeedPresets, PRESET_KEYS, PRESET_MIN, presetCommand,
  serializeSpeedPresets, type SpeedPresets,
} from './speed-presets';

const p = (slow: number, mid: number, run: number): SpeedPresets => ({ slow, mid, run });

describe('DEFAULT_SPEED_PRESETS', () => {
  it('are slow < mid < run, from the lowest preset speed up to within the default limit', () => {
    const d = DEFAULT_SPEED_PRESETS;
    expect(PRESET_KEYS).toEqual(['slow', 'mid', 'run']);
    expect(d.slow).toBeGreaterThanOrEqual(PRESET_MIN);
    expect(d.slow).toBeLessThan(d.mid);
    expect(d.mid).toBeLessThan(d.run);
    expect(d.run).toBeLessThanOrEqual(DEFAULT_SPEED_LIMIT);
  });
});

describe('loadSpeedPresets', () => {
  it('takes stored presets back as they were saved', () => {
    expect(loadSpeedPresets(serializeSpeedPresets(p(2.2, 3.1, 4.7)))).toEqual(p(2.2, 3.1, 4.7));
  });

  it('falls back to the defaults when nothing or something broken is stored', () => {
    for (const raw of [null, '', 'x', '{', '[]', 'null', '{"slow":2.5,"mid":3.5}', '{"slow":"2.5","mid":3.5,"run":5}']) {
      expect(loadSpeedPresets(raw)).toEqual(DEFAULT_SPEED_PRESETS);
    }
  });

  it('refuses stored presets that break the order or leave the allowed range', () => {
    for (const bad of [p(3, 3, 5), p(4, 3.5, 5), p(2.5, 5, 5), p(1.9, 3, 4), p(2.5, 3.5, 21), p(2.5, 3.5, Infinity), p(NaN, 3, 4)]) {
      expect(loadSpeedPresets(JSON.stringify(bad))).toEqual(DEFAULT_SPEED_PRESETS);
    }
  });

  it('keeps presets above the current limit stored (the limit can be raised again); presetCommand guards them', () => {
    expect(loadSpeedPresets(serializeSpeedPresets(p(2.5, 7, 9)))).toEqual(p(2.5, 7, 9));
  });
});

describe('checkPresetChange', () => {
  const stored = p(2.5, 3.5, 5);

  it('accepts a value between its neighbours and within 2.0 and the limit, rounded to 0.1 km/h', () => {
    expect(checkPresetChange(stored, 'mid', 4.04, 6)).toEqual({ ok: true, presets: p(2.5, 4, 5) });
    expect(checkPresetChange(stored, 'slow', 2, 6)).toEqual({ ok: true, presets: p(2, 3.5, 5) });
    expect(checkPresetChange(stored, 'run', 6, 6)).toEqual({ ok: true, presets: p(2.5, 3.5, 6) });
  });

  it('does not change the stored presets it was given', () => {
    checkPresetChange(stored, 'mid', 4, 6);
    expect(stored).toEqual(p(2.5, 3.5, 5));
  });

  it('refuses what is not a number', () => {
    expect(checkPresetChange(stored, 'mid', NaN, 6)).toEqual({ ok: false, error: 'notANumber' });
    expect(checkPresetChange(stored, 'mid', Infinity, 6)).toEqual({ ok: false, error: 'notANumber' });
  });

  it('refuses values below 2.0 km/h', () => {
    expect(checkPresetChange(stored, 'slow', 1.9, 6)).toEqual({ ok: false, error: 'range' });
    expect(checkPresetChange(stored, 'slow', 0, 6)).toEqual({ ok: false, error: 'range' });
    expect(checkPresetChange(stored, 'slow', -3, 6)).toEqual({ ok: false, error: 'range' });
  });

  it('never accepts a value above the current limit', () => {
    expect(checkPresetChange(stored, 'run', 6.1, 6)).toEqual({ ok: false, error: 'range' });
    expect(checkPresetChange(stored, 'run', 5.5, 4.5)).toEqual({ ok: false, error: 'range' });
    // A limit below the lowest preset speed leaves no allowed value
    expect(checkPresetChange(stored, 'slow', LIMIT_MIN, LIMIT_MIN)).toEqual({ ok: false, error: 'range' });
  });

  it('keeps slow < mid < run strictly, and says which neighbour the value runs into', () => {
    expect(checkPresetChange(stored, 'slow', 3.5, 6)).toEqual({ ok: false, error: 'notBelowNext' });
    expect(checkPresetChange(stored, 'mid', 2.5, 6)).toEqual({ ok: false, error: 'notAbovePrevious' });
    expect(checkPresetChange(stored, 'mid', 5, 6)).toEqual({ ok: false, error: 'notBelowNext' });
    expect(checkPresetChange(stored, 'run', 3.5, 6)).toEqual({ ok: false, error: 'notAbovePrevious' });
    expect(checkPresetChange(stored, 'run', 3, 6)).toEqual({ ok: false, error: 'notAbovePrevious' });
    // Equal after rounding to 0.1 counts as equal
    expect(checkPresetChange(stored, 'mid', 2.54, 6)).toEqual({ ok: false, error: 'notAbovePrevious' });
  });

  it('lets a preset be moved below a lowered limit while another one is still above it', () => {
    // Limit lowered to 3 km/h: run (5) stays stored above it; mid can still be brought under the limit
    expect(checkPresetChange(stored, 'mid', 3, 3)).toEqual({ ok: true, presets: p(2.5, 3, 5) });
  });
});

describe('presetCommand', () => {
  const stored = p(2.5, 3.5, 5);

  it('is the stored speed while it is within the highest allowed speed', () => {
    expect(presetCommand(stored, 'slow', 6)).toBe(2.5);
    expect(presetCommand(stored, 'mid', 6)).toBe(3.5);
    expect(presetCommand(stored, 'run', 6)).toBe(5);
    expect(presetCommand(stored, 'run', 5)).toBe(5);
  });

  it('is null (the button is disabled) for a preset above a lowered limit, never a speed above it', () => {
    expect(presetCommand(stored, 'run', 4.9)).toBeNull();
    expect(presetCommand(stored, 'mid', 3)).toBeNull();
    expect(presetCommand(stored, 'run', 3)).toBeNull();
    expect(presetCommand(stored, 'slow', 3)).toBe(2.5);
    expect(presetCommand(stored, 'slow', 2)).toBeNull();
  });

  it('never returns a speed above the maximum for any preset and limit', () => {
    for (let max = 0; max <= 12; max += 0.1) {
      for (const key of PRESET_KEYS) {
        const v = presetCommand(stored, key, max);
        if (v !== null) expect(v).toBeLessThanOrEqual(max + 1e-9);
      }
    }
  });

  it('keeps the enabled buttons in strict order: disabling never makes two buttons the same speed', () => {
    for (let max = 0; max <= 7; max += 0.1) {
      const enabled = PRESET_KEYS.map(k => presetCommand(stored, k, max)).filter((v): v is number => v !== null);
      for (let i = 1; i < enabled.length; i++) expect(enabled[i]).toBeGreaterThan(enabled[i - 1]!);
    }
  });

  it('is null for a maximum that is not a number', () => {
    expect(presetCommand(stored, 'slow', NaN)).toBeNull();
  });
});
