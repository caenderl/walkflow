import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from './i18n';
import { fmtTime, parseProgram, ProgramRunner, totalSeconds, type ProgramHost } from './program';

describe('parseProgram', () => {
  it('reads "minutes km/h" lines', () => {
    expect(parseProgram('2 2.0\n3 3.5\n1 5')).toEqual([
      { sec: 120, speed: 2 }, { sec: 180, speed: 3.5 }, { sec: 60, speed: 5 },
    ]);
  });

  it('accepts decimal commas and tabs, ignores junk lines', () => {
    expect(parseProgram('0,5\t3,5\n# comment\n\n  1.25 4 rest is ignored')).toEqual([
      { sec: 30, speed: 3.5 }, { sec: 75, speed: 4 },
    ]);
  });

  it('empty text → empty program', () => {
    expect(parseProgram('')).toEqual([]);
  });

  it('total duration and time format', () => {
    expect(totalSeconds(parseProgram('2 2\n3 3'))).toBe(300);
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(600)).toBe('10:00');
  });
});

/** Clock separate from the timers, so delayed timers (background tab) can be simulated. */
function setup(opts: { startOk?: boolean } = {}) {
  let offset = 0;
  let target: number | null = null;
  const calls: string[] = [];
  const logs: string[] = [];
  const statuses: string[] = [];
  const host: ProgramHost = {
    start: vi.fn(async () => { calls.push('start'); return opts.startOk ?? true; }),
    stop: vi.fn(async () => { calls.push('stop'); }),
    setTarget: vi.fn((kmh: number) => { target = kmh; calls.push(`speed ${kmh}`); }),
    currentTarget: () => target,
    status: vi.fn(text => { statuses.push(text()); }),
    log: m => logs.push(m),
  };
  const runner = new ProgramRunner(host, { now: () => Date.now() + offset });
  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  /** The clock jumps without timers firing (throttled tab). */
  const jump = (ms: number) => { offset += ms; };
  const lastStatus = () => statuses.at(-1);
  return { host, runner, calls, logs, statuses, lastStatus, advance, jump };
}

describe('ProgramRunner', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts, waits for the countdown and runs the steps one after another', async () => {
    const { runner, calls, advance } = setup();
    const done = runner.run([{ sec: 2, speed: 2 }, { sec: 1, speed: 4 }]);

    await advance(0);
    expect(calls).toEqual(['start']);
    await advance(4499);
    expect(calls).toEqual(['start']);
    await advance(1);
    expect(calls).toEqual(['start', 'speed 2']);
    await advance(2000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 4']);
    await advance(1000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 4', 'stop']);
    await expect(done).resolves.toBe('finished');
    expect(runner.active).toBe(false);
  });

  it('shows the remaining time per step', async () => {
    const { runner, lastStatus, advance } = setup();
    void runner.run([{ sec: 2, speed: 2 }]);
    await advance(0);
    expect(lastStatus()).toBe('Belt starting…');
    await advance(4500);
    expect(lastStatus()).toBe('Step 1/1: 2.0 km/h, 0:02 left');
    await advance(1000);
    expect(lastStatus()).toBe('Step 1/1: 2.0 km/h, 0:01 left');
    await advance(1000);
    expect(lastStatus()).toBe('Done. Stopping the belt.');
  });

  it('status texts follow a language change', async () => {
    const { host, runner, advance } = setup();
    void runner.run([{ sec: 2, speed: 2.5 }]);
    await advance(4500);
    const text = vi.mocked(host.status).mock.lastCall![0];
    expect(text()).toBe('Step 1/1: 2.5 km/h, 0:02 left');
    setLanguage('de');
    expect(text()).toBe('Schritt 1/1: 2,5 km/h, noch 0:02');
    setLanguage('en');
  });

  it('abort during the countdown: no speed command, no extra stop', async () => {
    const { runner, calls, lastStatus, advance } = setup();
    const done = runner.run([{ sec: 60, speed: 3 }]);
    await advance(1000);
    runner.abort(() => 'Stopped');
    expect(lastStatus()).toBe('Stopped');
    await advance(10_000);
    expect(calls).toEqual(['start']);
    await expect(done).resolves.toBe('aborted');
  });

  it('abort in the middle of a step: no further commands, not even from external ticks', async () => {
    const { runner, calls, lastStatus, advance } = setup();
    const done = runner.run([{ sec: 10, speed: 3 }, { sec: 10, speed: 5 }]);
    await advance(4500 + 3000);
    runner.abort();
    expect(lastStatus()).toBe('Program cancelled');
    await advance(60_000);
    runner.tick();
    expect(calls).toEqual(['start', 'speed 3']);
    await expect(done).resolves.toBe('aborted');
  });

  it('abort while host.start() is still running', async () => {
    const { host, runner, calls, advance } = setup();
    let release!: () => void;
    host.start = vi.fn(() => new Promise<boolean>(r => { release = () => r(true); }));
    const done = runner.run([{ sec: 10, speed: 3 }]);
    runner.abort();
    release();
    await advance(20_000);
    expect(calls).toEqual([]);
    await expect(done).resolves.toBe('aborted');
  });

  it('start failed → program ends without a speed command', async () => {
    const { runner, calls, lastStatus, advance } = setup({ startOk: false });
    const done = runner.run([{ sec: 10, speed: 3 }]);
    await advance(20_000);
    expect(calls).toEqual(['start']);
    expect(lastStatus()).toBe('Start failed, program ended');
    await expect(done).resolves.toBe('aborted');
  });

  it('a new run makes the old one ineffective', async () => {
    const { runner, calls, advance } = setup();
    const first = runner.run([{ sec: 10, speed: 3 }]);
    await advance(5000);
    const second = runner.run([{ sec: 1, speed: 2 }]);
    await advance(20_000);
    expect(calls).toEqual(['start', 'speed 3', 'start', 'speed 2', 'stop']);
    await expect(first).resolves.toBe('aborted');
    await expect(second).resolves.toBe('finished');
  });

  it('abort without an active program does not change the status', () => {
    const { host, runner } = setup();
    runner.abort(() => 'x');
    expect(host.status).not.toHaveBeenCalled();
  });

  it('delayed timers: jumps to the right step on the next tick and logs what was skipped', async () => {
    const { runner, calls, logs, advance, jump } = setup();
    void runner.run([{ sec: 10, speed: 2 }, { sec: 10, speed: 3 }, { sec: 10, speed: 4 }, { sec: 10, speed: 5 }]);
    await advance(4500);
    expect(calls).toEqual(['start', 'speed 2']);
    jump(25_000); // 25 s without timers, e.g. background tab
    runner.tick(); // e.g. from a BLE notification
    expect(calls).toEqual(['start', 'speed 2', 'speed 4']);
    expect(logs.join('\n')).toMatch(/Step 2 skipped/);
  });

  it('delayed timers past the end of the program: stops immediately', async () => {
    const { runner, calls, advance, jump } = setup();
    const done = runner.run([{ sec: 10, speed: 2 }, { sec: 10, speed: 3 }]);
    await advance(4500);
    jump(60_000);
    runner.tick();
    await advance(0);
    expect(calls).toEqual(['start', 'speed 2', 'stop']);
    await expect(done).resolves.toBe('finished');
  });

  it('the countdown runs on the clock, not on the timer', async () => {
    const { runner, calls, advance, jump } = setup();
    void runner.run([{ sec: 10, speed: 2 }]);
    await advance(0);
    jump(4600);
    runner.tick();
    expect(calls).toEqual(['start', 'speed 2']);
  });

  it('external ticks do not send duplicate commands', async () => {
    const { runner, calls, advance } = setup();
    void runner.run([{ sec: 10, speed: 2 }]);
    await advance(4500);
    runner.tick(); runner.tick();
    await advance(500);
    runner.tick();
    expect(calls).toEqual(['start', 'speed 2']);
  });

  it('steps with 0 minutes are skipped silently', async () => {
    const { runner, calls, logs, advance } = setup();
    void runner.run([{ sec: 0, speed: 5 }, { sec: 2, speed: 2 }]);
    await advance(4500);
    expect(calls).toEqual(['start', 'speed 2']);
    expect(logs).toEqual([]);
  });

  it('reports phase and current step', async () => {
    const { runner, advance } = setup();
    expect(runner.phase).toBe('idle');
    void runner.run([{ sec: 2, speed: 2 }]);
    await advance(0);
    expect(runner.phase).toBe('countdown');
    await advance(4500);
    expect(runner.phase).toBe('running');
    expect(runner.stepIndex).toBe(0);
  });
});
