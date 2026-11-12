import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TreadmillEventMap } from 'ftms-treadmill';
import { newFigures, setupLiveData, type LiveDataHost } from './live-data';

/** A treadmill that only hands on events, as the facade does */
function fakeTreadmill() {
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  return {
    on: ((event: string, cb: (e: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
      return () => {};
    }) as LiveDataHost['tm']['on'],
    emit<E extends keyof TreadmillEventMap>(event: E, payload: TreadmillEventMap[E]) {
      for (const cb of listeners.get(event) ?? []) cb(payload);
    },
  };
}

function rig(opts: { active?: boolean } = {}) {
  const tm = fakeTreadmill();
  const figures = newFigures();
  const banner = { startRequested: vi.fn(), stopRequested: vi.fn(), speed: vi.fn() };
  const runner = { active: opts.active ?? false, abort: vi.fn(), tick: vi.fn() };
  const recorder = { feed: vi.fn() };
  const log = vi.fn();
  const distance = vi.fn();
  const renderStats = vi.fn();
  const redrawChart = vi.fn();
  const stopFailed = vi.fn();
  const live = setupLiveData({ tm, figures, banner, runner, recorder, now: () => 5000, log, distance, renderStats, redrawChart, stopFailed });
  return { tm, live, figures, banner, runner, recorder, log, distance, renderStats, redrawChart, stopFailed };
}

describe('the belt ends', () => {
  it.each([
    ['machine-stopped', 'Program ended: Belt stopped (on the device or via app)'],
    ['safety-key', 'Program ended: Belt stopped by the safety key'],
    ['stop', 'Stopped'],
  ] as const)('%s ends the program with what happened', (reason, text) => {
    const r = rig({ active: true });
    r.tm.emit('ended', { reason });
    expect(r.runner.abort).toHaveBeenCalledTimes(1);
    const shown = r.runner.abort.mock.calls[0]![0] as () => string;
    expect(shown()).toBe(text);
  });

  it('standing still during a program ends it, says so and keeps the message on screen', () => {
    const r = rig({ active: true });
    r.tm.emit('ended', { reason: 'standstill' });
    expect(r.runner.abort).toHaveBeenCalledWith(expect.any(Function), true);
    expect(r.log).toHaveBeenCalledTimes(1);
  });

  it('standing still without a program ends nothing', () => {
    const r = rig({ active: false });
    r.tm.emit('ended', { reason: 'standstill' });
    expect(r.runner.abort).not.toHaveBeenCalled();
    expect(r.log).not.toHaveBeenCalled();
  });

  it('a Stop that did not get through is shown', () => {
    const r = rig();
    r.tm.emit('stopFailed', true);
    expect(r.stopFailed).toHaveBeenCalledWith(true);
  });
});

describe('the banner', () => {
  it('follows the belt phase and the measured speed', () => {
    const r = rig();
    r.tm.emit('phase', 'starting');
    expect(r.banner.startRequested).toHaveBeenCalledWith(5000);
    r.tm.emit('phase', 'stopping');
    expect(r.banner.stopRequested).toHaveBeenCalledWith(5000);
    r.tm.emit('data', { speed: 2 });
    expect(r.banner.speed).toHaveBeenCalledWith(2, 5000);
  });

  it('a stop on a standing belt still ends the green of a start', () => {
    const r = rig();
    r.tm.emit('phase', 'standing');
    expect(r.banner.stopRequested).toHaveBeenCalledTimes(1);
  });
});

describe('the log', () => {
  it('says what the treadmill reports, in the language of the app', () => {
    const r = rig();
    r.tm.emit('machineStatus', { event: { kind: 'safety-key' }, hex: '03' });
    expect(r.log).toHaveBeenCalledWith('ℹ Status 03 (Belt stopped by the safety key)');
    r.tm.emit('controlResponse', { requestOp: 0x02, result: 3 });
    expect(r.log).toHaveBeenCalledWith('← Set Speed: invalid parameter');
    r.tm.emit('notice', { code: 'write-dropped', bytes: '02 5e 01' });
    expect(r.log).toHaveBeenCalledWith('dropped: 02 5e 01 (stop/pause takes priority)');
    r.tm.emit('log', '→ 08 01');
    expect(r.log).toHaveBeenCalledWith('→ 08 01');
  });

  it('control lost: a second line says what follows from it', () => {
    const r = rig();
    r.tm.emit('machineStatus', { event: { kind: 'control-lost' }, hex: 'ff' });
    expect(r.log).toHaveBeenCalledTimes(2);
  });

  it('a status it does not know is logged with its bytes', () => {
    const r = rig();
    r.tm.emit('machineStatus', { event: null, hex: '' });
    expect(r.log).toHaveBeenCalledTimes(1);
  });
});

describe('live data', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the latest figures and tells the others', () => {
    const r = rig();
    r.tm.emit('data', { speed: 2.5, dist: 120, incl: 1, kcal: 4, time: 90 });
    r.tm.emit('heartRate', 71);
    expect(r.figures.cur).toMatchObject({ speed: 2.5, dist: 120, incl: 1, kcal: 4, time: 90, hr: 71 });
    expect(r.distance).toHaveBeenCalledWith(120);
    expect(r.runner.tick).toHaveBeenCalled();
  });

  it('ignores a heart rate of 0 (no sensor contact)', () => {
    const r = rig();
    r.tm.emit('heartRate', 70);
    r.tm.emit('heartRate', 0);
    r.tm.emit('data', { hr: 0 });
    expect(r.figures.cur.hr).toBe(70);
  });

  it('records one sample a second, with the source', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000_000);
    const r = rig();
    r.live.setSource('demo');
    r.tm.emit('data', { speed: 2 });
    r.tm.emit('data', { speed: 2.1 });
    expect(r.figures.samples).toHaveLength(1);
    expect(r.recorder.feed).toHaveBeenCalledWith(expect.objectContaining({ ts: 10_000_000, speed: 2 }), 'demo');
    vi.setSystemTime(10_001_000);
    r.tm.emit('data', { speed: 2.2 });
    expect(r.figures.samples).toHaveLength(2);
  });

  it('does not keep more than 20000 samples', () => {
    vi.useFakeTimers();
    const r = rig();
    for (let i = 0; i < 20_000; i++) r.figures.samples.push({ ts: i });
    vi.setSystemTime(50_000_000);
    r.tm.emit('data', { speed: 1 });
    expect(r.figures.samples).toHaveLength(20_000);
    expect(r.figures.samples.at(-1)?.speed).toBe(1);
  });
});
