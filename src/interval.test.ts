import { describe, expect, it } from 'vitest';
import { stepBars, upcoming } from './interval';

describe('stepBars', () => {
  it('is empty without steps', () => {
    expect(stepBars([])).toEqual([]);
  });

  it('gives each step a width by its duration and a height by its speed', () => {
    const bars = stepBars([{ sec: 60, speed: 2 }, { sec: 180, speed: 4 }]);
    expect(bars.map(b => b.width)).toEqual([0.25, 0.75]);
    expect(bars.map(b => b.height)).toEqual([0.5, 1]);
  });

  it('estimates a distance step at its own speed: 360 m at 3.6 km/h = 6 min', () => {
    const bars = stepBars([{ meters: 360, speed: 3.6 }, { sec: 360, speed: 3.6 }]);
    expect(bars[0]!.width).toBeCloseTo(0.5, 5);
  });

  it('widths add up to 1, and no step vanishes: a step of 0 s still gets a sliver', () => {
    const bars = stepBars([{ sec: 0, speed: 3 }, { sec: 100, speed: 3 }, { meters: 50, speed: 3 }]);
    expect(bars.reduce((s, b) => s + b.width, 0)).toBeCloseTo(1, 9);
    expect(bars.every(b => b.width > 0)).toBe(true);
  });

  it('keeps a very slow step visible in height', () => {
    const bars = stepBars([{ sec: 10, speed: 0.5 }, { sec: 10, speed: 20 }]);
    expect(bars[0]!.height).toBeGreaterThanOrEqual(0.15);
    expect(bars[1]!.height).toBe(1);
  });
});

describe('upcoming', () => {
  const steps = [{ sec: 1, speed: 1 }, { sec: 2, speed: 2 }, { sec: 3, speed: 3 }, { sec: 4, speed: 4 }, { sec: 5, speed: 5 }];

  it('lists the steps after the current one, at most the number asked for', () => {
    expect(upcoming(steps, 0, 3).map(s => s.speed)).toEqual([2, 3, 4]);
    expect(upcoming(steps, 3, 3).map(s => s.speed)).toEqual([5]);
  });

  it('is empty at the last step, and before the first one it starts from the beginning', () => {
    expect(upcoming(steps, 4, 3)).toEqual([]);
    expect(upcoming(steps, -1, 2).map(s => s.speed)).toEqual([1, 2]);
  });
});
