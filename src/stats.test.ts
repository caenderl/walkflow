import { describe, expect, it } from 'vitest';
import type { RunSummary } from './runs';
import { countable, monthStart, overview, records, streaks, totals, weeklyDistance, weekStart } from './stats';

// Local time throughout, so the tests mean the same in every time zone
const day = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h, 0, 0).getTime();

let n = 0;
function run(start: number, f: Partial<RunSummary> = {}): RunSummary {
  return { id: String(start + n++), source: 'ble', start, end: start + 1800_000, movingSec: 1800, dist: 2500, avgKmh: 5, maxKmh: 5.5, ...f };
}

describe('totals', () => {
  it('sums runs, distance, moving time and kcal', () => {
    expect(totals([])).toEqual({ runs: 0, dist: 0, movingSec: 0, kcal: 0 });
    expect(totals([run(day(2026, 10, 1), { kcal: 100 }), run(day(2026, 10, 2), { dist: 1000, movingSec: 600 })]))
      .toEqual({ runs: 2, dist: 3500, movingSec: 2400, kcal: 100 });
  });

  it('demo runs do not count', () => {
    const real = run(day(2026, 10, 1));
    expect(countable([real, run(day(2026, 10, 2), { source: 'demo' })])).toEqual([real]);
  });
});

describe('weeks and months', () => {
  it('weeks start on Monday at midnight, Sunday belongs to the week before', () => {
    // 2026-10-26 is a Monday
    expect(weekStart(day(2026, 10, 26, 0))).toBe(day(2026, 10, 26, 0));
    expect(weekStart(day(2026, 10, 28, 23))).toBe(day(2026, 10, 26, 0));
    expect(weekStart(day(2026, 11, 1, 23))).toBe(day(2026, 10, 26, 0));
    expect(weekStart(day(2026, 11, 2, 0))).toBe(day(2026, 11, 2, 0));
  });

  it('the week of a clock change has the right start (Europe: 2026-10-25, US: 2026-11-01)', () => {
    expect(weekStart(day(2026, 10, 25, 12))).toBe(day(2026, 10, 19, 0));
    expect(weekStart(day(2026, 11, 3, 12))).toBe(day(2026, 11, 2, 0));
  });

  it('month start', () => {
    expect(monthStart(day(2026, 10, 31, 23))).toBe(day(2026, 10, 1, 0));
  });

  it('overview: this week, this month, all', () => {
    const now = day(2026, 10, 28, 20);
    const runs = [run(day(2026, 10, 28)), run(day(2026, 10, 26)), run(day(2026, 10, 25)), run(day(2026, 9, 30))];
    const o = overview(runs, now);
    expect(o.week.runs).toBe(2);
    expect(o.month.runs).toBe(3);
    expect(o.all.runs).toBe(4);
  });

  it('distance per week: oldest first, ending with the current week, empty weeks included', () => {
    const now = day(2026, 10, 28, 20);
    const w = weeklyDistance([
      run(day(2026, 10, 27), { dist: 1000 }), run(day(2026, 10, 28), { dist: 500 }),
      run(day(2026, 10, 13), { dist: 2000 }),
      run(day(2026, 1, 5), { dist: 9999 }),
    ], now, 4);
    expect(w).toEqual([
      { start: day(2026, 10, 5, 0), dist: 0 },
      { start: day(2026, 10, 12, 0), dist: 2000 },
      { start: day(2026, 10, 19, 0), dist: 0 },
      { start: day(2026, 10, 26, 0), dist: 1500 },
    ]);
  });
});

describe('streaks', () => {
  const now = day(2026, 10, 28, 20);

  it('none without runs', () => {
    expect(streaks([], now)).toEqual({ current: 0, longest: 0 });
  });

  it('days in a row up to today; several runs on one day count once', () => {
    const runs = [day(2026, 10, 28), day(2026, 10, 28, 18), day(2026, 10, 27), day(2026, 10, 26)].map(t => run(t));
    expect(streaks(runs, now)).toEqual({ current: 3, longest: 3 });
  });

  it('is not broken yet as long as today is not over', () => {
    const runs = [day(2026, 10, 27), day(2026, 10, 26)].map(t => run(t));
    expect(streaks(runs, now).current).toBe(2);
  });

  it('a day without a run breaks it; the longest one stays', () => {
    const runs = [day(2026, 10, 26), day(2026, 10, 10), day(2026, 10, 11), day(2026, 10, 12), day(2026, 10, 13)].map(t => run(t));
    expect(streaks(runs, now)).toEqual({ current: 0, longest: 4 });
  });

  it('across the clock change', () => {
    const runs = [day(2026, 10, 24, 23), day(2026, 10, 25, 1), day(2026, 10, 26, 0)].map(t => run(t));
    expect(streaks(runs, day(2026, 10, 26, 12))).toEqual({ current: 3, longest: 3 });
  });
});

describe('records', () => {
  it('nothing without runs', () => {
    expect(records([])).toEqual({});
  });

  it('longest distance, longest moving time, best week', () => {
    const far = run(day(2026, 10, 5), { dist: 8000, movingSec: 5000 });
    const long = run(day(2026, 10, 12), { dist: 6000, movingSec: 7000 });
    const week = [run(day(2026, 10, 19), { dist: 5000 }), run(day(2026, 10, 20), { dist: 5000 })];
    const r = records([far, long, ...week]);
    expect(r.longestDist).toBe(far);
    expect(r.longestTime).toBe(long);
    expect(r.bestWeek).toEqual({ start: day(2026, 10, 19, 0), dist: 10000 });
  });
});
