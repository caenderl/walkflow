import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beltMaybeRunning, checkConsoleCommand, clampSpeed, decideLimitChange, DEFAULT_MAX_STEP, DEFAULT_SPEED_LIMIT,
  DISCLAIMER_VERSION, effectiveMax, isDisclaimerAccepted, loadLimit, parseHexBytes, parseLimit, parseMaxStep,
  planRamp, RAMP_INTERVAL_MS, serializeLimit, SpeedGovernor, StandstillDetector, type ConsoleContext,
} from './safety';
import { setLanguage } from './i18n';

describe('speed limit (existing behaviour)', () => {
  it('default limit is 6 km/h', () => {
    expect(DEFAULT_SPEED_LIMIT).toBe(6);
  });

  it('effective maximum is the smaller of device max and personal limit', () => {
    expect(effectiveMax(12, 6)).toBe(6);
    expect(effectiveMax(5, 6)).toBe(5);
  });

  it('parseLimit falls back to 6 on invalid input', () => {
    expect(parseLimit('4.5')).toBe(4.5);
    expect(parseLimit('')).toBe(6);
    expect(parseLimit('abc')).toBe(6);
    expect(parseLimit('0')).toBe(6);
  });
});

describe('clampSpeed', () => {
  const range = { min: 1, max: 6 };

  it('clamps at the top and bottom', () => {
    expect(clampSpeed(9, range)).toBe(6);
    expect(clampSpeed(0.2, range)).toBe(1);
  });

  it('rounds to 0.1 km/h', () => {
    expect(clampSpeed(3.04, range)).toBe(3);
    expect(clampSpeed(3.06, range)).toBe(3.1);
  });

  it('rounding never goes above the maximum', () => {
    expect(clampSpeed(9, { min: 1, max: 5.97 })).toBe(5.9);
  });

  it('never returns a value above the maximum, even if the limit is below the device minimum', () => {
    expect(clampSpeed(3, { min: 1.5, max: 1 })).toBeNull();
  });

  it('NaN and infinity → null', () => {
    expect(clampSpeed(Number.NaN, range)).toBeNull();
    expect(clampSpeed(Number.POSITIVE_INFINITY, range)).toBeNull();
  });
});

describe('changing the limit', () => {
  it('values up to 6 km/h without confirmation', () => {
    expect(decideLimitChange('5.5', 6)).toEqual({ ok: true, value: 5.5, needsConfirmation: false });
    expect(decideLimitChange('6', 4)).toEqual({ ok: true, value: 6, needsConfirmation: false });
  });

  it('values above 6 km/h need a confirmation if they raise the limit', () => {
    expect(decideLimitChange('6.5', 6)).toEqual({ ok: true, value: 6.5, needsConfirmation: true });
    expect(decideLimitChange('8', 7)).toEqual({ ok: true, value: 8, needsConfirmation: true });
  });

  it('lowering never needs a confirmation', () => {
    expect(decideLimitChange('7', 8)).toEqual({ ok: true, value: 7, needsConfirmation: false });
  });

  it('invalid or nonsensical values are rejected', () => {
    expect(decideLimitChange('', 6).ok).toBe(false);
    expect(decideLimitChange('abc', 6).ok).toBe(false);
    expect(decideLimitChange('0.5', 6).ok).toBe(false);
    expect(decideLimitChange('25', 6).ok).toBe(false);
  });

  it('rounds to 0.1 km/h', () => {
    expect(decideLimitChange('4.56', 6)).toMatchObject({ value: 4.6 });
  });
});

describe('stored limit', () => {
  it('no stored value: 6 km/h', () => {
    expect(loadLimit(null, null)).toEqual({ value: 6 });
  });

  it('confirmed values above 6 are kept', () => {
    expect(loadLimit(serializeLimit(8, true), null)).toEqual({ value: 8 });
  });

  it('unconfirmed values above 6 are not adopted', () => {
    expect(loadLimit(serializeLimit(8, false), null).value).toBe(6);
    expect(loadLimit('{"value":9}', null).value).toBe(6);
  });

  it('the prototype value "cap" is adopted up to 6 km/h, not above', () => {
    expect(loadLimit(null, '5')).toEqual({ value: 5 });
    const r = loadLimit(null, '9');
    expect(r.value).toBe(6);
    expect(r.note).toMatch(/not adopted/);
  });

  it('broken or nonsensical values → 6 km/h', () => {
    expect(loadLimit('{broken', null).value).toBe(6);
    expect(loadLimit(serializeLimit(50, true), null).value).toBe(6);
    expect(loadLimit(null, 'abc').value).toBe(6);
  });
});

describe('maximum change per command', () => {
  it('default 0.5 km/h, allowed 0.1 to 1.0', () => {
    expect(DEFAULT_MAX_STEP).toBe(0.5);
    expect(parseMaxStep('0.3')).toBe(0.3);
    expect(parseMaxStep('0,2')).toBe(0.2);
    expect(parseMaxStep('0.05')).toBeNull();
    expect(parseMaxStep('1.5')).toBeNull();
    expect(parseMaxStep('x')).toBeNull();
  });
});

describe('planRamp', () => {
  const range = { min: 1, max: 6 };

  it('approaches large jumps in steps', () => {
    expect(planRamp(2, 5, 0.5, range)).toEqual([2.5, 3, 3.5, 4, 4.5, 5]);
    expect(planRamp(5, 2, 0.5, range)).toEqual([4.5, 4, 3.5, 3, 2.5, 2]);
  });

  it('small changes in one step', () => {
    expect(planRamp(2, 2.3, 0.5, range)).toEqual([2.3]);
    expect(planRamp(2, 2.5, 0.5, range)).toEqual([2.5]);
  });

  it('no step if already at the target', () => {
    expect(planRamp(3, 3, 0.5, range)).toEqual([]);
  });

  it('clamps the target to the range', () => {
    expect(planRamp(5, 9, 0.5, range)).toEqual([5.5, 6]);
  });

  it('from standstill: the first step is the device minimum', () => {
    expect(planRamp(0, 2, 0.5, range)).toEqual([1, 1.5, 2]);
  });

  it('odd start value: no step larger than maxStep', () => {
    expect(planRamp(2.05, 3, 0.3, range)).toEqual([2.3, 2.6, 2.9, 3]);
  });

  it('small steps despite floating point errors', () => {
    expect(planRamp(0.7, 1, 0.1, { min: 0.5, max: 6 })).toEqual([0.8, 0.9, 1]);
  });

  it('never a command above the limit, not even when slowing down from above', () => {
    expect(planRamp(6, 4, 0.5, { min: 1, max: 4 })).toEqual([4]);
  });

  it('no allowed value → no steps', () => {
    expect(planRamp(2, 3, 0.5, { min: 2, max: 1 })).toEqual([]);
  });

  it('invariants for random inputs', () => {
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2000; i++) {
      const r = { min: 0.5 + rnd(), max: 3 + rnd() * 10 };
      const step = Math.round((0.1 + rnd() * 0.9) * 10) / 10;
      const from = rnd() * 14;
      const to = rnd() * 14;
      const plan = planRamp(from, to, step, r);
      const target = clampSpeed(to, r)!;
      if (plan.length) expect(plan.at(-1)).toBeCloseTo(target, 9);
      let prev = from;
      plan.forEach((v, k) => {
        expect(v).toBeLessThanOrEqual(r.max + 1e-9);
        expect(v).toBeGreaterThanOrEqual(r.min - 1e-9);
        const firstFromOutside = k === 0 && (from < r.min || from > r.max);
        if (!firstFromOutside) expect(Math.abs(v - prev)).toBeLessThanOrEqual(step + 1e-9);
        prev = v;
      });
    }
  });
});

describe('SpeedGovernor', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  function make(opts: { fail?: (kmh: number) => boolean } = {}) {
    const sent: [number, number][] = [];
    const logs: string[] = [];
    const gov = new SpeedGovernor({
      send: async kmh => { sent.push([Date.now(), kmh]); return !opts.fail?.(kmh); },
      now: () => Date.now(),
      log: m => logs.push(m),
    });
    gov.setRange({ min: 1, max: 6 });
    return { gov, sent, logs };
  }

  it('minimum interval is 1.5 s', () => {
    expect(RAMP_INTERVAL_MS).toBe(1500);
  });

  it('a small change goes out immediately', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    expect(gov.request(2.5)).toBe(2.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([[0, 2.5]]);
  });

  it('a large jump is approached in steps 1.5 s apart', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3], [3000, 3.5], [4500, 4]]);
    expect(gov.ramping).toBe(false);
  });

  it('fast +0.5 clicks do not turn into a jump', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(2.5);
    await vi.advanceTimersByTimeAsync(100);
    gov.request(3);
    await vi.advanceTimersByTimeAsync(100);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3], [3000, 3.5]]);
  });

  it('never two commands closer than 1.5 s, even across separate requests', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(3);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(1000);
    gov.request(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([[0, 3.5], [1500, 3]]);
  });

  it('caps targets to the limit', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(5.5);
    expect(gov.request(9)).toBe(6);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([[0, 6]]);
  });

  it('no allowed value → null, nothing sent', async () => {
    const { gov, sent, logs } = make();
    gov.setRange({ min: 2, max: 1 });
    expect(gov.request(3)).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([]);
    expect(logs.join()).toMatch(/No allowed speed/);
  });

  it('cancel stops the ramp immediately', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(5);
    await vi.advanceTimersByTimeAsync(2000);
    gov.cancel();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3]]);
    expect(gov.target).toBeNull();
    expect(gov.ramping).toBe(false);
  });

  it('a write error aborts the ramp', async () => {
    const { gov, sent, logs } = make({ fail: kmh => kmh === 3 });
    gov.noteMeasured(2);
    gov.request(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3]]);
    expect(gov.target).toBeNull();
    expect(logs.join()).toMatch(/Ramp aborted/);
  });

  it('from standstill, the ramp starts at the device minimum', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(0);
    gov.request(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([1, 1.5, 2]);
  });

  it('without a measured value and without a last command: the base is the device minimum', async () => {
    const { gov, sent } = make();
    gov.request(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([1.5, 2]);
  });

  it('the base is the last command while the belt is still settling', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(2.5);
    await vi.advanceTimersByTimeAsync(2000);
    gov.noteMeasured(2.1); // the belt has not reached 2.5 yet
    gov.request(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.map(s => s[1])).toEqual([2.5, 3]);
  });

  it('the base is the measured value if the belt runs clearly differently (e.g. changed with the remote)', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(2.5);
    await vi.advanceTimersByTimeAsync(10_000);
    gov.noteMeasured(4); // someone set 4 on the treadmill
    gov.request(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([2.5, 4.5, 5]);
  });

  it('lowering the limit below the last command actively regulates to the new limit', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(5);
    gov.request(5);
    await vi.advanceTimersByTimeAsync(10_000);
    gov.setRange({ min: 1, max: 4 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([5, 4]);
    expect(gov.target).toBe(4);
  });

  it('lowering the limit during a ramp caps the target', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(6);
    await vi.advanceTimersByTimeAsync(1600);
    gov.setRange({ min: 1, max: 3.5 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent.map(s => s[1])).toEqual([2.5, 3, 3.5]);
  });

  it('reset forgets the last command (after stop/disconnect)', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(3);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(100);
    gov.reset();
    expect(gov.lastCommand).toBeNull();
    gov.request(2);
    await vi.advanceTimersByTimeAsync(10_000);
    // after reset: no minimum interval reference any more, base = device minimum
    expect(sent.map(s => s[1])).toEqual([3.5, 1.5, 2]);
  });

  it('an external command (console) counts as base and for the minimum interval', async () => {
    const { gov, sent } = make();
    gov.noteExternalCommand(3);
    expect(gov.msSinceLastCommand()).toBe(0);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([[1500, 3.5]]);
  });

  it('maxStep is configurable', async () => {
    const { gov, sent } = make();
    gov.maxStep = 1;
    gov.noteMeasured(2);
    gov.request(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([3, 4]);
  });
});

describe('experiment console', () => {
  const ctx: ConsoleContext = { maxKmh: 6, maxStep: 0.5, baseKmh: 3, msSinceLastSpeedCommand: 10_000 };
  const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

  it('parses hex bytes with spaces or commas', () => {
    expect(parseHexBytes('02 2C 01')).toEqual([0x02, 0x2c, 0x01]);
    expect(parseHexBytes(' 08,01 ')).toEqual([0x08, 0x01]);
  });

  it('rejects anything that is not a clean hex byte', () => {
    expect(parseHexBytes('')).toBeNull();
    expect(parseHexBytes('zz')).toBeNull();
    expect(parseHexBytes('100')).toBeNull();
    expect(parseHexBytes('2z')).toBeNull(); // parseInt would return 2 here
  });

  it('blocks Set Speed above the limit', () => {
    const c = { ...ctx, baseKmh: 5.8 };
    expect(checkConsoleCommand([0x02, ...le16(600)], c)).toEqual({ action: 'send', setSpeed: 6 });
    expect(checkConsoleCommand([0x02, ...le16(601)], c).action).toBe('block');
  });

  it('blocks Set Speed with the wrong length', () => {
    expect(checkConsoleCommand([0x02, 0x2c], ctx).action).toBe('block');
    expect(checkConsoleCommand([0x02, 0x2c, 0x01, 0x00], ctx).action).toBe('block');
  });

  it('blocks Set Speed jumps above the maximum change', () => {
    expect(checkConsoleCommand([0x02, ...le16(350)], ctx).action).toBe('send');
    expect(checkConsoleCommand([0x02, ...le16(360)], ctx).action).toBe('block');
    expect(checkConsoleCommand([0x02, ...le16(240)], ctx).action).toBe('block');
  });

  it('blocks Set Speed within the minimum interval', () => {
    expect(checkConsoleCommand([0x02, ...le16(320)], { ...ctx, msSinceLastSpeedCommand: 1000 }).action).toBe('block');
  });

  it('start only with confirmation', () => {
    expect(checkConsoleCommand([0x07], ctx)).toEqual({ action: 'confirm-start' });
  });

  it('blocks Set Target Heart Rate (the treadmill would control the speed itself)', () => {
    expect(checkConsoleCommand([0x06, 120], ctx).action).toBe('block');
  });

  it('lets other commands through raw', () => {
    expect(checkConsoleCommand([0x08, 0x01], ctx)).toEqual({ action: 'send' });
    expect(checkConsoleCommand([0x03, 0x32, 0x00], ctx)).toEqual({ action: 'send' });
    expect(checkConsoleCommand([0x00], ctx)).toEqual({ action: 'send' });
  });

  it('the language changes only the reason text, not the decision', () => {
    const cmd = [0x02, ...le16(601)];
    const en = checkConsoleCommand(cmd, { ...ctx, baseKmh: 5.8 });
    setLanguage('fr');
    const fr = checkConsoleCommand(cmd, { ...ctx, baseKmh: 5.8 });
    setLanguage('en');
    expect(en).toEqual({ action: 'block', reason: '6.01 km/h is above the limit (6), blocked' });
    expect(fr).toEqual({ action: 'block', reason: '6,01 km/h dépasse la limite (6), bloqué' });
  });
});

describe('belt may be running', () => {
  it('after a start by the app', () => {
    expect(beltMaybeRunning({ startedByApp: true, lastMeasuredKmh: undefined })).toBe(true);
  });

  it('if the last measured value was > 0, no matter how old', () => {
    expect(beltMaybeRunning({ startedByApp: false, lastMeasuredKmh: 1.2 })).toBe(true);
  });

  it('only if both say otherwise: no', () => {
    expect(beltMaybeRunning({ startedByApp: false, lastMeasuredKmh: 0 })).toBe(false);
    expect(beltMaybeRunning({ startedByApp: false, lastMeasuredKmh: undefined })).toBe(false);
  });
});

describe('StandstillDetector', () => {
  it('reports standstill after 8 s at 0 km/h once armed', () => {
    const d = new StandstillDetector();
    d.arm();
    expect(d.feed(0, 0)).toBe(false);
    expect(d.feed(0, 7999)).toBe(false);
    expect(d.feed(0, 8000)).toBe(true);
    expect(d.feed(0, 9000)).toBe(false); // only once
  });

  it('movement resets the counter', () => {
    const d = new StandstillDetector();
    d.arm();
    d.feed(0, 0);
    d.feed(1, 5000);
    expect(d.feed(0, 9000)).toBe(false);
    expect(d.feed(0, 17_000)).toBe(true);
  });

  it('calling arm() again (next program step) does not reset the counter', () => {
    const d = new StandstillDetector();
    d.arm();
    d.feed(0, 0);
    d.arm();
    expect(d.feed(0, 8000)).toBe(true);
  });

  it('not armed → never', () => {
    const d = new StandstillDetector();
    expect(d.feed(0, 0)).toBe(false);
    expect(d.feed(0, 60_000)).toBe(false);
  });
});

describe('first-run notice', () => {
  it('only counts for the current version', () => {
    expect(isDisclaimerAccepted(String(DISCLAIMER_VERSION))).toBe(true);
    expect(isDisclaimerAccepted(String(DISCLAIMER_VERSION - 1))).toBe(false);
    expect(isDisclaimerAccepted(null)).toBe(false);
    expect(isDisclaimerAccepted('yes')).toBe(false);
  });
});
