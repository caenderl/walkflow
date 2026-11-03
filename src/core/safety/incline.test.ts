import { describe, expect, it } from 'vitest';
import { parseFeatures, type Features, type Range } from '../protocol/ftms';
import { clampIncline, inclineSupport, INCLINE_LEVELS_MAX, levelsFromCount, parseLevelCount } from './incline';

const feat = (machine: number, target: number): Features => parseFeatures(new DataView(new Uint8Array([
  machine & 0xff, (machine >> 8) & 0xff, 0, 0, target & 0xff, (target >> 8) & 0xff, 0, 0,
]).buffer));
const range = (min: number, max: number, step = 1): Range => ({ min, max, step });

describe('inclineSupport', () => {
  it('can set the incline when the treadmill lists Inclination among the settings it accepts', () => {
    expect(inclineSupport(feat(0x0008, 0x0002), range(0, 10)).settable).toBe(true);
    expect(inclineSupport(feat(0, 0x0003), undefined).settable).toBe(true);
  });

  it('reports the incline in its data when the machine feature says so', () => {
    expect(inclineSupport(feat(0x0008, 0), undefined)).toEqual({ settable: false, reported: true });
    expect(inclineSupport(feat(0x0008, 0x0002), range(0, 10)).reported).toBe(true);
  });

  it('has no incline at all when the features exclude it, whatever the range characteristic says', () => {
    expect(inclineSupport(feat(0x0004, 0x0001), range(0, 15))).toEqual({ settable: false, reported: false });
  });

  it('does not offer the incline when the treadmill accepts it but its range is empty', () => {
    expect(inclineSupport(feat(0x0008, 0x0002), range(0, 0)).settable).toBe(false);
    expect(inclineSupport(feat(0x0008, 0x0002), range(5, 5)).settable).toBe(false);
  });

  it('falls back to the range when the features cannot be read, and to nothing when that fails too', () => {
    expect(inclineSupport(undefined, range(0, 10)).settable).toBe(true);
    expect(inclineSupport(undefined, range(0, 0)).settable).toBe(false);
    expect(inclineSupport(undefined, undefined)).toEqual({ settable: false, reported: false });
  });
});

describe('parseLevelCount', () => {
  it('reads a whole number of levels from 0 (none) to the most the settings offer', () => {
    expect(parseLevelCount('0')).toBe(0);
    expect(parseLevelCount('5')).toBe(5);
    expect(parseLevelCount(String(INCLINE_LEVELS_MAX))).toBe(INCLINE_LEVELS_MAX);
  });

  it('takes anything else for none: missing, damaged, out of range, not whole', () => {
    for (const raw of [null, undefined, '', 'x', '-1', '11', '2.5', '1e1', ' 3 ']) expect(parseLevelCount(raw), String(raw)).toBe(0);
  });
});

describe('levelsFromCount', () => {
  const range = (min: number, max: number, step = 0.5): Range => ({ min, max, step });

  it('spreads the levels evenly over the range the treadmill reported, both ends included', () => {
    expect(levelsFromCount(5, range(0, 10))).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(levelsFromCount(2, range(0, 12))).toEqual([0, 12]);
    expect(levelsFromCount(3, range(-2, 6))).toEqual([-2, 2, 6]);
  });

  it('rounds to 0.1 %, the resolution of the protocol', () => {
    expect(levelsFromCount(4, range(0, 10))).toEqual([0, 3.3, 6.7, 10]);
  });

  it('stays inside the range, always', () => {
    for (const count of [1, 2, 3, 7, 10]) {
      for (const l of levelsFromCount(count, range(0.3, 9.7))) expect(l >= 0.3 && l <= 9.7, `${count}: ${l}`).toBe(true);
    }
  });

  it('has a single level at the top of the range', () => {
    expect(levelsFromCount(1, range(0, 10))).toEqual([10]);
  });

  it('has no levels for none, without a range, or for a range without room', () => {
    expect(levelsFromCount(0, range(0, 10))).toEqual([]);
    expect(levelsFromCount(5, undefined)).toEqual([]);
    expect(levelsFromCount(5, range(0, 0))).toEqual([]);
    expect(levelsFromCount(5, range(4, 2))).toEqual([]);
  });

  it('has no levels for a count that is not a whole number from 1 to the most', () => {
    for (const count of [-1, 2.5, NaN, INCLINE_LEVELS_MAX + 1]) expect(levelsFromCount(count, range(0, 10)), String(count)).toEqual([]);
  });
});

describe('clampIncline', () => {
  it('keeps a value inside the range the treadmill reported', () => {
    expect(clampIncline(4, range(0, 10))).toBe(4);
    expect(clampIncline(12, range(0, 10))).toBe(10);
    expect(clampIncline(-3, range(0, 10))).toBe(0);
  });

  it('rounds to 0.1 and leaves values alone when there is no range', () => {
    expect(clampIncline(2.04, undefined)).toBe(2);
    expect(clampIncline(7, undefined)).toBe(7);
  });

  it('does not let a value that is not a number through', () => {
    expect(Number.isNaN(clampIncline(NaN, range(0, 10)))).toBe(true);
  });
});
