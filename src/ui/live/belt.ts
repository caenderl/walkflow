// The commands that start, pause and stop the belt, and what has to happen around each of them: the program ends, the
// governor forgets its ramp, the standstill detection is switched off, the banner and the session state follow.
// No DOM here on purpose, so the order of these steps can be tested. Stop and Pause go out urgently, ahead of anything queued.

import { cmdPause, cmdRequestControl, cmdStart, cmdStop } from '../../core/protocol/ftms';
import type { BeltBanner } from '../../core/safety/belt-banner';
import type { SpeedGovernor, StandstillDetector } from '../../core/safety/safety';
import { t, type Text } from '../../i18n/i18n';
import type { Session } from './session';

export interface BeltHost {
  session: Session;
  banner: BeltBanner;
  governor: SpeedGovernor;
  standstill: StandstillDetector;
  now(): number;
  /** A running workout or route ends, with the reason shown as its end */
  abortRun(reason: Text): void;
}

export function setupBelt(host: BeltHost) {
  const { session, banner, governor, standstill } = host;

  /** The belt stops (or pauses) on purpose: nothing may keep it going, and standing still is expected from now on */
  function leaveRunning(reason: Text) {
    banner.stopRequested(host.now());
    host.abortRun(reason);
    governor.reset();
    standstill.disarm();
  }

  async function stop(reason: Text = () => t.stop.stopped): Promise<boolean> {
    leaveRunning(reason);
    const c = session.client;
    if (!c) return false;
    let ok: boolean;
    if (session.controlLost) {
      void c.send(cmdRequestControl(), { urgent: true });
      ok = await c.send(cmdStop());
    } else {
      ok = await c.send(cmdStop(), { urgent: true });
    }
    if (ok) session.beltStarted = false;
    return ok;
  }

  async function pause(reason: Text = () => t.stop.paused): Promise<boolean> {
    leaveRunning(reason);
    const c = session.client;
    if (!c) return false;
    const ok = await c.send(cmdPause(), { urgent: true });
    if (ok) session.beltStarted = false;
    return ok;
  }

  async function start(): Promise<boolean> {
    const c = session.client;
    if (!c) return false;
    governor.reset();
    standstill.disarm();
    const a = await c.send(cmdRequestControl());
    if (a) session.controlLost = false;
    const b = await c.send(cmdStart());
    if (b) { session.beltStarted = true; banner.startRequested(host.now()); }
    return a && b;
  }

  return { start, stop, pause };
}
