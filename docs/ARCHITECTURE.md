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
    routes/             routes, GPX, route packages, example routes, countries, map settings
    history/            runs, statistics, CSV/TCX export
    id.ts               ids of things the person creates
  platform/           pure helpers around the shell: build settings, version, CSP, MIME types, dev server address, opened files
  device/             the treadmill: Web Bluetooth adapter, simulator
  data/               IndexedDB storage (workouts, routes, runs)
  ui/                 everything that draws or listens
    components/         reusable parts: dialogs, the "⋯" menu, the speed chart
    settings/           settings dialog, header menus
    routes/ workouts/ history/   one folder per feature view
    desktop.ts pwa.ts theme.ts views.ts i18n-dom.ts ui.ts   integration and helpers of the page
electron/             main process and preload of the desktop app
tests/                tests about the project itself
```

| Layer | May import from |
| --- | --- |
| `i18n`, `platform` | itself |
| `core` | `i18n` |
| `device` | `core`, `i18n` |
| `data` | `core` |
| `ui` | `core`, `i18n`, `device`, `data`, `platform` |
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
- **Text for people lives in `i18n/locales`**, in all three languages; code builds sentences from those functions.
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
| a text for people | `i18n/locales/en.ts`, `de.ts`, `fr.ts` |
| a helper for the build or the desktop shell, without the browser | `platform/` |

## Known debt (small, on purpose not done in one go)

- `src/main.ts` is large: it holds the app state (connection, live values, program) and many handlers. It should be split into
  modules per concern (connection, training view, controls) that main only wires together.
- `ui/ui.ts` mixes DOM helpers (`el`, `button`), the storage wrapper (`store`) and the log. The storage wrapper belongs in
  its own module.
- `ui/routes/route-ui.ts` and `ui/workouts/workout-ui.ts` are long; their editors can become components.
