import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from './i18n';
import { setUnits } from './units';
import { fmtLength, fmtTime, formatProgram, parseProgram, programLength, ProgramRunner, totalSeconds, type ProgramHost } from './program';

describe('incline in the text format', () => {
  it('reads "incl <percent>" after the speed', () => {
    expect(parseProgram('5 4 incl 2\n400 m 3.5 incl 1,5\n1 3 incl -1')).toEqual([
      { sec: 300, speed: 4, incline: 2 }, { meters: 400, speed: 3.5, incline: 1.5 }, { sec: 60, speed: 3, incline: -1 },
    ]);
  });

  it('leaves it out when it is not there or not a number', () => {
    expect(parseProgram('5 4 incl\n5 4 incl x')).toEqual([{ sec: 300, speed: 4 }, { sec: 300, speed: 4 }]);
  });

  it('formatProgram writes it, and the text parses back to the same steps', () => {
    const steps = [{ sec: 300, speed: 4, incline: 2 }, { meters: 400, speed: 3.5, incline: 0 }, { sec: 20, speed: 3 }];
    expect(formatProgram(steps)).toBe('5 4 incl 2\n400 m 3.5 incl 0\n20 s 3');
    expect(parseProgram(formatProgram(steps))).toEqual(steps);
  });
});

describe('the text format in imperial units', () => {
  afterEach(() => setUnits('metric'));

  it('reads the speed as mph and converts it to km/h', () => {
    setUnits('imperial');
    expect(parseProgram('5 2.5\n30 s 3,1')).toEqual([{ sec: 300, speed: 4.02 }, { sec: 30, speed: 4.99 }]);
  });

  it('knows mi and ft next to m and km, in either system', () => {
    expect(parseProgram('0.25 mi 3\n1320 ft 3\n400 m 3\n1 km 3')).toEqual([
      { meters: 402, speed: 3 }, { meters: 402, speed: 3 }, { meters: 400, speed: 3 }, { meters: 1000, speed: 3 },
    ]);
    setUnits('imperial');
    expect(parseProgram('1 mi 2')).toEqual([{ meters: 1609, speed: 3.22 }]);
  });

  it('keeps "min" a unit of time, not of miles', () => {
    expect(parseProgram('5 min 3')).toEqual([{ sec: 300, speed: 3 }]);
  });

  it('writes mph, and miles or feet, and reads them back close to the same steps', () => {
    setUnits('imperial');
    const steps = [{ sec: 300, speed: 4.02 }, { meters: 1609, speed: 3.22 }, { meters: 100, speed: 4.83 }];
    const text = formatProgram(steps);
    expect(text).toBe('5 2.498\n1 mi 2.001\n328.084 ft 3.001');
    for (const [i, s] of parseProgram(text).entries()) {
      expect(s.speed).toBeCloseTo(steps[i]!.speed, 1);
      expect(s.meters ?? 0).toBeCloseTo(steps[i]!.meters ?? 0, -1);
    }
  });

  it('keeps a step exactly as it was when its line was not touched, so opening and applying changes nothing', () => {
    const steps = [{ sec: 300, speed: 4 }, { meters: 400, speed: 5.6 }, { meters: 1000, speed: 3.5, incline: 1 }];
    setUnits('imperial');
    expect(parseProgram(formatProgram(steps), steps)).toEqual(steps);
    // a changed line is read again, the others stay
    const text = formatProgram(steps).split('\n');
    text[0] = '5 3';
    const out = parseProgram(text.join('\n'), steps);
    expect(out[0]).toEqual({ sec: 300, speed: 4.83 });
    expect(out.slice(1)).toEqual(steps.slice(1));
  });

  it('does not change the metric text: whole numbers, m and km', () => {
    expect(formatProgram([{ sec: 300, speed: 4 }, { meters: 400, speed: 3.5 }, { meters: 1500, speed: 3 }])).toBe('5 4\n400 m 3.5\n1.5 km 3');
  });
});

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

  it('units: min (default), s, m, km', () => {
    expect(parseProgram('20 s 3.5\n2 min 4\n400 m 3\n0,5km 4,5\n300m 3')).toEqual([
      { sec: 20, speed: 3.5 }, { sec: 120, speed: 4 }, { meters: 400, speed: 3 }, { meters: 500, speed: 4.5 },
      { meters: 300, speed: 3 },
    ]);
  });

  it('a distance step needs a speed above 0, otherwise it could never end', () => {
    expect(parseProgram('400 m 0\n400 m 3')).toEqual([{ meters: 400, speed: 3 }]);
  });

  it('formatProgram writes text that parses back to the same steps', () => {
    const steps = [{ sec: 120, speed: 2 }, { sec: 20, speed: 3.5 }, { meters: 400, speed: 3 }, { meters: 1500, speed: 4.5 }];
    expect(formatProgram(steps)).toBe('2 2\n20 s 3.5\n400 m 3\n1.5 km 4.5');
    expect(parseProgram(formatProgram(steps))).toEqual(steps);
  });

  it('length: time and distance are summed separately', () => {
    const steps = parseProgram('2 2\n3 3\n400 m 3\n1 km 4');
    expect(programLength(steps)).toEqual({ sec: 300, meters: 1400 });
    expect(fmtLength({ sec: 300, meters: 0 })).toBe('5:00 min');
    expect(fmtLength({ sec: 0, meters: 400 })).toBe('400 m');
    expect(fmtLength({ sec: 0, meters: 1400 })).toBe('1.40 km');
    expect(fmtLength({ sec: 300, meters: 1400 })).toBe('5:00 min + 1.40 km');
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
  let dist: number | undefined;
  const calls: string[] = [];
  const logs: string[] = [];
  const statuses: string[] = [];
  const host: ProgramHost = {
    start: vi.fn(async () => { calls.push('start'); return opts.startOk ?? true; }),
    stop: vi.fn(async () => { calls.push('stop'); }),
    setTarget: vi.fn((kmh: number) => { target = kmh; calls.push(`speed ${kmh}`); }),
    currentTarget: () => target,
    distance: () => dist,
    status: vi.fn(text => { statuses.push(text()); }),
    log: m => logs.push(m),
  };
  const runner = new ProgramRunner(host, { now: () => Date.now() + offset });
  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  /** The clock jumps without timers firing (throttled tab). */
  const jump = (ms: number) => { offset += ms; };
  const lastStatus = () => statuses.at(-1);
  const setDist = (m: number | undefined) => { dist = m; };
  return { host, runner, calls, logs, statuses, lastStatus, advance, jump, setDist };
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

describe('ProgramRunner: distance steps', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /** Starts the program with a distance reading and waits for the countdown */
  async function started(steps: Parameters<ProgramRunner['run']>[0], dist: number | null = 5000) {
    const ctx = setup();
    ctx.setDist(dist ?? undefined);
    const done = ctx.runner.run(steps);
    await ctx.advance(4500);
    return { ...ctx, done };
  }

  it('a distance step ends when the belt has covered the distance, then the next step starts', async () => {
    const { runner, calls, setDist, advance } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    expect(calls).toEqual(['start', 'speed 3']);
    setDist(5060); runner.tick();
    expect(calls).toEqual(['start', 'speed 3']);
    setDist(5100); runner.tick();
    expect(calls).toEqual(['start', 'speed 3', 'speed 2']);
    await advance(5000);
    expect(calls).toEqual(['start', 'speed 3', 'speed 2', 'stop']);
  });

  it('the time of a following step counts from the end of the distance step, not from the program start', async () => {
    const { runner, calls, setDist, advance } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    await advance(60_000); // slow, but within the limit
    setDist(5100); runner.tick();
    expect(calls.at(-1)).toBe('speed 2');
    await advance(4000);
    expect(calls).not.toContain('stop');
    await advance(1000);
    expect(calls.at(-1)).toBe('stop');
  });

  it('is picked up by the timer as well, without any BLE notification', async () => {
    const { calls, setDist, advance } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    setDist(5100);
    await advance(1000);
    expect(calls).toEqual(['start', 'speed 3', 'speed 2']);
  });

  it('shows the remaining distance', async () => {
    const { runner, lastStatus, setDist } = await started([{ meters: 400, speed: 3 }, { meters: 2000, speed: 3 }]);
    expect(lastStatus()).toBe('Step 1/2: 3.0 km/h, 400 m left');
    setDist(5150); runner.tick();
    expect(lastStatus()).toBe('Step 1/2: 3.0 km/h, 250 m left');
    setDist(5400); runner.tick();
    expect(lastStatus()).toBe('Step 2/2: 3.0 km/h, 2.00 km left');
  });

  it('counts from the reading at the start of the step (the belt counter does not start at 0)', async () => {
    const { runner, calls, setDist } = await started([{ meters: 100, speed: 3 }, { meters: 100, speed: 4 }], 12_345);
    setDist(12_445); runner.tick();
    expect(calls).toEqual(['start', 'speed 3', 'speed 4']);
    setDist(12_500); runner.tick(); // only 55 m in the second step
    expect(calls).toEqual(['start', 'speed 3', 'speed 4']);
  });

  it('a counter reset in the middle of a step neither ends the step early nor makes progress negative', async () => {
    const { runner, calls, setDist } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    setDist(5060); runner.tick();
    setDist(10); runner.tick(); // reset
    expect(calls).toEqual(['start', 'speed 3']);
    setDist(50); runner.tick(); // 60 + 40 = 100
    expect(calls).toEqual(['start', 'speed 3', 'speed 2']);
  });

  it('waits for the first reading when none has arrived yet and counts from there', async () => {
    const { runner, calls, setDist, lastStatus } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }], null);
    expect(lastStatus()).toBe('Step 1/2: 3.0 km/h, 100 m left');
    setDist(700); runner.tick();
    setDist(790); runner.tick();
    expect(calls).toEqual(['start', 'speed 3']);
    setDist(800); runner.tick();
    expect(calls).toEqual(['start', 'speed 3', 'speed 2']);
  });

  it('distance never advances: ends the program after twice the expected time plus 30 s, without touching the belt', async () => {
    const { calls, logs, lastStatus, advance, done } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    // 100 m at 3 km/h = 120 s → limit 270 s
    await advance(269_000);
    expect(calls).toEqual(['start', 'speed 3']);
    await advance(2000);
    expect(calls).toEqual(['start', 'speed 3']);
    expect(lastStatus()).toBe('Distance not advancing, program ended');
    expect(logs.join('\n')).toMatch(/Step 1/);
    await expect(done).resolves.toBe('aborted');
  });

  it('the limit follows the speed the app actually runs at, not the one in the program', async () => {
    const ctx = setup();
    ctx.setDist(0);
    ctx.host.setTarget = vi.fn((kmh: number) => { ctx.calls.push(`speed ${kmh}`); });
    ctx.host.currentTarget = () => 1.5; // capped to the limit
    void ctx.runner.run([{ meters: 100, speed: 6 }]);
    await ctx.advance(4500);
    // 100 m at 1.5 km/h = 240 s → limit 510 s
    await ctx.advance(500_000);
    expect(ctx.runner.active).toBe(true);
    await ctx.advance(20_000);
    expect(ctx.runner.active).toBe(false);
  });

  it('abort during a distance step: no further commands, even if the distance is reached afterwards', async () => {
    const { runner, calls, setDist, advance, done } = await started([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    runner.abort();
    setDist(9999); runner.tick();
    await advance(600_000);
    expect(calls).toEqual(['start', 'speed 3']);
    await expect(done).resolves.toBe('aborted');
  });

  it('a distance step with 0 m is skipped silently', async () => {
    const { calls, logs } = await started([{ meters: 0, speed: 5 }, { sec: 2, speed: 2 }]);
    expect(calls).toEqual(['start', 'speed 2']);
    expect(logs).toEqual([]);
  });

  it('the last step being a distance step: stops the belt when it is done', async () => {
    const { runner, calls, setDist, advance, done } = await started([{ sec: 2, speed: 2 }, { meters: 50, speed: 3 }]);
    await advance(2000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 3']);
    setDist(5050); runner.tick();
    await advance(0);
    expect(calls).toEqual(['start', 'speed 2', 'speed 3', 'stop']);
    await expect(done).resolves.toBe('finished');
  });
});

describe('ProgramRunner: progress (display only)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is null while no program runs, and after it ended', async () => {
    const { runner, advance } = setup();
    expect(runner.progress()).toBeNull();
    const done = runner.run([{ sec: 1, speed: 2 }]);
    await advance(4500 + 1000);
    await done;
    expect(runner.progress()).toBeNull();
  });

  it('is before the first step while the belt starts and during its countdown', async () => {
    const { runner, advance } = setup();
    void runner.run([{ sec: 10, speed: 2 }, { sec: 5, speed: 3 }]);
    expect(runner.progress()).toMatchObject({ phase: 'starting', index: -1, left: null, fraction: 0 });
    await advance(0);
    expect(runner.progress()).toMatchObject({ phase: 'countdown', index: -1, left: null });
    expect(runner.progress()!.steps).toHaveLength(2);
  });

  it('counts the time left in a time step', async () => {
    const { runner, advance } = setup();
    void runner.run([{ sec: 4, speed: 2 }, { sec: 10, speed: 3 }]);
    await advance(4500);
    expect(runner.progress()).toMatchObject({ phase: 'running', index: 0, left: { sec: 4 }, fraction: 0 });
    await advance(1000);
    expect(runner.progress()).toMatchObject({ index: 0, left: { sec: 3 }, fraction: 0.25 });
    await advance(3000);
    expect(runner.progress()).toMatchObject({ index: 1, left: { sec: 10 }, fraction: 0 });
  });

  it('counts the distance left in a distance step', async () => {
    const ctx = setup();
    ctx.setDist(5000);
    void ctx.runner.run([{ meters: 100, speed: 3 }, { sec: 5, speed: 2 }]);
    await ctx.advance(4500);
    expect(ctx.runner.progress()).toMatchObject({ index: 0, left: { meters: 100 }, fraction: 0 });
    ctx.setDist(5025); ctx.runner.tick();
    expect(ctx.runner.progress()).toMatchObject({ index: 0, left: { meters: 75 }, fraction: 0.25 });
  });

  it('never changes what the runner does', async () => {
    const { runner, calls, advance } = setup();
    void runner.run([{ sec: 2, speed: 2 }]);
    await advance(4500);
    const before = [...calls];
    for (let i = 0; i < 5; i++) runner.progress();
    expect(calls).toEqual(before);
  });
});
