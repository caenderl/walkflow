import { describe, expect, it, vi } from 'vitest';
import type { Sample } from './export';
import {
  buildRun, decodeTrack, encodeTrack, parseBackup, RUN_CHECKPOINT_MS, RUN_END_IDLE_MS, RUN_MAX_SAMPLES,
  RUN_MIN_MOVING_SEC, RunRecorder, readTag, serializeBackup, summarize, type Run, type RunSource, type RunTag,
} from './runs';

const T0 = new Date(2026, 9, 26, 7, 30, 0).getTime();
const at = (sec: number) => T0 + sec * 1000;
const s = (sec: number, speed: number | undefined, f: Omit<Sample, 'ts' | 'speed'> = {}): Sample => ({ ts: at(sec), speed, ...f });

/** One sample every `step` seconds from `from` to `to` (inclusive) at a constant speed. */
function walk(rec: RunRecorder, from: number, to: number, speed: number, source: RunSource = 'ble', step = 1) {
  for (let sec = from; sec <= to; sec += step) rec.feed(s(sec, speed), source);
}

function harness(save?: (run: Run) => Promise<unknown>, opts?: ConstructorParameters<typeof RunRecorder>[1]) {
  const saved: Run[] = [];
  const errors: unknown[] = [];
  const finals: boolean[] = [];
  const rec = new RunRecorder({
    save: save ?? (async run => { saved.push(run); }),
    onSaved: (_, final) => finals.push(final),
    onError: e => errors.push(e),
  }, opts);
  /** Latest saved version of every run, in order of first appearance */
  const runs = () => [...new Map(saved.map(r => [r.summary.id, r])).values()];
  return { rec, saved, errors, finals, runs };
}

describe('track codec', () => {
  it('round trip in the FTMS resolution, offsets from the start', () => {
    const samples = [
      s(0, 3.25, { dist: 0, incl: 1.5, hr: 92, kcal: 0 }),
      s(1, 3.3, { dist: 1, incl: 1.5, hr: 93, kcal: 0 }),
      s(2.5, 0, { dist: 2 }),
    ];
    const track = encodeTrack(samples);
    expect(track.t).toEqual([0, 1000, 2500]);
    expect(track.speed).toEqual([325, 330, 0]);
    expect(track.incl).toEqual([15, 15, null]);
    expect(decodeTrack(T0, track)).toEqual(samples);
  });

  it('leaves out columns the treadmill never reported', () => {
    const track = encodeTrack([s(0, 3, { dist: 0 }), s(1, 3, { dist: 1 })]);
    expect(Object.keys(track).sort()).toEqual(['dist', 'speed', 't']);
    expect(decodeTrack(T0, track)).toEqual([s(0, 3, { dist: 0 }), s(1, 3, { dist: 1 })]);
  });
});

describe('summarize', () => {
  it('moving time without pauses, duration with them', () => {
    const r = summarize('x', 'ble', [s(0, 3), s(10, 3), s(20, 0), s(80, 0), s(90, 3), s(100, 3)]);
    expect(r.start).toBe(at(0));
    expect(r.end).toBe(at(100));
    // 0→10, 10→20 (stopping), 90→100; the pause 20→90 does not count
    expect(r.movingSec).toBe(30);
  });

  it('distance and kcal from the treadmill counters, also across a counter reset', () => {
    const r = summarize('x', 'ble', [
      s(0, 3.6, { dist: 100, kcal: 10 }), s(10, 3.6, { dist: 110, kcal: 11 }),
      // stopped and started again on the treadmill: counters start over
      s(20, 3.6, { dist: 5, kcal: 1 }), s(30, 3.6, { dist: 15, kcal: 2 }),
    ]);
    expect(r.dist).toBe(10 + 5 + 10);
    expect(r.kcal).toBe(1 + 1 + 1);
  });

  it('without a distance counter: speed × time; no kcal without a kcal counter', () => {
    const r = summarize('x', 'ble', [s(0, 3.6), s(10, 3.6), s(20, 7.2)]);
    expect(r.dist).toBeCloseTo(10 + 15, 6);
    expect(r.kcal).toBeUndefined();
  });

  it('average speed over the moving time, maximum, heart rate only from real values', () => {
    const r = summarize('x', 'ble', [
      s(0, 3, { dist: 0, hr: 0 }), s(60, 4, { dist: 60, hr: 100 }), s(120, 0, { dist: 120, hr: 120 }), s(180, 0, { dist: 120 }),
    ]);
    expect(r.movingSec).toBe(120);
    expect(r.avgKmh).toBeCloseTo(3.6, 6);
    expect(r.maxKmh).toBe(4);
    expect(r.avgHr).toBe(110);
    expect(r.maxHr).toBe(120);
  });

  it('no heart rate fields without heart rate', () => {
    const r = summarize('x', 'ble', [s(0, 3), s(10, 3)]);
    expect(r.avgHr).toBeUndefined();
    expect(r.maxHr).toBeUndefined();
  });
});

describe('buildRun', () => {
  it('no run without movement', () => {
    expect(buildRun([], 'ble')).toBeNull();
    expect(buildRun([s(0, 0), s(1, 0), s(2, undefined)], 'ble')).toBeNull();
  });

  it('trims standstill at the start and the end, keeps pauses, id from the start', () => {
    const run = buildRun([s(0, 0), s(1, 0), s(2, 3), s(3, 0), s(4, 3), s(5, 0), s(6, 0)], 'demo')!;
    expect(decodeTrack(run.summary.start, run.track).map(x => x.ts)).toEqual([at(2), at(3), at(4)]);
    expect(run.summary.id).toBe(String(at(2)));
    expect(run.summary.source).toBe('demo');
  });
});

describe('RunRecorder: detecting runs', () => {
  it('does not start on standstill', async () => {
    const h = harness();
    walk(h.rec, 0, 600, 0);
    h.rec.feed(s(601, undefined), 'ble');
    expect(h.rec.recording).toBe(false);
    h.rec.finish();
    await h.rec.settled();
    expect(h.saved).toHaveLength(0);
  });

  it(`ends ${RUN_END_IDLE_MS / 60000} min after the last movement, trimmed to it`, async () => {
    const h = harness();
    walk(h.rec, 0, 120, 3);
    walk(h.rec, 121, 200, 0);
    h.rec.tick(at(120) + RUN_END_IDLE_MS - 1);
    expect(h.rec.recording).toBe(true);
    h.rec.tick(at(120) + RUN_END_IDLE_MS);
    expect(h.rec.recording).toBe(false);
    await h.rec.settled();
    const runs = h.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.summary.start).toBe(at(0));
    expect(runs[0]!.summary.end).toBe(at(120));
    expect(runs[0]!.summary.movingSec).toBe(120);
  });

  it('says whether the belt stands while the run is still open (so the list can say "paused", not "running")', () => {
    const h = harness();
    expect(h.rec.standing).toBe(false);
    walk(h.rec, 0, 120, 3);
    expect(h.rec.standing).toBe(false);
    walk(h.rec, 121, 130, 0);
    expect(h.rec.recording).toBe(true);
    expect(h.rec.standing).toBe(true);
    walk(h.rec, 131, 140, 3);
    expect(h.rec.standing).toBe(false);
    h.rec.finish();
    expect(h.rec.standing).toBe(false);
  });

  it('also ends when the treadmill stops sending data', async () => {
    const h = harness();
    walk(h.rec, 0, 120, 3);
    h.rec.tick(at(120) + RUN_END_IDLE_MS);
    expect(h.rec.recording).toBe(false);
    await h.rec.settled();
    expect(h.runs()).toHaveLength(1);
  });

  it('a pause shorter than that stays in the same run', async () => {
    const h = harness();
    walk(h.rec, 0, 100, 3);
    walk(h.rec, 101, 280, 0);
    h.rec.tick(at(280));
    walk(h.rec, 281, 400, 3);
    h.rec.finish();
    await h.rec.settled();
    const runs = h.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.summary.end).toBe(at(400));
    expect(runs[0]!.summary.movingSec).toBe(101 + 119);
  });

  it('a gap without data longer than that splits the run, even without tick()', async () => {
    const h = harness();
    walk(h.rec, 0, 100, 3);
    walk(h.rec, 100 + RUN_END_IDLE_MS / 1000, 200 + RUN_END_IDLE_MS / 1000, 3);
    h.rec.finish();
    await h.rec.settled();
    expect(h.runs()).toHaveLength(2);
  });

  it('finish() (connection closed) ends the run at once', async () => {
    const h = harness();
    walk(h.rec, 0, 90, 3);
    h.rec.finish();
    expect(h.rec.recording).toBe(false);
    await h.rec.settled();
    expect(h.runs()).toHaveLength(1);
    expect(h.runs()[0]!.summary.end).toBe(at(90));
  });

  it(`runs with less than ${RUN_MIN_MOVING_SEC} s of movement are not saved`, async () => {
    const h = harness();
    walk(h.rec, 0, RUN_MIN_MOVING_SEC - 1, 3);
    h.rec.finish();
    await h.rec.settled();
    expect(h.saved).toHaveLength(0);
  });

  it('a new source (demo ↔ treadmill) starts a new run', async () => {
    const h = harness();
    walk(h.rec, 0, 100, 3, 'demo');
    walk(h.rec, 101, 200, 3, 'ble');
    h.rec.finish();
    await h.rec.settled();
    expect(h.runs().map(r => r.summary.source)).toEqual(['demo', 'ble']);
  });

  it('very long recordings are split instead of growing without bound', async () => {
    const h = harness(undefined, { maxSamples: 500 });
    walk(h.rec, 0, 600, 3);
    h.rec.finish();
    await h.rec.settled();
    const runs = h.runs();
    expect(runs).toHaveLength(2);
    expect(runs.map(r => r.track.t.length)).toEqual([500, 101]);
  });

  it('turned off: records nothing; turning it off during a run saves what there is', async () => {
    const h = harness();
    h.rec.setEnabled(false);
    walk(h.rec, 0, 100, 3);
    expect(h.rec.recording).toBe(false);
    h.rec.setEnabled(true);
    walk(h.rec, 200, 300, 3);
    h.rec.setEnabled(false);
    expect(h.rec.recording).toBe(false);
    walk(h.rec, 301, 400, 3);
    await h.rec.settled();
    const runs = h.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.summary.start).toBe(at(200));
    expect(runs[0]!.summary.end).toBe(at(300));
  });
});

describe('RunRecorder: saving', () => {
  it(`saves the running run every ${RUN_CHECKPOINT_MS / 1000} s under the same id, so closing the app loses little`, async () => {
    const h = harness();
    walk(h.rec, 0, 100, 3);
    await h.rec.settled();
    const first = RUN_MIN_MOVING_SEC, every = RUN_CHECKPOINT_MS / 1000;
    expect(h.saved.map(r => r.summary.end)).toEqual([at(first), at(first + every), at(first + 2 * every)]);
    expect(new Set(h.saved.map(r => r.summary.id)).size).toBe(1);
    expect(h.rec.currentId).toBe(String(at(0)));
    h.rec.finish();
    await h.rec.settled();
    expect(h.saved.at(-1)!.summary.end).toBe(at(100));
    expect(h.rec.currentId).toBeNull();
    expect(h.finals).toEqual([false, false, false, true]);
  });

  it('flush() saves at once (page hidden or closing)', async () => {
    const h = harness();
    walk(h.rec, 0, 70, 3);
    await h.rec.settled();
    const n = h.saved.length;
    h.rec.flush();
    await h.rec.settled();
    expect(h.saved).toHaveLength(n + 1);
    expect(h.saved.at(-1)!.summary.end).toBe(at(70));
    expect(h.rec.recording).toBe(true);
  });

  it('saves one after another, never in parallel or out of order', async () => {
    let active = 0, maxActive = 0;
    const ends: number[] = [];
    const h = harness(async run => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, run.summary.end === at(RUN_MIN_MOVING_SEC) ? 20 : 1));
      ends.push(run.summary.end);
      active--;
    });
    walk(h.rec, 0, 80, 3);
    h.rec.finish();
    await h.rec.settled();
    expect(maxActive).toBe(1);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(ends.at(-1)).toBe(at(80));
  });
});

describe('RunRecorder: errors never reach the control path', () => {
  it('a save that throws', async () => {
    const h = harness(() => { throw new Error('quota'); });
    expect(() => {
      walk(h.rec, 0, 100, 3);
      h.rec.tick(at(100) + RUN_END_IDLE_MS);
      walk(h.rec, 1000, 1100, 3);
      h.rec.flush();
      h.rec.finish();
      h.rec.setEnabled(false);
    }).not.toThrow();
    await h.rec.settled();
    expect(h.errors.length).toBeGreaterThan(0);
  });

  it('a save that rejects, and an error handler that throws as well', async () => {
    const rec = new RunRecorder({
      save: () => Promise.reject(new Error('blocked')),
      onError: () => { throw new Error('handler broken'); },
    });
    expect(() => { walk(rec, 0, 100, 3); rec.finish(); }).not.toThrow();
    await expect(rec.settled()).resolves.toBeUndefined();
  });

  it('odd samples', () => {
    const h = harness();
    expect(() => {
      h.rec.feed(s(0, Number.NaN), 'ble');
      h.rec.feed(s(1, 3, { dist: Number.NaN }), 'ble');
      h.rec.feed({ ts: Number.NaN, speed: 3 }, 'ble');
      h.rec.tick(Number.NaN);
      h.rec.finish();
    }).not.toThrow();
  });

  it('the save callback runs only after the samples have been handed over', () => {
    const save = vi.fn(async () => {});
    const rec = new RunRecorder({ save });
    walk(rec, 0, RUN_MIN_MOVING_SEC, 3);
    // Saving is asynchronous: feed() returns before any storage work starts
    expect(save).not.toHaveBeenCalled();
  });
});

describe('backup file', () => {
  const runA = buildRun([s(0, 3, { dist: 0, hr: 90 }), s(60, 3.5, { dist: 55, hr: 95 }), s(120, 4, { dist: 120, hr: 100 })], 'ble')!;
  const runB = buildRun([s(1000, 2.5), s(1100, 2.5)], 'demo')!;

  it('round trip: runs come back with the same summaries', () => {
    const text = serializeBackup([runA, runB], new Date(T0));
    const r = parseBackup(text);
    expect(r).toEqual({ ok: true, runs: [runA, runB], invalid: 0, workouts: [], invalidWorkouts: 0, routes: [], invalidRoutes: 0, plan: null });
  });

  it('is a readable JSON file with format and version', () => {
    const data = JSON.parse(serializeBackup([runA], new Date(T0)));
    expect(data.format).toBe('walkflow-backup');
    expect(data.version).toBe(1);
    expect(data.runs).toHaveLength(1);
  });

  it('rejects files that are not a Walkflow backup or come from a newer version', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, reason: 'unreadable' });
    expect(parseBackup('[]')).toEqual({ ok: false, reason: 'unreadable' });
    expect(parseBackup(JSON.stringify({ format: 'other', version: 1, runs: [] }))).toEqual({ ok: false, reason: 'unreadable' });
    expect(parseBackup(JSON.stringify({ format: 'walkflow-backup', version: 2, runs: [] }))).toEqual({ ok: false, reason: 'newer' });
  });

  it('skips broken runs and counts them; summaries are always recomputed from the samples', () => {
    const good = JSON.parse(serializeBackup([runA], new Date(T0))).runs[0];
    const broken = [
      { ...good, start: 'yesterday' },
      { ...good, source: 'cloud' },
      { ...good, track: { ...good.track, speed: good.track.speed.slice(1) } },
      { ...good, track: { ...good.track, t: [0, 2000, 1000] } },
      { ...good, track: { ...good.track, t: [-5, 60000, 120000] } },
      { ...good, track: { ...good.track, speed: [300, null, 1e9] } },
      { ...good, track: { ...good.track, hr: [90, 'x', 100] } },
      { ...good, track: { ...good.track, speed: [0, 0, 0] } },
      { ...good, track: { t: Array.from({ length: RUN_MAX_SAMPLES + 1 }, (_, i) => i * 1000), speed: Array.from({ length: RUN_MAX_SAMPLES + 1 }, () => 300) } },
      null,
    ];
    const tampered = { ...good, summary: { dist: 99999 } };
    const r = parseBackup(JSON.stringify({ format: 'walkflow-backup', version: 1, runs: [...broken, tampered] }));
    expect(r).toEqual({ ok: true, runs: [runA], invalid: broken.length, workouts: [], invalidWorkouts: 0, routes: [], invalidRoutes: 0, plan: null });
  });

  describe('workouts and week plan in the same file', () => {
    const workout = { id: 'w1', name: 'Easy', steps: [{ sec: 120, speed: 2 }, { meters: 400, speed: 3 }], updated: 5 };
    const plan = { minutes: [30, 0, 30, 0, 30, 0, 0] };

    it('round trip', () => {
      const r = parseBackup(serializeBackup([runA], new Date(T0), { workouts: [workout], plan }));
      expect(r).toEqual({ ok: true, runs: [runA], invalid: 0, workouts: [workout], invalidWorkouts: 0, routes: [], invalidRoutes: 0, plan });
    });

    it('a file without them (made before) still reads', () => {
      const data = JSON.parse(serializeBackup([runA], new Date(T0)));
      expect(data.workouts).toBeUndefined();
      expect(data.plan).toBeUndefined();
    });

    it('only workouts and a plan, without runs', () => {
      const r = parseBackup(serializeBackup([], new Date(T0), { workouts: [workout] }));
      expect(r).toMatchObject({ ok: true, runs: [], workouts: [workout] });
    });

    it('broken workouts are counted, a broken plan is ignored', () => {
      const text = JSON.stringify({
        format: 'walkflow-backup', version: 1, runs: [],
        workouts: [workout, { ...workout, id: 'w2', steps: [{ sec: -1, speed: 3 }] }, 'x'],
        plan: { minutes: [1, 2, 3] },
      });
      expect(parseBackup(text)).toEqual({ ok: true, runs: [], invalid: 0, workouts: [workout], invalidWorkouts: 2, routes: [], invalidRoutes: 0, plan: null });
    });
  });
  describe('routes in the same file', () => {
    const route = { id: 'r1', name: 'Park loop', updated: 7, points: [{ lat: 48.1, lon: 11.5, ele: 520 }, { lat: 48.101, lon: 11.5, ele: 521 }] };

    it('round trip', () => {
      const r = parseBackup(serializeBackup([runA], new Date(T0), { routes: [route] }));
      expect(r).toMatchObject({ ok: true, runs: [runA], routes: [route], invalidRoutes: 0 });
    });

    it('a file without routes (made before) still reads', () => {
      const data = JSON.parse(serializeBackup([runA], new Date(T0), { workouts: [] }));
      expect(data.routes).toBeUndefined();
      expect(parseBackup(JSON.stringify(data))).toMatchObject({ ok: true, routes: [], invalidRoutes: 0 });
    });

    it('only routes, without runs', () => {
      expect(parseBackup(serializeBackup([], new Date(T0), { routes: [route] }))).toMatchObject({ ok: true, runs: [], routes: [route] });
    });

    it('broken routes are counted and left out', () => {
      const text = JSON.stringify({
        format: 'walkflow-backup', version: 1, runs: [],
        routes: [route, { ...route, id: 'r2', points: [{ lat: 99, lon: 0 }, { lat: 0, lon: 0 }] }, 'x'],
      });
      expect(parseBackup(text)).toMatchObject({ ok: true, routes: [route], invalidRoutes: 2 });
    });
  });
});

describe('run tag (what the run was: a workout or a route)', () => {
  const tag: RunTag = { kind: 'route', id: 'r1', name: 'Park loop', completed: true };

  it('readTag keeps the known fields of a valid tag', () => {
    expect(readTag({ ...tag, extra: 1 })).toEqual(tag);
    expect(readTag({ ...tag, kind: 'workout', id: 'tpl:intervals' })).toEqual({ ...tag, kind: 'workout', id: 'tpl:intervals' });
  });

  it('readTag rejects what is not a tag', () => {
    for (const bad of [
      null, 'x', [], {}, { ...tag, kind: 'other' }, { ...tag, id: '' }, { ...tag, id: 'x'.repeat(65) }, { ...tag, id: 5 },
      { ...tag, name: ' ' }, { ...tag, name: 'x'.repeat(81) }, { ...tag, name: 5 }, { ...tag, completed: 'yes' }, { ...tag, completed: undefined },
    ]) expect(readTag(bad)).toBeNull();
  });

  it('trims the name', () => {
    expect(readTag({ ...tag, name: '  Park loop ' })?.name).toBe('Park loop');
  });

  it('buildRun puts the tag on the summary and leaves it out otherwise', () => {
    const pts = [s(0, 3, { dist: 0 }), s(60, 3, { dist: 50 })];
    expect(buildRun(pts, 'ble', tag)!.summary.tag).toEqual(tag);
    expect('tag' in buildRun(pts, 'ble')!.summary).toBe(false);
  });

  describe('RunRecorder', () => {
    const planned = { kind: 'route', id: 'r1', name: 'Park loop' } as const;

    it('tags the run that starts after begin(), not yet completed', async () => {
      const h = harness();
      h.rec.begin(planned);
      walk(h.rec, 0, 120, 3);
      h.rec.finish();
      await h.rec.settled();
      expect(h.runs()[0]!.summary.tag).toEqual({ ...planned, completed: false });
    });

    it('complete() marks the run as completed and saves it right away', async () => {
      const h = harness();
      const token = h.rec.begin(planned);
      walk(h.rec, 0, 120, 3);
      h.rec.complete(token, true);
      await h.rec.settled();
      expect(h.runs()[0]!.summary.tag?.completed).toBe(true);
      expect(h.rec.recording).toBe(true);
    });

    it('complete(false) keeps the tag with completed false', async () => {
      const h = harness();
      const token = h.rec.begin(planned);
      walk(h.rec, 0, 120, 3);
      h.rec.complete(token, false);
      h.rec.finish();
      await h.rec.settled();
      expect(h.runs()[0]!.summary.tag).toEqual({ ...planned, completed: false });
    });

    it('closes a run that is already going, so the tagged run is a run of its own', async () => {
      const h = harness();
      walk(h.rec, 0, 120, 3);
      h.rec.begin(planned);
      walk(h.rec, 130, 250, 3);
      h.rec.finish();
      await h.rec.settled();
      const runs = h.runs();
      expect(runs).toHaveLength(2);
      expect(runs[0]!.summary.tag).toBeUndefined();
      expect(runs[1]!.summary.tag?.id).toBe('r1');
    });

    it('a walk that never started moving leaves no tag behind for the next run', async () => {
      const h = harness();
      const token = h.rec.begin(planned);
      walk(h.rec, 0, 30, 0);
      h.rec.complete(token, false);
      walk(h.rec, 40, 160, 3);
      h.rec.finish();
      await h.rec.settled();
      expect(h.runs()[0]!.summary.tag).toBeUndefined();
    });

    it('the tag ends with its run', async () => {
      const h = harness();
      h.rec.begin(planned);
      walk(h.rec, 0, 120, 3);
      h.rec.tick(at(120) + RUN_END_IDLE_MS);
      walk(h.rec, 10_000, 10_120, 3);
      h.rec.finish();
      await h.rec.settled();
      const runs = h.runs();
      expect(runs).toHaveLength(2);
      expect(runs[0]!.summary.tag).toBeDefined();
      expect(runs[1]!.summary.tag).toBeUndefined();
    });

    it('a late complete() of an earlier walk does not touch the walk that replaced it', async () => {
      const h = harness();
      const first = h.rec.begin(planned);
      const second = h.rec.begin({ kind: 'workout', id: 'w1', name: 'Intervals' });
      h.rec.complete(first, false);
      walk(h.rec, 0, 120, 3);
      h.rec.complete(second, true);
      h.rec.finish();
      await h.rec.settled();
      expect(h.runs()[0]!.summary.tag).toEqual({ kind: 'workout', id: 'w1', name: 'Intervals', completed: true });
    });

    it('shortens a name that is too long instead of losing the tag', async () => {
      const h = harness();
      h.rec.begin({ ...planned, name: 'x'.repeat(200) });
      walk(h.rec, 0, 120, 3);
      h.rec.finish();
      await h.rec.settled();
      expect(h.runs()[0]!.summary.tag?.name).toHaveLength(80);
    });
  });

  describe('in the backup file', () => {
    const base = buildRun([s(0, 3, { dist: 0 }), s(60, 3.5, { dist: 55 }), s(120, 4, { dist: 120 })], 'ble')!;
    const tagged: Run = { ...base, summary: { ...base.summary, tag } };

    it('round trip: the tag comes back', () => {
      const r = parseBackup(serializeBackup([tagged], new Date(T0)));
      expect(r.ok && r.runs).toEqual([tagged]);
    });

    it('a run without a tag is written without one, and files from before tags still read', () => {
      expect(JSON.parse(serializeBackup([base], new Date(T0))).runs[0]).not.toHaveProperty('tag');
      const r = parseBackup(serializeBackup([base], new Date(T0)));
      expect(r.ok && r.runs).toEqual([base]);
    });

    it('a damaged tag costs the tag, not the run', () => {
      const data = JSON.parse(serializeBackup([tagged], new Date(T0)));
      data.runs[0].tag = { kind: 'route', id: '', name: 'x', completed: true };
      const r = parseBackup(JSON.stringify(data));
      expect(r.ok && r.invalid).toBe(0);
      expect(r.ok && r.runs[0]!.summary.tag).toBeUndefined();
      expect(r.ok && r.runs[0]!.summary.dist).toBe(base.summary.dist);
    });
  });
});
