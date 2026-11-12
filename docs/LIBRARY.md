# Treadmill library (draft)

Status: **draft, step 1 of 4 done** (see [Steps](#steps)). This describes how the treadmill control could move out of the app into a library of
its own with a defined API, so that the app only draws and the control can be released, versioned and tested on its own.
It comes after the hardware test of the current control (see [HARDWARE-TESTS.md](../HARDWARE-TESTS.md)).

## Why

- **One place for what moves the belt.** Today the safety rules are pure and tested (`core/safety`), but the order of the
  steps around them (ask for control, set the start speed, start; stop urgently and again; end the ramp when the treadmill
  refuses a speed) lives in `ui/live/belt.ts`, `live-data.ts`, `speed-controls.ts` and `connection.ts`. In a library this
  order is behind an API that the UI cannot get around.
- **A stable version to work against.** The app pins a version of the library that was checked on a real treadmill. A UI
  change cannot change how the belt is driven.
- **Usable by others.** An FTMS treadmill control with a speed limit, a ramp and a reliable stop, for any page or Node program.

## What goes in, what stays

| In the library | Stays in the app |
| --- | --- |
| FTMS parsers and commands (`core/protocol/ftms.ts`) | Texts and languages (`i18n`), units |
| Bluetooth client, write queue, timeout (`device/ble.ts`) | Storage of limit, step, presets, disclaimer (the storage keys) |
| Simulator (`device/sim.ts`) | Workouts, routes, the program runner, history, export |
| Speed limit, ramp, governor, standstill (`core/safety/safety.ts`) | The disclaimer and the confirmation above 6 km/h |
| Incline range and clamping (`core/safety/incline.ts`) | Banner, buttons, figures, chart (drawn from the library's state); the banner's fading and timings |
| Belt phase (starting, running, stopping, standing) and which buttons may be used (`controlAvailability`) | Speed presets (they end in `setSpeed`) |
| Start, stop, pause and their order (`ui/live/belt.ts`) | Experiment console screen |
| Reading what the treadmill reports (`ui/live/live-data.ts`, without recording) | Wake lock, background, desktop shell |
| The check of raw console commands (`checkConsoleCommand`) | |

The library has **no DOM, no storage, no texts and no network** besides Bluetooth. It knows nothing about workouts or routes:
a program drives it through the same API as a button.

## API

Names are a proposal. Speeds are in km/h, incline in percent, distances in meters, times in milliseconds.

```ts
import { createTreadmill } from 'ftms-treadmill';
import { webBluetooth } from 'ftms-treadmill/web-bluetooth';
import { simulator } from 'ftms-treadmill/sim';

const tm = createTreadmill({
  adapter: webBluetooth(),        // or simulator()
  speedLimit: 6,                  // km/h, never commanded above (the app stores and confirms it)
  limitConfirmed: false,          // needed for a limit above 6 km/h, see "Speed limit above 6 km/h"
  maxStep: 0.5,                   // km/h per command while ramping
});

const info = await tm.connect();  // name, features, speed and incline range, heart rate yes or no
tm.on('data', m => draw(m));      // speed, distance, incline, energy, time, heart rate
tm.on('state', s => drawBanner(s));
tm.on('notice', n => log(text(n)));   // the app turns codes into its own texts
tm.on('ended', e => runner.abort(e.reason));

await tm.start();
tm.setSpeed(3.5);                 // ramps there, held until the belt moves, capped at the limit
tm.setIncline(2);
await tm.stop();                  // always urgent, sent again if it did not go through
tm.disconnect();
```

### `createTreadmill(options): Treadmill`

```ts
interface TreadmillOptions {
  adapter: BleAdapter;
  speedLimit: number;             // LIMIT_MIN..LIMIT_MAX
  limitConfirmed?: boolean;       // a person confirmed a limit above LIMIT_CONFIRM_ABOVE; default false
  maxStep?: number;               // MAX_STEP_MIN..MAX_STEP_MAX, default DEFAULT_MAX_STEP
  clock?: Clock;                  // now() and wait(ms); for tests, default real time
}
```

### `Treadmill`

```ts
interface Treadmill {
  connect(): Promise<DeviceInfo>;          // throws if the person cancels or the device has no FTMS
  disconnect(): void;

  start(): Promise<boolean>;               // control, start speed, Start; false if refused or overtaken by a stop
  stop(): Promise<boolean>;                // urgent; ends the ramp; false and 'stop-failed' if every attempt failed
  pause(): Promise<boolean>;               // like stop

  setSpeed(kmh: number, opts?: { source?: CommandSource }): number | null;  // the target it will ramp to, null if none allowed
  changeSpeed(deltaKmh: number, opts?: { source?: CommandSource }): number | null;
  setIncline(pct: number): Promise<boolean>;   // clamped to the device range

  setLimits(l: { speedLimit?: number; limitConfirmed?: boolean; maxStep?: number }): void;  // lowering takes effect at once
  setProgramActive(active: boolean): void;  // a workout or route runs: Start stays locked

  readonly state: TreadmillState;
  on<E extends keyof TreadmillEventMap>(event: E, cb: (e: TreadmillEventMap[E]) => void): () => void;

  /** Experiment console: raw bytes, checked against limit, step and interval first; urgent if it is a stop */
  sendRaw(bytes: number[]): RawResult;
}

interface TreadmillState {
  connection: 'disconnected' | 'connecting' | 'connected';
  belt: BeltPhase;                         // the banner draws from this
  controls: { start: boolean; pause: boolean; stop: boolean };   // which buttons may be used now
  maybeRunning: boolean;                   // when in doubt true (beltMaybeRunning)
  target: number | null;                   // where the ramp is going
  lastCommand: { kmh: number; at: number } | null;
  ramping: boolean;
  speedRange: { min: number; max: number } | null;   // device range, already capped at the limit
  inclineRange: Range | null;
  controlLost: boolean;
  stopFailed: boolean;                     // the person has to stop the belt on the treadmill
}

interface TreadmillEventMap {
  data: Measurement;
  heartRate: number;
  state: TreadmillState;
  notice: Notice;
  ended: { reason: EndReason };            // the belt stopped or paused: a running program ends
  disconnected: void;
  log: string;                             // protocol lines (hex, opcodes), for the console; not for people
}

type EndReason = 'stop' | 'pause' | 'machine-stopped' | 'machine-paused' | 'safety-key' | 'standstill';

type BeltPhase = 'unknown' | 'standing' | 'starting' | 'running' | 'stopping';

/** Who asked for a speed: a running workout or route, or the person (buttons, keys, presets). Default 'manual'. */
type CommandSource = 'program' | 'manual';
```

### Belt phase and controls

The library says **what the belt does**, the app decides **how that looks**. Today `core/safety/belt-banner.ts` does both:
it knows that a start was sent and the treadmill still counts down, and it also computes how strong the green or red is.
The first part is control (the Start button stays locked during the countdown, so nobody starts twice), the second is design.
They are split:

| `state.belt` | Means |
| --- | --- |
| `unknown` | connected, nothing reported yet |
| `starting` | Start was sent, the belt does not move yet (until it is measured at 0.3 km/h or more, at most `START_MS`) |
| `running` | the belt moves |
| `stopping` | Stop or Pause was sent, or the treadmill reported a stop, and the belt still moves |
| `standing` | the belt stands (below 0.1 km/h) |

`state.controls` is `controlAvailability` of today: Start is locked while the belt may be running, a start is under way or a
program runs; Pause is there while the belt may be running; **Stop is there whenever the treadmill is connected**, and
nothing in the library takes it away. The app's buttons follow `controls` and add nothing of their own.

The banner in the app follows `state.belt` and keeps its own look: the fading green, the red that gets stronger as the belt
slows down, how long it stays after the belt stands, and its texts. A change to the banner is an app change, not a library
release; the API knows no opacity.

`program` in the availability (Start locked while a program runs) is told by the app, which owns programs:
`tm.setProgramActive(active: boolean)`.

### Standstill

The library watches for a belt that stands still while a speed is wanted (only 0 km/h for 8 seconds, e.g. stopped with the
remote or the safety key without a Machine Status). Then it forgets the ramp, so nothing starts the belt again, and sends
`ended` with `standstill`.

The API only says **where a speed came from** (`source`), never whether the standstill is watched: that is the library's
decision and can change without a new API. In 0.x it does what the app does today and watches only speeds with
`source: 'program'`. Watching every speed while the belt should run is planned as a `safety` change of its own after that,
tested on a real treadmill; the app does not have to change for it.

### Notices instead of texts

The library knows no language. What it finds or what goes wrong it sends as a code with its values, and the app has one
function that turns each code into text in every language (`ui/live/treadmill-text.ts`, `noticeText`). TypeScript checks
that every code has a text, and `tests/architecture.test.ts` checks that no part of the library imports `i18n`.

Today's codes are in `src/core/protocol/notice.ts`:

| Group | Codes |
| --- | --- |
| Connecting | `device`, `device-info`, `not-subscribable`, `features`, `controllable`, `features-unreadable`, `speed-range`, `speed-range-unreadable`, `incline-range`, `incline-range-unreadable`, `heart-rate` |
| Writing | `write-dropped`, `write-failed` (with `no-gatt`, `not-connected`, `write-timeout` or the message of another error) |
| Governor | `no-allowed-speed`, `speed-held-until-moving`, `ramp-aborted` |
| Limit (returned by `decideLimitChange`, `loadLimit`) | `limit-not-a-number`, `limit-out-of-range`, `limit-stored-unconfirmed`, `limit-legacy-not-adopted` |
| Console (returned by `checkConsoleCommand`) | `console-set-speed-length`, `console-over-limit`, `console-jump`, `console-too-soon`, `console-heart-rate` |

The facade adds what is told by the app's live parts today: `speed-refused`, `start-speed-failed`, `limit-lowered`,
`limit-unconfirmed` (see below), `control-lost`, `standstill`.

An error the library throws (only `connect` does) is a `TreadmillError` with one of the codes above. Machine Status and
Control Point answers stay what the protocol says (`MachineEvent`, `ControlPointResponse`); the app describes them in its
language. The `log` event carries protocol lines only (bytes sent, an answer that could not be read).

### Speed limit above 6 km/h

A limit above `LIMIT_CONFIRM_ABOVE` (6 km/h) only counts when a person said yes to it. The app asks (the dialog with the
risk) and stores the yes with the value, as it does today. The library does not ask anybody, but it insists on being told:
`speedLimit` above 6 km/h without `limitConfirmed: true` (in `createTreadmill` or `setLimits`) is not taken. The library
uses 6 km/h instead and sends `{ code: 'limit-unconfirmed', requested, applied }`, so the app can say so.

This is not a lock: whoever uses the library can write `true`. It makes the step explicit, so that it shows in the code and
in a review and cannot happen by mistake (a broken stored value, a typo, a slider out of range). The flag is in the API from
the start because adding it later would break every caller; loosening it later would not.

`limitConfirmed` belongs to the value it was given with: `setLimits({ speedLimit: 8 })` without the flag is again 6 km/h.
Lowering the limit never needs it.

## What the library promises

These are the safety rules of today, written as the library's contract. Each one has a test in the library, and a change to
one of them is a `safety` commit and at least a minor version.

1. Nothing above `speedLimit` (or the device maximum, whichever is lower) is ever sent, also not through `sendRaw`.
   A `speedLimit` above 6 km/h counts only with `limitConfirmed: true`, otherwise it is 6 km/h.
2. The speed changes by at most `maxStep` per command and not more often than every `RAMP_INTERVAL_MS`.
3. Before Start the lowest allowed speed is set, so a treadmill does not run up to the speed it last had.
4. Stop and Pause go out ahead of everything queued, end a Start that is still being sent, ask for control first if it was
   lost, and are sent up to `STOP_ATTEMPTS` times. If none went through, `state.stopFailed` is true.
5. A refused Stop on a moving belt sets `stopFailed`; a refused speed ends the ramp.
6. A write that gets no answer is given up after `WRITE_TIMEOUT_MS`, so it cannot hold back a Stop.
7. When the treadmill stops by itself (button, safety key) or the belt stands still while a speed is wanted (see
   [Standstill](#standstill)), the ramp is forgotten and `ended` is sent.
8. No method throws during a session (only `connect`); a failed command is `false` plus a notice.

## Packaging

- **In this repo first**, as an npm workspace `packages/ftms-treadmill`, published to npm as `ftms-treadmill` (free on npm
  in November 2026; taken with the first publish of 0.1.0, not before). release-please handles both packages; the library
  gets its own changelog and tags (`ftms-treadmill-v0.1.0`).
- **Entry points:** `ftms-treadmill` (core, pure, runs in Node), `/web-bluetooth` (the browser adapter), `/sim`
  (simulator), `/protocol` (FTMS parsers and commands for anyone who wants only those).
- **Version 0.x** until the API has been used for a while and the hardware test passed with it; then 1.0.
- The app uses the workspace while the API settles and later pins a published version.
- `tests/architecture.test.ts` gets a rule: the app imports only the library's entry points, never its files.
- A repo of its own only when others use the library and the release flow of two packages in one repo gets in the way.

## Steps

Each step is one PR and leaves the app working.

1. **Codes instead of texts.** *Done.* `ftms.ts`, `ble.ts` and `safety.ts` no longer import `i18n`; the app turns notices
   into texts. No change in behaviour: the log reads as before, in every language.
2. **The `Treadmill` facade, test first.** Built in `src/device/` from `belt.ts`, `live-data.ts` (without recording and
   drawing), the governor and standstill wiring of `speed-controls.ts` and `connection.ts`, the belt phase and
   `controlAvailability`. The tests of `belt.ts`, `live-data.ts` and the control parts of `belt-banner.ts` move to it, plus
   one test per promise above. What is left of `BeltBanner` (fading, timings) moves to `ui/live/` and draws from `state.belt`.
3. **The UI uses only the facade.** `ui/live/*` and `main.ts` call the API and draw `state`; `Session` and the hosts with
   governor and banner go away. Checked in the demo, then on the real treadmill (HARDWARE-TESTS.md).
4. **Move into `packages/ftms-treadmill`.** Workspace, entry points, build, release-please, architecture rule. What stays in
   the app leaves `core/safety` on the way: the storage keys and the stored limit format, the disclaimer, quiet and
   developer mode, speed presets. Publish 0.1.0.
