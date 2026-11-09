import { describe, expect, it, vi } from 'vitest';
import type { TreadmillClient } from '../../device/ble';
import type { BeltBanner } from '../../core/safety/belt-banner';
import type { SpeedGovernor, StandstillDetector } from '../../core/safety/safety';
import { hex } from '../../core/protocol/ftms';
import { setupBelt } from './belt';
import { Session } from './session';

/** Everything the belt touches, in the order it happens */
function rig(opts: { ok?: boolean | ((hexBytes: string) => boolean); client?: boolean; startSpeedOk?: boolean } = {}) {
  const calls: string[] = [];
  const session = new Session();
  if (opts.client !== false) {
    session.client = {
      connected: true,
      send: vi.fn(async (bytes: Uint8Array, o?: { urgent?: boolean }) => {
        const h = hex(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        calls.push(`send ${h}${o?.urgent ? ' urgent' : ''}`);
        return typeof opts.ok === 'function' ? opts.ok(h) : (opts.ok ?? true);
      }),
    } as unknown as TreadmillClient;
  }
  const banner = {
    stopRequested: vi.fn(() => calls.push('banner stop')),
    startRequested: vi.fn(() => calls.push('banner start')),
  } as unknown as BeltBanner;
  const governor = {
    reset: vi.fn(() => calls.push('governor reset')),
    startSpeed: vi.fn(async () => { calls.push('governor startSpeed'); return opts.startSpeedOk ?? true; }),
  } as unknown as SpeedGovernor;
  const standstill = { disarm: vi.fn(() => calls.push('standstill disarm')) } as unknown as StandstillDetector;
  const abortRun = vi.fn(() => calls.push('abort run'));
  const log = vi.fn((m: string) => calls.push(`log ${m}`));
  const belt = setupBelt({ session, banner, governor, standstill, now: () => 1234, abortRun, log });
  return { belt, session, calls, banner, abortRun, governor, log };
}

describe('stop', () => {
  it('ends the program, forgets the ramp and then sends Stop urgently', async () => {
    const r = rig();
    r.session.beltStarted = true;
    expect(await r.belt.stop()).toBe(true);
    expect(r.calls).toEqual(['banner stop', 'abort run', 'governor reset', 'standstill disarm', 'send 08 01 urgent']);
    expect(r.session.beltStarted).toBe(false);
  });

  it('passes the reason on to the program', async () => {
    const r = rig();
    const reason = () => 'because';
    await r.belt.stop(reason);
    expect(r.abortRun).toHaveBeenCalledWith(reason);
  });

  it('does all of that even without a connection, and says it could not send', async () => {
    const r = rig({ client: false });
    expect(await r.belt.stop()).toBe(false);
    expect(r.calls).toEqual(['banner stop', 'abort run', 'governor reset', 'standstill disarm']);
  });

  it('keeps "started" if the treadmill did not take the command', async () => {
    const r = rig({ ok: false });
    r.session.beltStarted = true;
    expect(await r.belt.stop()).toBe(false);
    expect(r.session.beltStarted).toBe(true);
  });

  it('asks for control again first when control was lost, without waiting for it', async () => {
    const r = rig();
    r.session.controlLost = true;
    r.session.beltStarted = true;
    await r.belt.stop();
    expect(r.calls.filter(c => c.startsWith('send'))).toEqual(['send 00 urgent', 'send 08 01']);
    expect(r.session.beltStarted).toBe(false);
  });
});

describe('pause', () => {
  it('ends the program and sends Pause urgently', async () => {
    const r = rig();
    r.session.beltStarted = true;
    expect(await r.belt.pause()).toBe(true);
    expect(r.calls).toEqual(['banner stop', 'abort run', 'governor reset', 'standstill disarm', 'send 08 02 urgent']);
    expect(r.session.beltStarted).toBe(false);
  });

  it('does nothing more than the housekeeping without a connection', async () => {
    const r = rig({ client: false });
    expect(await r.belt.pause()).toBe(false);
    expect(r.calls).toEqual(['banner stop', 'abort run', 'governor reset', 'standstill disarm']);
  });
});

describe('start', () => {
  it('takes control, sets the lowest speed and only then starts, and tells the banner', async () => {
    const r = rig();
    expect(await r.belt.start()).toBe(true);
    expect(r.calls).toEqual(['governor reset', 'standstill disarm', 'send 00', 'governor startSpeed', 'send 07', 'banner start']);
    expect(r.session.beltStarted).toBe(true);
  });

  it('if the treadmill does not take the starting speed, it still starts, but says so in the log', async () => {
    const r = rig({ startSpeedOk: false });
    expect(await r.belt.start()).toBe(true);
    expect(r.calls).toContain('send 07');
    expect(r.log).toHaveBeenCalledTimes(1);
    expect(r.session.beltStarted).toBe(true);
  });

  it('does not log anything when the starting speed was set', async () => {
    const r = rig();
    await r.belt.start();
    expect(r.log).not.toHaveBeenCalled();
  });

  it('does not end a program: the program is what starts the belt', async () => {
    const r = rig();
    await r.belt.start();
    expect(r.abortRun).not.toHaveBeenCalled();
  });

  it('forgets that control was lost once the request went through', async () => {
    const r = rig();
    r.session.controlLost = true;
    await r.belt.start();
    expect(r.session.controlLost).toBe(false);
  });

  it('keeps "control lost" if the request failed, and still tries to start', async () => {
    const r = rig({ ok: h => h !== '00' });
    r.session.controlLost = true;
    expect(await r.belt.start()).toBe(false);
    expect(r.session.controlLost).toBe(true);
    expect(r.calls).toContain('send 07');
    expect(r.calls).toContain('governor startSpeed');
  });

  it('does not mark the belt as started or show the banner if Start failed', async () => {
    const r = rig({ ok: h => h !== '07' });
    expect(await r.belt.start()).toBe(false);
    expect(r.session.beltStarted).toBe(false);
    expect(r.banner.startRequested).not.toHaveBeenCalled();
  });

  it('sends nothing without a connection', async () => {
    const r = rig({ client: false });
    expect(await r.belt.start()).toBe(false);
    expect(r.calls).toEqual([]);
  });
});
