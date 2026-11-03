import { describe, expect, it } from 'vitest';
import {
  readWorkoutPackage, serializeWorkoutPackage, workoutPackage, workoutPackageFileName,
  WORKOUT_PACKAGE_FORMAT, WORKOUT_PACKAGE_MAX_CHARS, WORKOUT_PACKAGE_VERSION,
} from './workout-package';
import { readWorkout, WORKOUT_MAX_STEPS, type Workout } from './workouts';

const mine: Workout = { id: 'abc', name: 'Hill blocks', steps: [{ sec: 180, speed: 2.5 }, { meters: 400, speed: 4, incline: 2 }], updated: 99 };

const file = (over: Record<string, unknown> = {}) => JSON.stringify({
  format: WORKOUT_PACKAGE_FORMAT, version: WORKOUT_PACKAGE_VERSION,
  name: { en: 'Easy intervals', de: 'Leichte Intervalle' },
  steps: [{ sec: 120, speed: 2 }, { sec: 180, speed: 3.5, incline: 1 }, { meters: 400, speed: 4 }],
  ...over,
});

describe('workoutPackage', () => {
  it('writes a workout of the person with a name without a language', () => {
    expect(workoutPackage(mine)).toEqual({
      format: 'walkflow-workout', version: 1, name: { und: 'Hill blocks' },
      steps: [{ sec: 180, speed: 2.5 }, { meters: 400, speed: 4, incline: 2 }],
    });
  });

  it('writes no id and no date: the package does not say which workout it replaces', () => {
    const text = serializeWorkoutPackage(workoutPackage(mine));
    expect(text).not.toContain('abc');
    expect(text).not.toContain('99');
  });

  it('keeps names, descriptions and credit, so the credit travels', () => {
    const w: Workout = { ...mine, names: { en: 'Hill blocks', de: 'Bergblöcke' }, texts: { en: 'Hard.', und: 'Hart.' }, meta: { author: 'Ann', license: 'CC0-1.0', source: 'Own', tags: ['hills'] } };
    expect(workoutPackage(w)).toMatchObject({
      name: { en: 'Hill blocks', de: 'Bergblöcke' }, description: { en: 'Hard.', und: 'Hart.' },
      author: 'Ann', license: 'CC0-1.0', source: 'Own', tags: ['hills'],
    });
  });

  it('writes one step per line, so a change shows line by line in a review', () => {
    const lines = serializeWorkoutPackage(workoutPackage(mine)).split('\n');
    expect(lines.filter(l => l.includes('"speed"'))).toHaveLength(2);
    expect(lines.some(l => l.trim() === '{ "sec": 180, "speed": 2.5 },')).toBe(true);
  });
});

describe('readWorkoutPackage', () => {
  it('reads a package into a new workout with the given id and time', () => {
    const r = readWorkoutPackage(file(), 'new-id', 1234);
    expect(r).toMatchObject({ ok: true, workout: { id: 'new-id', updated: 1234, name: 'Easy intervals', names: { en: 'Easy intervals', de: 'Leichte Intervalle' } } });
    expect(r.ok && r.workout.steps).toEqual([{ sec: 120, speed: 2 }, { sec: 180, speed: 3.5, incline: 1 }, { meters: 400, speed: 4 }]);
  });

  it('ignores an id or a date inside the file: an import never replaces a workout', () => {
    const r = readWorkoutPackage(file({ id: 'existing', updated: 5 }), 'new-id', 1234);
    expect(r.ok && r.workout.id).toBe('new-id');
    expect(r.ok && r.workout.updated).toBe(1234);
  });

  it('takes the plain name from the name without a language, else English, else the first', () => {
    expect((readWorkoutPackage(file({ name: { und: 'Typed', en: 'English' } }), 'i', 1) as { workout: Workout }).workout.name).toBe('Typed');
    expect((readWorkoutPackage(file({ name: { de: 'Deutsch', fr: 'Français' } }), 'i', 1) as { workout: Workout }).workout.name).toBe('Deutsch');
  });

  it('keeps no names when there is only one without a language', () => {
    const r = readWorkoutPackage(file({ name: { und: 'Typed' } }), 'i', 1);
    expect(r.ok && r.workout).not.toHaveProperty('names');
    expect(r.ok && r.workout.name).toBe('Typed');
  });

  it('reads descriptions and credit', () => {
    const r = readWorkoutPackage(file({ description: { en: 'Short.' }, author: 'Ann', license: 'CC0-1.0', source: 'Own work', tags: ['easy'] }), 'i', 1);
    expect(r.ok && r.workout).toMatchObject({ texts: { en: 'Short.' }, meta: { author: 'Ann', license: 'CC0-1.0', source: 'Own work', tags: ['easy'] } });
  });

  it('ignores fields it does not know, so a later version can add some', () => {
    const r = readWorkoutPackage(file({ futureField: { x: 1 }, speedLimit: 99, safety: 'off' }), 'i', 1);
    expect(r.ok && Object.keys(r.workout).sort()).toEqual(['id', 'name', 'names', 'steps', 'updated']);
  });

  it('is not a package: not JSON, another format, a route package', () => {
    for (const text of ['', 'nope', '[]', '{}', JSON.stringify({ format: 'walkflow-route', version: 1, name: { en: 'R' }, points: [] }), JSON.stringify({ format: 'gpx' })]) {
      expect(readWorkoutPackage(text, 'i', 1), text).toEqual({ ok: false, reason: 'unreadable' });
    }
  });

  it('refuses a newer version with a note to update, and a version that is not a number', () => {
    expect(readWorkoutPackage(file({ version: 2 }), 'i', 1)).toEqual({ ok: false, reason: 'newer' });
    for (const version of ['1', 0, -1, 1.5, null]) expect(readWorkoutPackage(file({ version }), 'i', 1), String(version)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a package without a usable name or without steps', () => {
    for (const over of [{ name: {} }, { name: 'Easy' }, { name: { 'de-CH': 'x' } }, { name: { en: '  ' } }, { steps: [] }, { steps: 'run' }, { steps: undefined }]) {
      expect(readWorkoutPackage(file(over), 'i', 1), JSON.stringify(over)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('refuses a package with one step that is not usable, not just that step', () => {
    for (const bad of [{ sec: -1, speed: 2 }, { sec: 60 }, { sec: 60, speed: 99 }, { meters: 100, speed: 0 }, { sec: 60, meters: 100, speed: 2 }, { sec: 60, speed: 2, incline: 90 }, 'fast', null]) {
      expect(readWorkoutPackage(file({ steps: [{ sec: 60, speed: 2 }, bad] }), 'i', 1), JSON.stringify(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('refuses too many steps and a file that is too large', () => {
    const many = Array.from({ length: WORKOUT_MAX_STEPS + 1 }, () => ({ sec: 60, speed: 2 }));
    expect(readWorkoutPackage(file({ steps: many }), 'i', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(readWorkoutPackage(file({ description: { en: 'x'.repeat(WORKOUT_PACKAGE_MAX_CHARS) } }), 'i', 1)).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('is data and never code: nothing in it reaches the settings, the limit or the belt', () => {
    const r = readWorkoutPackage(file({ speedLimit: 99, maxSpeed: 30, quiet: true, setSpeed: 25, command: '08 01' }), 'i', 1);
    expect(r.ok && JSON.stringify(r.workout)).not.toMatch(/99|maxSpeed|quiet|setSpeed|command/);
  });

  it('strips control characters from texts', () => {
    const r = readWorkoutPackage(file({ name: { en: 'Easy\u0000\u0007 one' }, description: { en: 'Line\u0000 text' } }), 'i', 1);
    expect(r.ok && r.workout.name).toBe('Easy one');
    expect(r.ok && r.workout.texts!.en).not.toMatch(/\u0000/);
  });
});

describe('a workout through a package and back', () => {
  it('comes out the same, except for the id and the date', () => {
    const w: Workout = {
      id: 'x', name: 'Bergblöcke', steps: [{ sec: 120, speed: 2 }, { meters: 800, speed: 5, incline: 3 }], updated: 5,
      names: { en: 'Hill blocks', de: 'Bergblöcke' }, texts: { en: 'Hard.' }, meta: { author: 'Ann', license: 'CC0-1.0', tags: ['hills'] },
    };
    const r = readWorkoutPackage(serializeWorkoutPackage(workoutPackage(w)), 'y', 6);
    expect(r.ok && r.workout).toEqual({ ...w, id: 'y', updated: 6, name: 'Hill blocks' });
    expect(r.ok && readWorkout(r.workout)).toEqual(r.ok && r.workout);
  });

  it('keeps the plain name of a workout that has no names', () => {
    const r = readWorkoutPackage(serializeWorkoutPackage(workoutPackage(mine)), 'y', 6);
    expect(r.ok && r.workout).toEqual({ ...mine, id: 'y', updated: 6 });
  });
});

describe('a package the app wrote comes out byte for byte the same when it is read and written again', () => {
  // This is what lets an item taken from the community be offered again with the same hash (docs/P2P.md)
  it('with names, descriptions, credit and every kind of step', () => {
    const w: Workout = {
      id: 'x', name: 'Bergblöcke', updated: 5, steps: [{ sec: 120, speed: 2 }, { meters: 800, speed: 5, incline: 3 }, { sec: 75, speed: 3.5, incline: -1 }],
      names: { en: 'Hill blocks', de: 'Bergblöcke' }, texts: { en: 'Hard.', und: 'Hart.' }, meta: { author: 'Ann', license: 'CC0-1.0', source: 'Own', tags: ['hills', 'hard'] },
    };
    const text = serializeWorkoutPackage(workoutPackage(w));
    const read = readWorkoutPackage(text, 'y', 6);
    expect(read.ok && serializeWorkoutPackage(workoutPackage(read.workout))).toBe(text);
  });

  it('for a workout with only a plain name', () => {
    const text = serializeWorkoutPackage(workoutPackage(mine));
    const read = readWorkoutPackage(text, 'y', 6);
    expect(read.ok && serializeWorkoutPackage(workoutPackage(read.workout))).toBe(text);
  });
});

describe('workoutPackageFileName', () => {
  it('keeps letters and digits of any language and ends in .walkflow', () => {
    expect(workoutPackageFileName('Bergblöcke 4 × 400 m')).toBe('Bergblöcke-4-400-m.walkflow');
    expect(workoutPackageFileName('///')).toBe('workout.walkflow');
    expect(workoutPackageFileName('x'.repeat(100))).toBe(`${'x'.repeat(60)}.walkflow`);
  });
});
