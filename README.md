# Walkflow

Open-source control for treadmills with Bluetooth FTMS (Fitness Machine Service), right in the browser via Web Bluetooth or as a desktop app. No account, no server, no tracking. The app is available in English, German and French.

> [!WARNING]
> **Safety and liability notice.** Use at your own risk. The software is provided without warranty (see the [MIT license](LICENSE)).
>
> - Insert the treadmill’s safety key and attach it to your clothing.
> - Only start the belt while you are standing on the side rails.
> - **If the Bluetooth connection drops, the app cannot stop the belt.** Then only the stop button on the treadmill or the safety key will help.
> - Stop immediately if you feel unwell and seek medical advice.
> - Displayed values come from the device or are estimates and may be wrong.

Walkflow is an independent project and is not affiliated with the manufacturer of the treadmill or of the Bluetooth module.

## Tested with

Sportstech sPad 500, BLE module FITHOME JJ-BT2-DL (HW 2.0, FW 1.023).

- Tried: connecting, start/pause/stop, setting the speed, live data.
- Not yet tested individually: incline, heart rate, transitions in workouts (time and distance steps), reconnecting, behaviour of the belt on connection loss.

Other FTMS treadmills may work but are not tested.

## Features

- Connect/disconnect, start/pause/stop, speed via slider, presets and ±0.5, incline
- Connecting, language and theme live in small menus in the header: click the connection status, or the settings button at the top right
- Workouts: a saved list of steps, each ending after a time or after a distance (the treadmill’s own distance counter), with a speed. Editor with examples, library, import/export as text (`5 min 4.0`, `400 m 3.5`), and a week plan (minutes per weekday) that is ticked off from the history. Incline is not part of workouts yet (untested on the target hardware).
- Routes: import a GPX file (track or route, with or without elevations), keep it in a library, export it again. The route card in the training view shows where on the route you are (“0.9 of 5.2 km”), the elevation and the slope of the next 100 m, with an elevation profile. Progress follows the treadmill’s own distance counter. “Walk this route” starts it as a workout (one distance step over the whole route at a speed you enter, with the usual ramp, limit and confirmation); the route’s elevation never changes speed or incline. The card shows how long the route takes at that speed and whether it reaches today’s goal, and the history shows which workout or route a run was. No map yet.
- Live values, chart of the last 5 minutes, export as CSV and TCX (Strava, Garmin Connect & co.)
- History: runs are saved automatically on the device. Totals per week and month, distance per week, days in a row, records, a chart per run, CSV/TCX per run, backup and restore as a JSON file. Saving can be turned off; demo runs are listed but not counted.
- Log of sent/received bytes and an experiment console for the Control Point
- Demo mode with a simulated treadmill, no hardware needed
- Works offline and can be installed (PWA)
- English, German and French; picked from the browser languages, switchable in the settings menu at the top right, or via `?lang=de|en|fr` in the URL
- Dark and light theme, or following the system (default); switchable in the settings menu at the top right

### Safety features

- Personal speed limit (default 6 km/h); higher values only after an extra confirmation. Every input path (slider, presets, ±, arrow keys, program, console) is capped to it. When the limit is lowered, the app actively regulates down.
- Ramp: at most 0.5 km/h per command (configurable 0.1–1.0) and at least 1.5 s between two speed commands. Larger jumps are approached in steps.
- Start only after a confirmation. Space or Esc stops immediately; stop and pause take priority over all other commands. Bluetooth writes never run in parallel.
- A running program ends on connection loss, when the treadmill reports “stopped” or “safety key”, or when it reports 0 km/h for 8 s.
- Permanent notice that the app cannot stop the belt on connection loss; a large warning if the connection drops while the belt is probably running. “Disconnect” offers to stop first while the belt is running.
- Background tabs: warning in the tab title, optionally pause the belt; programs run by timestamps instead of (throttled) timers.
- The full controls are shown in the training view. In every other view a stop bar with Stop appears while a treadmill is connected; it sits above the header and its menus, so nothing covers it. Saving runs never throws into the control path and runs asynchronously, so it cannot delay a stop.

## Web version

Web Bluetooth is available in Chrome (desktop, Android), Edge and Opera. Safari and Firefox do not have it; on iPhone/iPad no browser has it (workaround: browsers with their own Bluetooth bridge such as Bluefy, not tested). On Linux, depending on the version, it has to be enabled in Chrome via `chrome://flags` first.

After the first deploy the web version runs at `https://<github-user>.github.io/<repo>/`. Links can set the language, e.g. `…/?lang=fr`.

## Desktop app

Downloads are on the **Releases** page. The app is not signed, so the system warns when you open it for the first time:

- **macOS (Sequoia and later):** open the app and choose “Done” at the warning. Then open *System Settings → Privacy & Security*, scroll down and click **“Open Anyway”** next to Walkflow. macOS asks for Bluetooth permission on the first connect.
- **Windows:** at “Windows protected your PC”, click *More info → Run anyway*.
- **Linux:** `chmod +x Walkflow-*.AppImage` and start it. Web Bluetooth on Linux is untested.

On startup the desktop app asks GitHub whether there is a newer version and shows a notice if so. It does not update itself. The check can be turned off in the info section.

In addition to the web version: its own device chooser with optional automatic selection of the last connected device, a global stop shortcut **Cmd/Ctrl + Shift + Space** (only while connected, also when the window is in the background), and display sleep is prevented while connected. Menus, dialogs and the macOS Bluetooth prompt follow the app language.

## Development

Requires Node.js 24.

```bash
npm ci
```

```bash
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm test` | Vitest (FTMS parser, safety logic, program runner, simulator, export, runs and statistics, translations) |
| `npm run typecheck` | TypeScript strict for app, config and Electron |
| `npm run build` | Web build to `dist/` (with service worker) |
| `npm run electron` | Build the desktop variant and start Electron |
| `npm run dist` | Installer for the current system in `release/` |
| `npm run icons` | Regenerate the icons (`scripts/make-icons.mjs`) |

Without a treadmill: click “Demo (no treadmill)”. The simulator speaks real FTMS bytes and can simulate a connection loss and the safety key.

### Structure

| File | Contents |
| --- | --- |
| `src/ftms.ts` | FTMS protocol as pure functions: parsers, commands, features/ranges, status |
| `src/ble.ts` | `BleAdapter` interface, `WebBluetoothAdapter`, serial write queue, connection sequence |
| `src/safety.ts` | Limits, ramp (`SpeedGovernor`), console checks, standstill detection |
| `src/program.ts` | Workout steps (time or distance): text format and the runner (time steps by timestamps, distance steps by the treadmill’s counter) |
| `src/routes.ts`, `src/gpx.ts`, `src/route-store.ts`, `src/route-ui.ts` | Routes: validation, route maths and progress tracker, GPX reading (tag scanner, no DTD) and writing, IndexedDB storage, routes view and route card |
| `src/workouts.ts`, `src/workout-store.ts`, `src/workout-ui.ts`, `src/db.ts` | Saved workouts and week plan: validation, IndexedDB storage (shared database with the runs), workouts view |
| `src/sim.ts` | Simulated FTMS treadmill (demo mode, tests) |
| `src/export.ts` | CSV and TCX |
| `src/runs.ts` | Runs: detection from the live samples, compact storage form, backup file |
| `src/stats.ts` | Totals, weeks, streaks, records |
| `src/run-store.ts` | IndexedDB storage of the runs (in memory if the browser does not allow it) |
| `src/views.ts`, `src/history.ts` | View switch via the URL hash, where Stop is shown per view, history view |
| `src/menus.ts` | Header menus (connection, language and theme) |
| `src/i18n.ts`, `src/i18n-dom.ts`, `src/locales/` | Language selection, texts per language, binding to the HTML |
| `src/theme.ts`, `src/style.css` | Theme choice; all colours are tokens in `style.css` |
| `src/main.ts`, `ui.ts`, `chart.ts`, `dialogs.ts` | Thin UI layer, vanilla TS |
| `src/desktop.ts` | Renderer side of the Electron integration |
| `electron/` | Main process and preload |
| `public/legal/<lang>/` | Legal notice and privacy pages per language (placeholders) |

A second BLE path (e.g. native) only implements `BleAdapter`/`BleDevice` from `src/ble.ts`.

### Translations

All texts live in `src/locales/en.ts`, `de.ts` and `fr.ts`. `en.ts` defines the structure; TypeScript and `src/i18n.test.ts` check that every language has every text and that every `data-i18n` key in `index.html` exists. Safety texts must keep the same meaning and strength in every language.

Adding a language: copy `src/locales/en.ts`, translate it, register it in `src/i18n.ts` (`LANGS`, `MESSAGES`), add legal pages under `public/legal/<lang>/` and, for the macOS Bluetooth prompt, `build/lproj/<lang>.lproj/InfoPlist.strings`.

The FTMS terms in the log (`Set Speed`, `Request Control` …) stay English in every language. CSV column names are English too, as they are part of the file format.

### Themes

Every colour is a token at the top of `src/style.css`, defined once as `light-dark(light, dark)`. The theme only sets `color-scheme` (`data-theme` on `<html>`; none = follow the system), so form controls and scrollbars follow too. The chart reads the same tokens; the legal pages use a copy in `public/legal/legal.css`. `src/theme.test.ts` checks that every token used is defined and that the main text and control colours reach WCAG contrast (4.5:1 for text, 3:1 for controls) in both themes. Alarm and stop stay strong red in both. A third theme (e.g. high contrast) would override the tokens under `:root[data-theme="…"]`.

## Publishing

### GitHub Pages

1. Repository settings → *Pages* → Source: **GitHub Actions**. (For a private repository, Pages needs a paid GitHub plan.)
2. Fill in the pages under `public/legal/` (legal notice and privacy, per language). As long as they contain `TODO`, the Pages workflow fails on purpose. If you only want legal pages in one language, delete the others and point `info.imprintHref`/`info.privacyHref` in the locale files to the remaining ones.
3. Optional: set the repository variable `DONATION_URL` (see below).
4. Deploy by hand: *Actions → Pages → Run workflow*. To deploy on every push to `main`, re-enable the commented-out `push` trigger in `.github/workflows/pages.yml`.

### Versions and releases

Versions follow [Semantic Versioning](https://semver.org/). Before 1.0, new features raise the minor version and fixes the patch version; changes that old versions cannot handle (e.g. a backup format they cannot read) also raise only the minor version until 1.0, the major version after that.

Commit titles follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(history): weekly totals` or `fix(ble): retry Request Control`.

| Type | Use | Changelog | Version |
| --- | --- | --- | --- |
| `safety` | Changes to safety behaviour (limit, ramp, stop, warnings) | “Safety”, at the top | patch |
| `feat` | New feature | “Features” | minor |
| `fix` | Bug fix | “Fixes” | patch |
| `perf`, `revert` | Performance, reverted change | own section | patch |
| `docs`, `refactor`, `test`, `build`, `ci`, `style`, `chore` | Everything else | not listed | none on their own |

A breaking change is marked with `!` (`feat!: …`) or a `BREAKING CHANGE:` footer.

Releasing ([release-please](https://github.com/googleapis/release-please), config in `release-please-config.json`, last released version in `.release-please-manifest.json`):

1. On every push to `main`, release-please keeps a pull request “chore: release x.y.z” up to date with the next version (in `package.json`) and `CHANGELOG.md`. It is created with the workflow token, so no CI run shows on it; CI runs on `main` after merging.
2. Merging it creates the tag `vx.y.z` and a **draft release** with the changelog. The desktop app for macOS (arm64, x64), Windows and Linux is built and attached with checksums.
3. Check the changed areas on the treadmill (`HARDWARE-TESTS.md`), then publish the draft by hand. Only published releases reach the update notice of the desktop app.

One-time setup: *Settings → Actions → General → Workflow permissions →* “Allow GitHub Actions to create and approve pull requests”. Without it, release-please cannot open its pull request.

The first `feat` or `fix` after setting this up leads to version 0.1.0. A release by hand still works: set the version in `package.json` and `.release-please-manifest.json`, commit, push the tag `v<version>`.

### Signing and notarization (later)

Prepared in `electron-builder.config.cjs`: once the secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set as environment variables in the release workflow, the app is signed with a Developer ID, Hardened Runtime is enabled and it is notarized. Without them, macOS is signed ad hoc (needed so Apple Silicon Macs start the app at all).

## Support

<!-- Placeholder: only add a link once provider and terms are settled. -->
Voluntary support, nothing in return: *(link to follow)*

There is no entitlement to support and no feature depends on support.

## License

[MIT](LICENSE)
