# Architecture

Walkflow is a vanilla TypeScript app (no framework) that runs in the browser as a PWA and in Electron as a desktop app.
The code is split into **layers**. A layer may only use the layers below it, and the lower ones know nothing about the
browser. That keeps the logic that matters (above all what limits and stops the belt) testable without a browser, and
the UI replaceable.

## The layers

```
src/
  main.ts             wires everything together (the only place that knows all parts)
  i18n/               texts per language, language choice, units (km/h or mph)
  core/               pure logic: no DOM, no storage, no network
    protocol/           FTMS: parsers and commands
    safety/             speed limit and ramp, standstill, incline rules, banner and button state, modes
    training/           workouts, the program runner, step panel logic, what the training view is about
    routes/             routes, GPX, route packages, the texts of a route, countries, map settings
    store/              the route store: its index (strict reading, entries from package files, filter) and the check of a download
    share/              the share code and the messages and rules of an exchange with another device
    history/            runs, statistics, CSV/TCX export
    id.ts               ids of things the person creates
  platform/           pure helpers around the shell: build settings, features that are on or off, version, the logic of the desktop update (two yeses, never while connected), CSP, MIME types, dev server address, opened files
  device/             the treadmill: Web Bluetooth adapter, simulator
  net/                the connection to other people's devices for sharing (not there yet, see docs/P2P.md); never the treadmill
  data/               IndexedDB storage (workouts, routes, runs)
  ui/                 everything that draws or listens
    components/         reusable parts: dialogs, the "⋯" menu, the speed chart, element builders (el, button, iconButton)
    settings/           settings dialog, header menus
    live/               the training view's live parts: session state, the belt commands (start, pause, stop), what the treadmill
                        reports (live-data), the figures and banner (readout), connecting and disconnecting, the buttons and
                        keys, speed and limits (owns the governor), incline card, stage (chosen workout or route, and
                        starting it), experiment console
    routes/ workouts/ history/ community/ settings/   one folder per feature view (history also has the export buttons)
    background.ts       wake lock, tab in the background, leaving the page
    desktop.ts pwa.ts theme.ts views.ts i18n-dom.ts   integration of the page
    ui.ts store.ts      DOM lookups, log and download; the storage wrapper that never throws
electron/             main process and preload of the desktop app
tests/                tests about the project itself
```

| Layer | May import from |
| --- | --- |
| `i18n`, `platform` | itself |
| `core` | `i18n` |
| `device` | `core`, `i18n` |
| `net` | `core`, `i18n`, `platform` (never `device`, `ui`, or the FTMS commands) |
| `data` | `core` |
| `ui` | `core`, `i18n`, `device`, `data`, `platform`, `net` |
| `electron/` | pure code of `src/` only: `i18n`, `platform`, `core` |

`main.ts` may import from everything.

## Rules (checked by `tests/architecture.test.ts`)

1. **Layers only look downwards** (the table above). A new import that points up fails the test.
2. **The pure layers (`i18n`, `core`, `platform`) know nothing about the browser**: no `document`, `window`, `localStorage`,
   `indexedDB`, `navigator`. Code that needs them belongs in `ui`, `data` or `device`.
3. **No import cycles at runtime.** A type-only import (`import type`) does not count, so two modules may describe each
   other's types; they may not call each other.
4. **Every source file lives in a layer folder**; at the top of `src/` only `main.ts`, `env.d.ts` and `style.css` stay.
5. **A test sits next to the code it tests** (`foo.ts`, `foo.test.ts`).
6. **The desktop main process uses only pure code** of `src/`.

## Principles

- **Safety first, and testable.** Whatever limits or stops the belt lives in `core/safety` as pure functions, and its
  test is written before the code. The banner, the button state and the quiet or developer mode never take anything
  away from Stop.
- **Pure core, thin edges.** Decisions are pure functions that take values and return values (`controlAvailability`,
  `BeltBanner`, `readPackage`). The UI only reads them and draws. That is why a feature is mostly tests plus a little glue.
- **Check everything that comes from outside** (files, packages, backups, the treadmill) in one place with a `read…`
  function that returns a valid value or nothing, and never trust what was stored.
- **Display never gets in the way of control.** Code that only draws is wrapped so that an error in it cannot reach a
  stop path.
- **Text for people lives in `i18n/locales`**, in every language of the app; code builds sentences from those functions.
- **Small modules with one job.** If a file needs a section comment to say what comes next, it is two files.
- **No framework without a conversation.** Components are plain functions that build or update DOM
  (`ui/components/`, e.g. `overflowMenu`, `iconButton`, `confirmDialog`).

## Where does new code go?

| You are adding … | Put it in … |
| --- | --- |
| a rule, a calculation, a parser, a state machine | `core/<domain>/` with a test next to it |
| something that talks to the browser's storage | `data/` |
| something that talks to Bluetooth | `device/` |
| a part of the page for a feature | `ui/<feature>/` |
| a part that several features use | `ui/components/` |
| a text for people | `i18n/locales/en.ts`, `de.ts`, `fr.ts`, `uk.ts` |
| a helper for the build or the desktop shell, without the browser | `platform/` |

## Known debt (small, on purpose not done in one go)

- `src/main.ts` (about 255 lines) only creates the parts and wires them together. The treadmill session is split by job:
  `ui/live/belt.ts` (start, pause, stop), `live-data.ts` (what the treadmill reports), `readout.ts` (figures, banner, buttons,
  chart), `connection.ts` (connect, disconnect, header status) and `controls.ts` (buttons and keys). `belt.ts` and
  `live-data.ts` have no DOM and are tested for the order of their steps (a stop ends the program, forgets the ramp and goes
  out urgently); the rest is display and was checked by hand in the demo; the real treadmill still has to confirm the split (HARDWARE-TESTS.md).
- `ui/routes/route-ui.ts` (about 355 lines) still holds the library list, the card in the training view and the map switch;
  `ui/workouts/workout-ui.ts` (about 270 lines) the library and the editor. The week plan, the step row, the elevation
  profile, the import, the library upkeep, the route details and the route editor are their own modules. What is left in
  both files is mostly the list and its state, which is what they are for.
