// What is known about the connected treadmill and the person on it, shared by the parts of the training view that read or
// change it: the connection, the live figures, the stop/pause/start commands, the stage and the experiment console.
// Plain state, no DOM; everything that is drawn or sent is done by the modules that hold this object.

import type { TreadmillClient } from '../../device/ble';
import type { Sample } from '../../core/history/export';
import { beltMaybeRunning } from '../../core/safety/safety';

export class Session {
  client: TreadmillClient | null = null;
  /** Started by the app or according to Machine Status, and not stopped since */
  beltStarted = false;
  lastMeasured: number | undefined;
  /** When the speed was last reported (performance.now), to tell a fresh reading from an old one */
  lastMeasuredAt = 0;
  /** The treadmill said that control was lost; the next stop asks for control first */
  controlLost = false;
  /** Latest measured values */
  readonly cur: Omit<Sample, 'ts'> = {};
  /** Recording since the page was opened (1 Hz), for the chart and export */
  readonly samples: Sample[] = [];

  connected(): boolean { return !!this.client?.connected; }

  /** When in doubt the belt is running (beltMaybeRunning) */
  maybeRunning(): boolean {
    return beltMaybeRunning({ startedByApp: this.beltStarted, lastMeasuredKmh: this.lastMeasured });
  }

  /** Sends a command to the treadmill; false if there is no client or it failed */
  send(bytes: Uint8Array, opts?: { urgent?: boolean }): Promise<boolean> {
    return this.client ? this.client.send(bytes, opts) : Promise.resolve(false);
  }

  /** A new connection or a lost one: nothing is known about the belt */
  forgetBelt() {
    this.beltStarted = false;
    this.lastMeasured = undefined;
    this.controlLost = false;
  }
}
