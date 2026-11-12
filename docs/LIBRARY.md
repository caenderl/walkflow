# Treadmill library: ftms-treadmill

Status: **all 4 steps done**; the library is in `packages/ftms-treadmill/`, checked on a sPad 500 (2026-11-12,
[HARDWARE-TESTS.md](../HARDWARE-TESTS.md), “Treadmill facade”) and ready to be published as 0.1.0 (see [Packaging](#packaging)).
This describes how the treadmill control moved out of the app into a library of its own with a defined API, so that the app
only draws and the control can be released, versioned and tested on its own. For users of the library:
[its README](../packages/ftms-treadmill/README.md).

## Why

- **One place for what moves the belt.** The safety rules were pure and tested (`core/safety`), but the order of the
  steps around them (ask for control, set the start speed, start; stop urgently and again; end the ramp when the treadmill
  refuses a speed) lived in the app's `ui/live/belt.ts`, `live-data.ts`, `speed-controls.ts` and `connection.ts`. Now it is
  behind an API that the UI cannot get around.
- **A stable version to work against.** The app pins a version of the library that was checked on a real treadmill. A UI
  change cannot change how the belt is driven.
- **Usable by others.** An FTMS treadmill control with a speed limit, a ramp and a reliable stop, for any page or Node program.

## What goes in, what stays

| In the library | Stays in the app |
| --- | --- |
| FTMS parsers and commands (`protocol/ftms.ts`) | Texts and languages (`i18n`), units |
| The facade (`device/treadmill.ts`); Bluetooth client, write queue, timeout (`device/ble.ts`) | Storage of limit, step, presets, disclaimer (the storage keys; `src/core/safety/`) |
| Simulator (`device/sim.ts`) | Workouts, routes, the program runner, history, export |
| Speed limit, ramp, governor, standstill (`safety/safety.ts`) | The disclaimer and the confirmation above 6 km/h |
| Incline range and clamping (`safety/incline.ts`) | Banner, buttons, figures, chart (drawn from the library's state); the banner's fading and timings |
| Belt phase (`safety/belt-phase.ts`) and which buttons may be used (`controlAvailability`) | Speed presets (they end in `setSpeed`) |
| Start, stop, pause and their order (`device/belt-commands.ts`) | Experiment console screen |
| Reading what the treadmill reports (`device/reports.ts`; recording stays in the app) | Wake lock, background, desktop shell |
| The check of raw console commands (`checkConsoleCommand`) | |

The library has **no DOM, no storage, no texts and no network** besides Bluetooth. It knows nothing about workouts or routes:
a program drives it through the same API as a button.

## API

Built in `packages/ftms-treadmill/src/device/treadmill.ts` (`createTreadmill`); the app uses nothing else to drive the belt. Speeds are in km/h,
incline in percent, distances in meters, times in milliseconds.

```ts
import { createTreadmill } from 'ftms-treadmill';
import { WebBluetoothAdapter } from 'ftms-treadmill/web-bluetooth';
import { SimulatorAdapter } from 'ftms-treadmill/sim';

const tm = createTreadmill({
  speedLimit: 6,                  // km/h, never commanded above (the app stores and confirms it)
  limitConfirmed: false,          // needed for a limit above 6 km/h, see "Speed limit above 6 km/h"
  maxStep: 0.5,                   // km/h per command while ramping
});

tm.on('data', d => draw(d));          // speed, distance, incline, energy, time, heart rate
tm.on('notice', n => log(text(n)));   // the app turns codes into its own texts
tm.on('ended', e => runner.abort(e.reason));

const info = await tm.connect(new WebBluetoothAdapter());  // or a SimulatorAdapter; reads the treadmill, asks for control
await tm.start();
tm.setSpeed(3.5);                 // ramps there, held until the belt moves, capped at the limit
tm.setIncline(2);
await tm.stop();                  // always urgent, sent again if it did not go through
tm.disconnect();
```

The adapter is given to `connect`, not to `createTreadmill`: one Treadmill keeps its limits across connections, to a real
treadmill or the demo.

### `createTreadmill(options): Treadmill`

```ts
interface TreadmillOptions {
  speedLimit?: number;            // LIMIT_MIN..LIMIT_MAX, default DEFAULT_SPEED_LIMIT; nonsense is the default
  limitConfirmed?: boolean;       // a person confirmed a limit above LIMIT_CONFIRM_ABOVE; default false
  maxStep?: number;               // MAX_STEP_MIN..MAX_STEP_MAX, default DEFAULT_MAX_STEP
  clock?: Clock;                  // now() and wait(ms); for tests, default real time
}
```

### `Treadmill`

```ts
interface Treadmill {
  connect(adapter: BleAdapter): Promise<ConnectResult>;  // throws if the person cancels or the device has no FTMS
  disconnect(): void;

  start(): Promise<boolean>;               // control, start speed, Start, then the ramp to the last speed asked for; false if refused or overtaken by a stop
  stop(): Promise<boolean>;                // urgent; ends the ramp; false and stopFailed if every attempt failed
  pause(): Promise<boolean>;               // like stop

  setSpeed(kmh: number, opts?: { source?: CommandSource }): number | null;  // the target it will ramp to; null if none allowed or not connected
  changeSpeed(deltaKmh: number, opts?: { source?: CommandSource }): number | null;
  setIncline(pct: number): Promise<boolean>;   // clamped to the device range; false if the treadmill cannot set it

  setLimits(l: { speedLimit?: number; limitConfirmed?: boolean; maxStep?: number }): void;  // lowering takes effect at once
  setProgramActive(active: boolean): void;  // a workout or route runs: Start stays locked; false ends the standstill watch

  /** Experiment console: raw bytes, checked against limit, step and interval first; a raw Start needs confirmed */
  sendRaw(bytes: number[], opts?: { confirmed?: boolean }): Promise<RawResult>;

  readonly state: TreadmillState;          // a fresh snapshot each time it is read
  on<E extends keyof TreadmillEventMap>(event: E, cb: (e: TreadmillEventMap[E]) => void): () => void;
}

interface TreadmillState {
  connected: boolean;
  belt: BeltPhase;                         // the banner draws from this
  controls: { start: boolean; pause: boolean; stop: boolean };   // which buttons may be used now
  maybeRunning: boolean;                   // when in doubt true (beltMaybeRunning)
  lastMeasured: number | undefined;
  target: number | null;                   // where the ramp is going
  lastCommand: { kmh: number; at: number } | null;
  ramping: boolean;
  speedLimit: number;
  limitConfirmed: boolean;
  maxStep: number;
  deviceRange: { min: number; max: number };   // what the treadmill reported (1–12 before it did)
  effectiveMax: number;                    // the device maximum, capped by the limit: never sent above
  inclineRange: Range | null;
  controlLost: boolean;
  stopFailed: boolean;                     // the person has to stop the belt on the treadmill
  programActive: boolean;
}

interface TreadmillEventMap {
  data: TreadmillData;
  heartRate: number;
  machineStatus: { event: MachineEvent | null; hex: string };
  trainingStatus: { hex: string; status: number | null; text: string | null };
  controlResponse: ControlPointResponse;   // every answer of the treadmill, also an OK
  notice: Notice;
  log: string;                             // protocol lines (bytes sent, an answer that could not be read); not for people
  ended: { reason: EndReason };            // the belt was stopped or stopped by itself: a running program ends
  stopFailed: boolean;
  phase: BeltPhase;                        // after a start or stop request and after connecting; state.belt also moves with time
  target: undefined;                       // target, last command or ramp changed
  disconnected: { wasRunning: boolean };
}

type EndReason = 'stop' | 'pause' | 'console' | 'machine-stopped' | 'machine-paused' | 'safety-key' | 'standstill';
type BeltPhase = 'unknown' | 'standing' | 'starting' | 'running' | 'stopping';
/** Who asked for a speed: a running workout or route, or the person (buttons, keys, presets). Default 'manual'. */
type CommandSource = 'program' | 'manual';
type RawResult =
  | { action: 'not-connected' } | { action: 'blocked'; reason: ConsoleBlock }
  | { action: 'needs-confirmation' } | { action: 'sent'; ok: boolean };
```

A listener that throws is reported (as an uncaught error, a moment later) but never gets in the way: a Stop goes out
whatever the display does with its events.

### Belt phase and controls

The library says **what the belt does**, the app decides **how that looks**. `belt-banner.ts` used to do both: it knew that a
start was sent and the treadmill still counts down, and it also computed how strong the green or red is. The first part is
control (the Start button stays locked during the countdown, so nobody starts twice), the second is design. They are split:
`safety/belt-phase.ts` in the library, `ui/live/belt-banner.ts` in the app.

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
that every code has a text, and `tests/architecture.test.ts` checks that the library imports nothing outside its own folder.

The codes are in `packages/ftms-treadmill/src/protocol/notice.ts`:

| Group | Codes |
| --- | --- |
| Connecting | `device`, `device-info`, `not-subscribable`, `features`, `controllable`, `features-unreadable`, `speed-range`, `speed-range-unreadable`, `incline-range`, `incline-range-unreadable`, `heart-rate` |
| Writing | `write-dropped`, `write-failed` (with `no-gatt`, `not-connected`, `write-timeout` or the message of another error) |
| Governor | `no-allowed-speed`, `speed-held-until-moving`, `ramp-aborted` |
| Console (returned by `checkConsoleCommand`) | `console-set-speed-length`, `console-over-limit`, `console-jump`, `console-too-soon`, `console-heart-rate` |
| Start, stop and limits (the facade) | `start-speed-failed`, `speed-refused`, `limit-lowered`, `limit-unconfirmed` (see below) |

The app has four codes of its own in the same style, for the limit it stores and edits (`src/core/safety/limit-settings.ts`:
`limit-not-a-number`, `limit-out-of-range`, `limit-stored-unconfirmed`, `limit-legacy-not-adopted`); the library never sends them.

Control lost and a standstill are not notices: the first is a Machine Status (`machineStatus` event), the second an `ended` reason.

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
3. Before Start the lowest allowed speed is set, so a treadmill does not run up to the speed it last had. After Start the
   speed asked for last (chosen while standing, or the one before a stop or pause) is ramped up to from there, once the
   belt moves.
4. Stop and Pause go out ahead of everything queued, end a Start that is still being sent, ask for control first if it was
   lost, and are sent up to `STOP_ATTEMPTS` times. If none went through, `state.stopFailed` is true.
5. A refused Stop on a moving belt sets `stopFailed`; a refused speed ends the ramp.
6. A write that gets no answer is given up after `WRITE_TIMEOUT_MS`, so it cannot hold back a Stop.
7. When the treadmill stops by itself (button, safety key) or the belt stands still while a speed is wanted (see
   [Standstill](#standstill)), the ramp is forgotten and `ended` is sent.
8. No method throws during a session (only `connect`); a failed command is `false` plus a notice.

## Packaging

- **In this repo**, as the npm workspace `packages/ftms-treadmill`, published to npm as `ftms-treadmill` (free on npm in
  November 2026; taken with the first publish of 0.1.0). ES modules only, no dependencies; built with `tsc` into `dist/`
  (`npm run build -w ftms-treadmill`). Inside the package, imports name their `.ts` files and the build turns them into
  `.js`, so the published files run in Node as they are.
- **Entry points:** `ftms-treadmill` (core, pure, runs in Node), `/web-bluetooth` (the browser adapter), `/sim`
  (simulator), `/protocol` (FTMS parsers and commands for anyone who wants only those). Nothing else is exported.
- **The app uses the sources**, not a build: `tsconfig.json` (paths) and `vite.config.ts` (alias) point the four entry points
  at `packages/ftms-treadmill/src/`. Later the app may pin a published version instead.
- **Rules** (`tests/architecture.test.ts`): the app imports only the entry points, never the library's files; the library
  imports nothing outside its folder and no package; only its Web Bluetooth adapter touches the browser; sharing never
  imports it.
- **Releases:** release-please keeps one release pull request for both packages. The library gets its own version,
  changelog (`packages/ftms-treadmill/CHANGELOG.md`) and tag (`ftms-treadmill-v0.1.0`), from the commits that touch
  `packages/ftms-treadmill/`. Its GitHub release is a draft and marked as a pre-release, so it never counts as the app's
  latest release (the desktop app's update check and the download links on the site look at the latest release).
  Publishing that draft by hand starts `.github/workflows/npm-publish.yml`: tests, a check that the tag matches the
  version, the build, `npm publish` with provenance. No token: npm trusts that workflow (Trusted Publishing, set
  in the package settings on npmjs.com), so there is no secret to expire or leak.
- **The first version:** release-please treats a package without a release as new and would start it at 1.0.0; the
  library's `initial-version` in `release-please-config.json` makes the first release 0.1.0.
- **Version 0.x** until the API has been used for a while; then 1.0.
- A repo of its own only when others use the library and the release flow of two packages in one repo gets in the way.

## Steps

Each step is one PR and leaves the app working.

1. **Codes instead of texts.** *Done.* `ftms.ts`, `ble.ts` and `safety.ts` no longer import `i18n`; the app turns notices
   into texts. No change in behaviour: the log reads as before, in every language.
2. **The `Treadmill` facade, test first.** *Done* (`device/treadmill.ts`, `belt-commands.ts`, `reports.ts`,
   `safety/belt-phase.ts`). Built in the app's `src/device/` from `belt.ts`, `live-data.ts` (without recording and
   drawing), the governor and standstill wiring of `speed-controls.ts` and `connection.ts`, the belt phase and
   `controlAvailability`. The tests of `belt.ts`, `live-data.ts` and the control parts of `belt-banner.ts` move to it, plus
   one test per promise above. What is left of `BeltBanner` (fading, timings) moves to `ui/live/` and draws from `state.belt`.
3. **The UI uses only the facade.** *Done, checked in the demo and on a sPad 500* (HARDWARE-TESTS.md, “Treadmill
   facade”; the test led to two fixes: Start after Stop ramps up to the last speed again, incline only while running). `ui/live/*` and `main.ts` call the API and draw `state`; `Session` and the hosts with governor and banner are gone.
4. **Move into `packages/ftms-treadmill`.** *Done.* Workspace, entry points, build, release-please, the publish workflow,
   architecture rules. What stays in the app stayed in `src/core/safety/`: the storage keys and the stored limit format
   (`limit-settings.ts`), the disclaimer (`disclaimer.ts`), quiet and developer mode, speed presets, incline levels
   (`incline-levels.ts`). Checked: all tests, the app in the demo, and the packed library in a separate Node project.
   Left: publishing 0.1.0 (merge, release pull request, publish the draft; see Packaging).
