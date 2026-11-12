# Architecture

Walkflow is a vanilla TypeScript app (no framework) that runs in the browser as a PWA and in Electron as a desktop app.
The code is split into **layers**. A layer may only use the layers below it, and the lower ones know nothing about the
browser. That keeps the logic that matters (above all what limits and stops the belt) testable without a browser, and
the UI replaceable. Everything that drives the treadmill is a library of its own in `packages/ftms-treadmill/`
([LIBRARY.md](LIBRARY.md)); the app uses it like any npm package.

## The layers

```
src/
  main.ts             wires everything together (the only place that knows all parts)
  i18n/               texts per language, language choice, units (km/h or mph)
  core/               pure logic: no DOM, no storage, no network
    safety/             the app's side of safety: the stored limit and step (format, confirmation above 6 km/h), the
                        disclaimer, quiet and developer mode, speed presets, incline levels
    training/           workouts, the program runner, step panel logic, what the training view is about
    routes/             routes, GPX, route packages, the texts of a route, countries, map settings
    store/              the route store: its index (strict reading, entries from package files, filter) and the check of a download
    share/              the share code and the messages and rules of an exchange with another device
    history/            runs, statistics, CSV/TCX export
    id.ts               ids of things the person creates
  platform/           pure helpers around the shell: build settings, features that are on or off, version, the logic of the desktop update (two yeses, never while connected), CSP, MIME types, dev server address, opened files
  net/                the connection to other people's devices for sharing (not there yet, see docs/P2P.md); never the treadmill
  data/               IndexedDB storage (workouts, routes, runs)
  ui/                 everything that draws or listens
    components/         reusable parts: dialogs, the "⋯" menu, the speed chart, element builders (el, button, iconButton)
    settings/           settings dialog, header menus
    live/               the training view's live parts: what the treadmill reports as the app shows it (live-data), the
                        texts for its codes (treadmill-text), the figures and banner (readout, belt-banner), connecting and
                        disconnecting, the buttons and keys, the speed controls and the stored limits, incline card, stage
                        (chosen workout or route, and starting it), experiment console. They only ask the Treadmill and draw.
    routes/ workouts/ history/ community/ settings/   one folder per feature view (history also has the export buttons)
    background.ts       wake lock, tab in the background, leaving the page
    desktop.ts pwa.ts theme.ts views.ts i18n-dom.ts   integration of the page
    ui.ts store.ts      DOM lookups, log and download; the storage wrapper that never throws
electron/             main process and preload of the desktop app
tests/                tests about the project itself

packages/ftms-treadmill/src/   the treadmill library, published to npm as ftms-treadmill
  index.ts            the core entry point: createTreadmill, types, limits (pure, runs in Node)
  web-bluetooth.ts sim.ts protocol.ts   the other entry points
  protocol/           FTMS parsers and commands, the notice codes
  safety/             speed limit, ramp (governor), standstill, belt phase, which buttons may be used, incline range
  device/             the Treadmill facade (treadmill.ts), the belt commands and their order, reading the treadmill's reports,
                      the Bluetooth client and write queue, the Web Bluetooth adapter, the simulator
```

| Layer | May import from |
| --- | --- |
| `i18n`, `platform` | itself |
| `core` | `i18n` |
| `net` | `core`, `i18n`, `platform` (never `ui`, and nothing of `ftms-treadmill`) |
| `data` | `core` |
| `ui` | `core`, `i18n`, `data`, `platform`, `net` |
| `electron/` | pure code of `src/` only: `i18n`, `platform`, `core` |

`main.ts` may import from everything. Every layer may use the core of the treadmill library (`ftms-treadmill`, pure);
only `ui` and `main.ts` choose the Web Bluetooth adapter (`ftms-treadmill/web-bluetooth`). The library itself imports
nothing from `src/`.

## Rules (checked by `tests/architecture.test.ts`)

1. **Layers only look downwards** (the table above). A new import that points up fails the test.
2. **The pure layers (`i18n`, `core`, `platform`) know nothing about the browser**: no `document`, `window`, `localStorage`,
   `indexedDB`, `navigator`. Code that needs them belongs in `ui` or `data`.
3. **No import cycles at runtime.** A type-only import (`import type`) does not count, so two modules may describe each
   other's types; they may not call each other.
4. **Every source file lives in a layer folder**; at the top of `src/` only `main.ts`, `env.d.ts` and `style.css` stay.
5. **A test sits next to the code it tests** (`foo.ts`, `foo.test.ts`).
6. **The desktop main process uses only pure code** of `src/`.
7. **The treadmill library stands on its own** (`packages/ftms-treadmill/src/`): it imports nothing outside its folder and
   no package (its tests use `vitest`), so it has no texts: it speaks in codes (`Notice`), and `ui/live/treadmill-text.ts`
   turns them into text. Only its Web Bluetooth adapter touches the browser.
8. **The app uses the library only through its entry points** (`ftms-treadmill`, `/web-bluetooth`, `/sim`, `/protocol`),
   never its files. In this repository they resolve to the sources (`tsconfig.json` paths, the alias in `vite.config.ts`).
9. **Sharing never reaches the belt**: nothing that `net/` or `core/share/` runs imports `ftms-treadmill`.

## Principles

- **Safety first, and testable.** Whatever limits or stops the belt lives in the treadmill library, as pure functions and a
  facade tested for the order of its steps, and its test is written before the code. The banner, the button state and the quiet or developer mode never take anything
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
| something that drives or reads the treadmill | `packages/ftms-treadmill/src/` (and its API in [LIBRARY.md](LIBRARY.md)) |
| a part of the page for a feature | `ui/<feature>/` |
| a part that several features use | `ui/components/` |
| a text for people | `i18n/locales/en.ts`, `de.ts`, `fr.ts`, `uk.ts` |
| a helper for the build or the desktop shell, without the browser | `platform/` |

## Known debt (small, on purpose not done in one go)

- `src/main.ts` (about 250 lines) only creates the parts and wires them together. Everything that drives the belt is behind
  the Treadmill facade of `ftms-treadmill`; `ui/live/` only asks it and draws.
- `ui/routes/route-ui.ts` (about 355 lines) still holds the library list, the card in the training view and the map switch;
  `ui/workouts/workout-ui.ts` (about 270 lines) the library and the editor. The week plan, the step row, the elevation
  profile, the import, the library upkeep, the route details and the route editor are their own modules. What is left in
  both files is mostly the list and its state, which is what they are for.
