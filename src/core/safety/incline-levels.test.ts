import { describe, expect, it } from 'vitest';
import type { Range } from 'ftms-treadmill/protocol';
import { followReportedIncline, levelOf, INCLINE_LEVELS_MAX, INCLINE_LEVELS_MIN, INCLINE_SETTLE_MS, levelCountFromSlider, levelsFromCount, parseLevelCount, sliderFromLevelCount } from './incline-levels';

const range = (min: number, max: number, step = 1): Range => ({ min, max, step });

describe('parseLevelCount', () => {
  it('reads none or a whole number of levels from 2 to the most the settings offer', () => {
    expect(parseLevelCount('0')).toBe(0);
    expect(parseLevelCount(String(INCLINE_LEVELS_MIN))).toBe(INCLINE_LEVELS_MIN);
    expect(parseLevelCount('5')).toBe(5);
    expect(parseLevelCount(String(INCLINE_LEVELS_MAX))).toBe(INCLINE_LEVELS_MAX);
  });

  it('takes anything else for none: missing, damaged, out of range, not whole, a single level', () => {
    for (const raw of [null, undefined, '', 'x', '-1', '1', '11', '2.5', '1e1', ' 3 ']) expect(parseLevelCount(raw), String(raw)).toBe(0);
  });
});

describe('levelsFromCount', () => {
  const range = (min: number, max: number, step = 0.5): Range => ({ min, max, step });

  it('runs from level 0 to the highest level, spread evenly over the range the treadmill reported, both ends included', () => {
    expect(levelsFromCount(5, range(0, 5))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(levelsFromCount(5, range(0, 10))).toEqual([0, 2, 4, 6, 8, 10]);
    expect(levelsFromCount(2, range(0, 12))).toEqual([0, 6, 12]);
    expect(levelsFromCount(2, range(-2, 6))).toEqual([-2, 2, 6]);
  });

  it('rounds to 0.1 %, the resolution of the protocol', () => {
    expect(levelsFromCount(3, range(0, 10))).toEqual([0, 3.3, 6.7, 10]);
  });

  it('stays inside the range, always', () => {
    for (const count of [2, 3, 7, 10]) {
      for (const l of levelsFromCount(count, range(0.3, 9.7))) expect(l >= 0.3 && l <= 9.7, `${count}: ${l}`).toBe(true);
    }
  });

  it('has no levels for none, without a range, or for a range without room', () => {
    expect(levelsFromCount(0, range(0, 10))).toEqual([]);
    expect(levelsFromCount(5, undefined)).toEqual([]);
    expect(levelsFromCount(5, range(0, 0))).toEqual([]);
    expect(levelsFromCount(5, range(4, 2))).toEqual([]);
  });

  it('has no levels for a count that is not a whole number from 2 to the most', () => {
    for (const count of [-1, 1, 2.5, NaN, INCLINE_LEVELS_MAX + 1]) expect(levelsFromCount(count, range(0, 10)), String(count)).toEqual([]);
  });
});

describe('the levels slider in the settings', () => {
  it('starts with none and goes on with 2: one level is no choice', () => {
    expect(levelCountFromSlider('1')).toBe(0);
    expect(levelCountFromSlider('2')).toBe(2);
    expect(levelCountFromSlider(String(INCLINE_LEVELS_MAX))).toBe(INCLINE_LEVELS_MAX);
    expect(sliderFromLevelCount(0)).toBe('1');
    expect(sliderFromLevelCount(2)).toBe('2');
    expect(sliderFromLevelCount(INCLINE_LEVELS_MAX)).toBe(String(INCLINE_LEVELS_MAX));
  });

  it('takes anything it cannot read for none', () => {
    for (const raw of ['', 'x', '0', '11', '2.5']) expect(levelCountFromSlider(raw), raw).toBe(0);
  });
});

describe('followReportedIncline', () => {
  it('shows what the treadmill reports, also a change made on the treadmill itself', () => {
    expect(followReportedIncline(3, null, 0)).toEqual({ shown: 3, choice: null });
    expect(followReportedIncline(2.04, null, 0).shown).toBe(2);
  });

  it('a choice in the app stays shown while the treadmill is still on its way there', () => {
    const choice = { pct: 4, at: 1000 };
    expect(followReportedIncline(1, choice, 2000)).toEqual({ shown: 4, choice });
    expect(followReportedIncline(3, choice, 6000)).toEqual({ shown: 4, choice });
  });

  it('once the treadmill reports the choice, it follows the treadmill again', () => {
    expect(followReportedIncline(4, { pct: 4, at: 1000 }, 6000)).toEqual({ shown: 4, choice: null });
  });

  it('a choice the treadmill never reaches gives way after a while', () => {
    expect(followReportedIncline(0, { pct: 4, at: 1000 }, 1000 + INCLINE_SETTLE_MS)).toEqual({ shown: 0, choice: null });
  });
});

describe('levelOf', () => {
  it('is the level whose incline is nearest to the one the treadmill reports', () => {
    const levels = levelsFromCount(5, range(0, 5));
    expect(levelOf(0, levels)).toBe(0);
    expect(levelOf(3, levels)).toBe(3);
    expect(levelOf(2.4, levels)).toBe(2);
    expect(levelOf(2.6, levels)).toBe(3);
    expect(levelOf(5, levels)).toBe(5);
  });

  it('works for levels that are not whole percent', () => {
    expect(levelOf(4.1, levelsFromCount(5, range(0, 10)))).toBe(2);
  });

  it('a reading outside the range is the nearest end', () => {
    const levels = levelsFromCount(5, range(0, 5));
    expect(levelOf(-1, levels)).toBe(0);
    expect(levelOf(9, levels)).toBe(5);
  });

  it('has no level without levels or without a reading', () => {
    expect(levelOf(2, [])).toBeNull();
    expect(levelOf(Number.NaN, levelsFromCount(5, range(0, 5)))).toBeNull();
  });
});
