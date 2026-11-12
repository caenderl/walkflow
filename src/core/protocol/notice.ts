// What the treadmill side (protocol, Bluetooth client, safety rules) tells the app, as codes with their values instead of
// sentences. These parts become a library of their own (docs/LIBRARY.md) and know no language: the app turns each code into
// text (ui/live/treadmill-text.ts), and TypeScript checks that every code has one.

import type { Range } from './ftms';

/** Why talking to the treadmill failed */
export type TreadmillErrorCode = 'no-gatt' | 'not-connected' | 'write-timeout';

/** An error of the treadmill connection that the app can name in its own language */
export class TreadmillError extends Error {
  constructor(readonly code: TreadmillErrorCode) {
    super(code);
    this.name = 'TreadmillError';
  }
}

/** Why a new speed limit was not taken (decideLimitChange) */
export type LimitProblem =
  | { code: 'limit-not-a-number' }
  | { code: 'limit-out-of-range'; min: number; max: number };

/** Why a stored limit was not taken as it was (loadLimit) */
export type LimitNote =
  | { code: 'limit-stored-unconfirmed'; value: number; applied: number }
  | { code: 'limit-legacy-not-adopted'; value: number; above: number };

/** Why the experiment console did not send a command (checkConsoleCommand) */
export type ConsoleBlock =
  | { code: 'console-set-speed-length' }
  | { code: 'console-over-limit'; kmh: number; max: number }
  | { code: 'console-jump'; from: number; to: number; maxStep: number }
  | { code: 'console-too-soon'; intervalMs: number }
  | { code: 'console-heart-rate' };

export type Notice =
  // Connecting (device/ble.ts)
  | { code: 'device'; name: string | undefined }
  | { code: 'device-info'; field: 'manufacturer' | 'model' | 'firmware'; value: string }
  | { code: 'not-subscribable'; uuid: number }
  | { code: 'features'; names: string[] }
  | { code: 'controllable'; names: string[] }
  | { code: 'features-unreadable' }
  | { code: 'speed-range'; range: Range }
  | { code: 'speed-range-unreadable' }
  | { code: 'incline-range'; range: Range }
  | { code: 'incline-range-unreadable' }
  | { code: 'heart-rate'; available: boolean }
  // Writing to the Control Point
  | { code: 'write-dropped'; bytes: string }
  | { code: 'write-failed'; error: TreadmillErrorCode | { message: string } }
  // The speed governor
  | { code: 'no-allowed-speed'; min: number; max: number }
  | { code: 'speed-held-until-moving'; kmh: number }
  | { code: 'ramp-aborted' }
  | LimitProblem
  | LimitNote
  | ConsoleBlock;
