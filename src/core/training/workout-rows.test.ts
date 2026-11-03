import { describe, expect, it } from 'vitest';
import { toRow, toStep } from './workout-rows';

describe('toRow', () => {
  it('shows whole minutes as minutes and other times as seconds', () => {
    expect(toRow({ sec: 300, speed: 4 })).toEqual({ unit: 'min', amount: 5, speed: 4 });
    expect(toRow({ sec: 90, speed: 4 })).toEqual({ unit: 's', amount: 90, speed: 4 });
  });

  it('shows a distance step in metres', () => {
    expect(toRow({ meters: 400, speed: 5 })).toEqual({ unit: 'm', amount: 400, speed: 5 });
  });

  it('keeps an incline and leaves the key out without one', () => {
    expect(toRow({ sec: 60, speed: 3, incline: 2.5 })).toEqual({ unit: 'min', amount: 1, speed: 3, incline: 2.5 });
    expect('incline' in toRow({ sec: 60, speed: 3 })).toBe(false);
  });
});

describe('toStep', () => {
  it('turns minutes and seconds into seconds and rounds', () => {
    expect(toStep({ unit: 'min', amount: 2.5, speed: 4 })).toEqual({ sec: 150, speed: 4 });
    expect(toStep({ unit: 's', amount: 45.4, speed: 4 })).toEqual({ sec: 45, speed: 4 });
  });

  it('turns a distance into whole metres', () => {
    expect(toStep({ unit: 'm', amount: 400.6, speed: 5 })).toEqual({ meters: 401, speed: 5 });
  });

  it('takes the incline only when it is a number', () => {
    expect(toStep({ unit: 'min', amount: 1, speed: 3, incline: 1.5 })).toEqual({ sec: 60, speed: 3, incline: 1.5 });
    expect(toStep({ unit: 'min', amount: 1, speed: 3, incline: NaN })).toEqual({ sec: 60, speed: 3 });
  });

  it('refuses numbers that are not usable', () => {
    expect(toStep({ unit: 'min', amount: NaN, speed: 3 })).toBeNull();
    expect(toStep({ unit: 'min', amount: 1, speed: NaN })).toBeNull();
    expect(toStep({ unit: 'min', amount: -1, speed: 3 })).toBeNull();
  });

  it('is the inverse of toRow', () => {
    for (const step of [{ sec: 120, speed: 4.5 }, { sec: 75, speed: 3, incline: 1 }, { meters: 800, speed: 6 }]) {
      expect(toStep(toRow(step))).toEqual(step);
    }
  });
});
