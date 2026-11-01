import { describe, expect, it } from 'vitest';
import type { RunSummary } from './runs';
import {
  newWorkoutId, planFromMinutes, readPlan, readWorkout, readWorkouts, TEMPLATES, weekProgress, WORKOUT_MAX_STEPS,
} from './workouts';

const good = { id: 'w1', name: 'Easy', steps: [{ sec: 120, speed: 2 }, { meters: 400, speed: 3.5 }], updated: 1 };

describe('readWorkout', () => {
  it('accepts a valid workout and keeps only the known fields', () => {
    expect(readWorkout({ ...good, extra: 'x', steps: [{ sec: 120, speed: 2, junk: 1 }, { meters: 400, speed: 3.5 }] }))
      .toEqual({ ...good, steps: [{ sec: 120, speed: 2 }, { meters: 400, speed: 3.5 }] });
  });

  it('trims the name and rejects empty or very long ones', () => {
    expect(readWorkout({ ...good, name: '  Easy  ' })?.name).toBe('Easy');
    expect(readWorkout({ ...good, name: '   ' })).toBeNull();
    expect(readWorkout({ ...good, name: 'x'.repeat(61) })).toBeNull();
  });

  it('rejects anything that is not a plain, bounded program', () => {
    expect(readWorkout(null)).toBeNull();
    expect(readWorkout({ ...good, id: '' })).toBeNull();
    expect(readWorkout({ ...good, steps: [] })).toBeNull();
    expect(readWorkout({ ...good, steps: Array.from({ length: WORKOUT_MAX_STEPS + 1 }, () => ({ sec: 60, speed: 3 })) })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: 60 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: 60, speed: -1 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: 60, speed: 31 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: 60.5, speed: 3 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: 86_401, speed: 3 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: 60, meters: 100, speed: 3 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ meters: 100, speed: 0 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ meters: 100_001, speed: 3 }] })).toBeNull();
    expect(readWorkout({ ...good, steps: [{ sec: Infinity, speed: 3 }] })).toBeNull();
    expect(readWorkout({ ...good, updated: 'x' })).toBeNull();
  });
});

describe('readWorkouts', () => {
  it('keeps the valid ones, counts the rest, drops duplicate ids (last one wins)', () => {
    const r = readWorkouts([good, { nope: 1 }, { ...good, name: 'Newer' }, { ...good, id: 'w2' }]);
    expect(r.invalid).toBe(1);
    expect(r.workouts.map(w => [w.id, w.name])).toEqual([['w1', 'Newer'], ['w2', 'Easy']]);
  });

  it('anything but an array is nothing', () => {
    expect(readWorkouts(undefined)).toEqual({ workouts: [], invalid: 0 });
    expect(readWorkouts('x')).toEqual({ workouts: [], invalid: 0 });
  });
});

describe('templates', () => {
  it('are valid workouts', () => {
    for (const tpl of TEMPLATES) expect(readWorkout({ id: tpl.id, name: 'x', steps: tpl.steps, updated: 0 })).not.toBeNull();
  });
});

describe('newWorkoutId', () => {
  it('differs for the same millisecond', () => {
    expect(newWorkoutId(5, () => 0.1)).not.toBe(newWorkoutId(5, () => 0.2));
  });
});

describe('week plan', () => {
  it('readPlan wants seven whole minute values from 0 to 600', () => {
    expect(readPlan({ minutes: [0, 30, 0, 30, 0, 30, 0] })).toEqual({ minutes: [0, 30, 0, 30, 0, 30, 0] });
    expect(readPlan({ minutes: [0, 30] })).toBeNull();
    expect(readPlan({ minutes: [0, 30, 0, 30, 0, 30, 601] })).toBeNull();
    expect(readPlan({ minutes: [0, 30, 0, 30, 0, 30, 1.5] })).toBeNull();
    expect(readPlan({ minutes: [0, 30, 0, 30, 0, 30, -1] })).toBeNull();
    expect(readPlan(null)).toBeNull();
  });

  it('planFromMinutes clamps and rounds what comes from input fields', () => {
    expect(planFromMinutes([NaN, -5, 12.6, 9999, 0, 30, 45])).toEqual({ minutes: [0, 0, 13, 600, 0, 30, 45] });
  });
});

describe('weekProgress', () => {
  // Local time throughout. 2026-10-26 is a Monday.
  const at = (d: number, h = 8) => new Date(2026, 9, d, h, 0, 0).getTime();
  let n = 0;
  const run = (start: number, movingSec: number, f: Partial<RunSummary> = {}): RunSummary =>
    ({ id: String(n++), source: 'ble', start, end: start + movingSec * 1000, movingSec, dist: 1000, avgKmh: 4, maxKmh: 4, ...f });
  const plan = { minutes: [30, 0, 30, 0, 30, 0, 0] };

  it('seven days from Monday, with target, done minutes and whether the target is met', () => {
    const p = weekProgress(plan, [run(at(26), 1800), run(at(28), 600)], at(29));
    expect(p.map(d => d.day)).toEqual([26, 27, 28, 29, 30, 31, 32].map(d => new Date(2026, 9, d).getTime()));
    expect(p.map(d => d.target)).toEqual([30, 0, 30, 0, 30, 0, 0]);
    expect(p.map(d => Math.round(d.doneSec / 60))).toEqual([30, 0, 10, 0, 0, 0, 0]);
    expect(p.map(d => d.met)).toEqual([true, false, false, false, false, false, false]);
  });

  it('several runs on one day add up', () => {
    const p = weekProgress(plan, [run(at(26, 7), 900), run(at(26, 18), 900)], at(26, 20));
    expect(p[0]).toMatchObject({ doneSec: 1800, met: true });
  });

  it('demo runs and runs from other weeks do not count', () => {
    const p = weekProgress(plan, [run(at(26), 1800, { source: 'demo' }), run(at(25, 23), 1800), run(at(33), 1800)], at(27));
    expect(p.every(d => d.doneSec === 0)).toBe(true);
  });

  it('a rest day stays not met even with a run, and a run just after midnight belongs to that day', () => {
    const p = weekProgress({ minutes: [0, 0, 0, 0, 0, 0, 0] }, [run(at(27, 0), 3600)], at(27, 12));
    expect(p[1]).toMatchObject({ target: 0, doneSec: 3600, met: false });
  });

  it('marks which day is today', () => {
    const p = weekProgress(plan, [], at(28, 15));
    expect(p.map(d => d.today)).toEqual([false, false, true, false, false, false, false]);
  });
});
