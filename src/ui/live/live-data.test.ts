import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeltBanner } from '../../core/safety/belt-banner';
import type { SpeedGovernor, StandstillDetector } from '../../core/safety/safety';
import { setupLiveData } from './live-data';
import { Session } from './session';

const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

function rig(opts: { active?: boolean; standstillFires?: boolean } = {}) {
  const calls: string[] = [];
  const session = new Session();
  const banner = {
    stopRequested: vi.fn(() => calls.push('banner stop')),
    speed: vi.fn(),
  } as unknown as BeltBanner;
  const governor = {
    reset: vi.fn(() => calls.push('governor reset')),
    noteMeasured: vi.fn(),
  } as unknown as SpeedGovernor;
  const standstill = {
    disarm: vi.fn(() => calls.push('standstill disarm')),
    feed: vi.fn(() => opts.standstillFires ?? false),
  } as unknown as StandstillDetector;
  const runner = { active: opts.active ?? false, abort: vi.fn(() => calls.push('abort run')), tick: vi.fn() };
  const recorder = { feed: vi.fn() };
  const log = vi.fn();
  const distance = vi.fn();
  const renderStats = vi.fn();
  const redrawChart = vi.fn();
  const live = setupLiveData({ session, banner, governor, standstill, runner, recorder, now: () => 5000, log, distance, renderStats, redrawChart });
  return { live, session, calls, banner, governor, standstill, runner, recorder, log, distance, renderStats, redrawChart };
}

describe('Machine Status', () => {
  it.each([
    ['stopped on the treadmill', [0x02, 0x01]],
    ['paused on the treadmill', [0x02, 0x02]],
    ['safety key', [0x03]],
  ])('%s: the belt is no longer ours, the program ends, the ramp is forgotten', (_name, bytes) => {
    const r = rig({ active: true });
    r.session.beltStarted = true;
    r.live.events.machineStatus(dv(...bytes));
    expect(r.session.beltStarted).toBe(false);
    expect(r.calls).toEqual(['banner stop', 'abort run', 'governor reset', 'standstill disarm']);
  });

  it('does not touch a program when none runs', () => {
    const r = rig({ active: false });
    r.live.events.machineStatus(dv(0x02, 0x01));
    expect(r.runner.abort).not.toHaveBeenCalled();
    expect(r.calls).toEqual(['banner stop', 'governor reset', 'standstill disarm']);
  });

  it('started: the belt counts as started', () => {
    const r = rig();
    r.live.events.machineStatus(dv(0x04));
    expect(r.session.beltStarted).toBe(true);
  });

  it('control lost: remembered, so the next stop asks for control first', () => {
    const r = rig();
    r.live.events.machineStatus(dv(0xff));
    expect(r.session.controlLost).toBe(true);
    expect(r.log).toHaveBeenCalledTimes(2);
  });

  it('a target speed change on the device changes nothing here', () => {
    const r = rig({ active: true });
    r.session.beltStarted = true;
    r.live.events.machineStatus(dv(0x05, 0xc8, 0x00));
    expect(r.session.beltStarted).toBe(true);
    expect(r.runner.abort).not.toHaveBeenCalled();
  });

  it('logs every status, also one it does not know', () => {
    const r = rig();
    r.live.events.machineStatus(dv(0x7e));
    expect(r.log).toHaveBeenCalledTimes(1);
    expect(r.runner.abort).not.toHaveBeenCalled();
  });
});

describe('live data', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the latest figures and tells the others', () => {
    const r = rig();
    r.live.events.data({ speed: 2.5, dist: 120, incl: 1, kcal: 4, time: 90 });
    r.live.events.heartRate(71);
    expect(r.session.cur).toMatchObject({ speed: 2.5, dist: 120, incl: 1, kcal: 4, time: 90, hr: 71 });
    expect(r.distance).toHaveBeenCalledWith(120);
    expect(r.governor.noteMeasured).toHaveBeenCalledWith(2.5);
    expect(r.session.lastMeasured).toBe(2.5);
    expect(r.session.lastMeasuredAt).toBe(5000);
    expect(r.runner.tick).toHaveBeenCalled();
  });

  it('ignores a heart rate of 0 (no sensor contact)', () => {
    const r = rig();
    r.live.events.heartRate(70);
    r.live.events.heartRate(0);
    r.live.events.data({ hr: 0 });
    expect(r.session.cur.hr).toBe(70);
  });

  it('standing still during a program ends it', () => {
    const r = rig({ active: true, standstillFires: true });
    r.live.events.data({ speed: 0 });
    expect(r.runner.abort).toHaveBeenCalledWith(expect.any(Function), true);
    expect(r.calls).toEqual(['abort run', 'governor reset']);
  });

  it('standing still without a program ends nothing', () => {
    const r = rig({ active: false, standstillFires: true });
    r.live.events.data({ speed: 0 });
    expect(r.runner.abort).not.toHaveBeenCalled();
  });

  it('records one sample a second, with the source', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000_000);
    const r = rig();
    r.live.setSource('demo');
    r.live.events.data({ speed: 2 });
    r.live.events.data({ speed: 2.1 });
    expect(r.session.samples).toHaveLength(1);
    expect(r.recorder.feed).toHaveBeenCalledWith(expect.objectContaining({ ts: 10_000_000, speed: 2 }), 'demo');
    vi.setSystemTime(10_001_000);
    r.live.events.data({ speed: 2.2 });
    expect(r.session.samples).toHaveLength(2);
  });

  it('does not keep more than 20000 samples', () => {
    vi.useFakeTimers();
    const r = rig();
    for (let i = 0; i < 20_000; i++) r.session.samples.push({ ts: i });
    vi.setSystemTime(50_000_000);
    r.live.events.data({ speed: 1 });
    expect(r.session.samples).toHaveLength(20_000);
    expect(r.session.samples.at(-1)?.speed).toBe(1);
  });
});
