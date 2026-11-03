import { afterEach, describe, expect, it, vi } from 'vitest';
import { numberFormat, unitFormat } from './locales/format';
import { LIMIT_CONFIRM_ABOVE, decideLimitChange, DEFAULT_SPEED_LIMIT, parseMaxStep } from '../core/safety/safety';
import {
  distUnit, fromShort, fromSpeed, KM_PER_MILE, onUnitsChange, parseUnits, setUnits, shortUnit, speedFromInput, speedPresets, speedStep,
  speedUnit, toDist, toShort, toSpeed,
} from './units';

afterEach(() => setUnits('metric'));

describe('parseUnits', () => {
  it('knows imperial and falls back to metric for everything else', () => {
    expect(parseUnits('imperial')).toBe('imperial');
    expect(parseUnits('metric')).toBe('metric');
    for (const v of [null, undefined, '', 'Imperial', 'miles', '1']) expect(parseUnits(v)).toBe('metric');
  });
});

describe('metric', () => {
  it('leaves values as they are', () => {
    expect(speedUnit()).toBe('km/h');
    expect(distUnit()).toBe('km');
    expect(shortUnit()).toBe('m');
    expect(toSpeed(5.5)).toBe(5.5);
    expect(fromSpeed(5.5)).toBe(5.5);
    expect(toDist(2540)).toBe(2.54);
    expect(toShort(400)).toBe(400);
    expect(speedStep()).toBe(0.5);
  });
});

describe('imperial', () => {
  it('converts speed, distance and short distances', () => {
    setUnits('imperial');
    expect(speedUnit()).toBe('mph');
    expect(distUnit()).toBe('mi');
    expect(shortUnit()).toBe('ft');
    expect(toSpeed(KM_PER_MILE)).toBeCloseTo(1, 12);
    expect(toDist(1609.344)).toBeCloseTo(1, 12);
    expect(toShort(0.3048)).toBeCloseTo(1, 12);
    expect(fromShort(toShort(123.4))).toBeCloseTo(123.4, 9);
    expect(fromSpeed(toSpeed(4.3))).toBeCloseTo(4.3, 12);
  });

  it('steps the speed by half a mile per hour, in km/h', () => {
    setUnits('imperial');
    expect(speedStep()).toBeCloseTo(0.5 * KM_PER_MILE, 12);
  });
});

describe('setUnits', () => {
  it('tells listeners about a change and only a change', () => {
    const cb = vi.fn();
    const off = onUnitsChange(cb);
    setUnits('metric');
    expect(cb).not.toHaveBeenCalled();
    setUnits('imperial');
    expect(cb).toHaveBeenCalledWith('imperial');
    off();
    setUnits('metric');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('speedFromInput', () => {
  it('passes km/h through and converts mph to km/h text for the safety checks', () => {
    expect(speedFromInput('5,5')).toBe('5.5');
    setUnits('imperial');
    expect(Number(speedFromInput('3'))).toBeCloseTo(3 * KM_PER_MILE, 2);
    expect(Number(speedFromInput('3,5'))).toBeCloseTo(3.5 * KM_PER_MILE, 2);
  });

  it('keeps unreadable input unreadable, so the check refuses it', () => {
    setUnits('imperial');
    for (const raw of ['', 'abc', '   ']) expect(decideLimitChange(speedFromInput(raw), 6).ok, raw).toBe(false);
  });
});

describe('the speed limit in mph', () => {
  it('has the default limit as the highest value that needs no confirmation: 3.7 mph', () => {
    setUnits('imperial');
    expect(toSpeed(DEFAULT_SPEED_LIMIT)).toBeCloseTo(3.73, 2);
    const ok = decideLimitChange(speedFromInput('3.7'), DEFAULT_SPEED_LIMIT);
    expect(ok).toMatchObject({ ok: true, needsConfirmation: false });
    expect(ok.ok && ok.value).toBeLessThanOrEqual(LIMIT_CONFIRM_ABOVE);
  });

  it('asks for confirmation from 3.8 mph on, because that is above 6 km/h', () => {
    setUnits('imperial');
    const d = decideLimitChange(speedFromInput('3.8'), DEFAULT_SPEED_LIMIT);
    expect(d).toMatchObject({ ok: true, needsConfirmation: true });
    expect(d.ok && d.value).toBeGreaterThan(LIMIT_CONFIRM_ABOVE);
    expect(decideLimitChange(speedFromInput('10'), DEFAULT_SPEED_LIMIT)).toMatchObject({ ok: true, needsConfirmation: true });
  });

  it('refuses a limit outside 1 to 20 km/h', () => {
    setUnits('imperial');
    expect(decideLimitChange(speedFromInput('0.5'), 6).ok).toBe(false);
    expect(decideLimitChange(speedFromInput('13'), 6).ok).toBe(false);
  });

  it('takes the ramp step in mph too and keeps its range in km/h', () => {
    setUnits('imperial');
    expect(parseMaxStep(speedFromInput('0.3'))).toBe(0.5);
    expect(parseMaxStep(speedFromInput('0.02'))).toBeNull();
    expect(parseMaxStep(speedFromInput('0.7'))).toBeNull();
  });
});

describe('speedPresets', () => {
  it('are the four quick-select speeds of the units, ascending and well below the default limit', () => {
    for (const system of ['metric', 'imperial'] as const) {
      setUnits(system);
      const p = speedPresets();
      expect(p).toHaveLength(4);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
      expect(fromSpeed(p.at(-1)!)).toBeLessThanOrEqual(DEFAULT_SPEED_LIMIT);
    }
    setUnits('metric');
    expect(speedPresets()).toEqual([2, 3, 4, 5]);
  });
});

describe('unitFormat', () => {
  const u = unitFormat(numberFormat('en'));
  const de = unitFormat(numberFormat('de'));

  it('writes metric texts as the app always did', () => {
    expect(u.speed(5.5, 1)).toBe('5.5 km/h');
    expect(u.dist(2540)).toBe('2.54 km');
    expect(u.dist(2540, 1)).toBe('2.5 km');
    expect(u.short(412.4)).toBe('412 m');
    expect(u.length(400)).toBe('400 m');
    expect(u.length(1500)).toBe('1.50 km');
    expect(de.speed(5.5, 1)).toBe('5,5 km/h');
  });

  it('writes imperial texts with the number of the language', () => {
    setUnits('imperial');
    expect(u.speed(6, 1)).toBe('3.7 mph');
    expect(de.speed(6, 1)).toBe('3,7 mph');
    expect(u.speedValue(6, 2)).toBe('3.73');
    expect(u.dist(1609.344)).toBe('1.00 mi');
    expect(u.short(100)).toBe('328 ft');
    expect(u.length(100)).toBe('328 ft');
    expect(u.length(400)).toBe('0.25 mi');
  });
});
