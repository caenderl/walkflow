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
- Not yet tested individually: incline, heart rate, transitions in the interval program, reconnecting, behaviour of the belt on connection loss.

Other FTMS treadmills may work but are not tested.

## Features

- Connect/disconnect, start/pause/stop, speed via slider, presets and ±0.5, incline
- Interval program (lines of `minutes km/h`)
- Live values, chart of the last 5 minutes, export as CSV and TCX (Strava, Garmin Connect & co.)
- Log of sent/received bytes and an experiment console for the Control Point
- Demo mode with a simulated treadmill, no hardware needed
- Works offline and can be installed (PWA)
- English, German and French; picked from the browser languages, switchable at the top right, or via `?lang=de|en|fr` in the URL

### Safety features

- Personal speed limit (default 6 km/h); higher values only after an extra confirmation. Every input path (slider, presets, ±, arrow keys, program, console) is capped to it. When the limit is lowered, the app actively regulates down.
- Ramp: at most 0.5 km/h per command (configurable 0.1–1.0) and at least 1.5 s between two speed commands. Larger jumps are approached in steps.
- Start only after a confirmation. Space or Esc stops immediately; stop and pause take priority over all other commands. Bluetooth writes never run in parallel.
- A running program ends on connection loss, when the treadmill reports “stopped” or “safety key”, or when it reports 0 km/h for 8 s.
- Permanent notice that the app cannot stop the belt on connection loss; a large warning if the connection drops while the belt is probably running. “Disconnect” offers to stop first while the belt is running.
- Background tabs: warning in the tab title, optionally pause the belt; programs run by timestamps instead of (throttled) timers.

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
| `npm test` | Vitest (FTMS parser, safety logic, program runner, simulator, export, translations) |
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
| `src/program.ts` | Interval program: parser and timestamp-based runner |
| `src/sim.ts` | Simulated FTMS treadmill (demo mode, tests) |
| `src/export.ts` | CSV and TCX |
| `src/i18n.ts`, `src/i18n-dom.ts`, `src/locales/` | Language selection, texts per language, binding to the HTML |
| `src/main.ts`, `ui.ts`, `chart.ts`, `dialogs.ts` | Thin UI layer, vanilla TS |
| `src/desktop.ts` | Renderer side of the Electron integration |
| `electron/` | Main process and preload |
| `public/legal/<lang>/` | Legal notice and privacy pages per language (placeholders) |

A second BLE path (e.g. native) only implements `BleAdapter`/`BleDevice` from `src/ble.ts`.

### Translations

All texts live in `src/locales/en.ts`, `de.ts` and `fr.ts`. `en.ts` defines the structure; TypeScript and `src/i18n.test.ts` check that every language has every text and that every `data-i18n` key in `index.html` exists. Safety texts must keep the same meaning and strength in every language.

Adding a language: copy `src/locales/en.ts`, translate it, register it in `src/i18n.ts` (`LANGS`, `MESSAGES`), add legal pages under `public/legal/<lang>/` and, for the macOS Bluetooth prompt, `build/lproj/<lang>.lproj/InfoPlist.strings`.

The FTMS terms in the log (`Set Speed`, `Request Control` …) stay English in every language. CSV column names are English too, as they are part of the file format.

## Publishing

### GitHub Pages

1. Repository settings → *Pages* → Source: **GitHub Actions**. (For a private repository, Pages needs a paid GitHub plan.)
2. Fill in the pages under `public/legal/` (legal notice and privacy, per language). As long as they contain `TODO`, the Pages workflow fails on purpose. If you only want legal pages in one language, delete the others and point `info.imprintHref`/`info.privacyHref` in the locale files to the remaining ones.
3. Optional: set the repository variable `DONATION_URL` (see below).
4. Deploy by hand: *Actions → Pages → Run workflow*. To deploy on every push to `main`, re-enable the commented-out `push` trigger in `.github/workflows/pages.yml`.

### Desktop release

1. Bump the version in `package.json` and commit.
2. Push the tag `v<version>`, e.g. `git tag v0.1.0 && git push origin v0.1.0`.
3. The release workflow builds macOS (arm64, x64), Windows and Linux and creates a **draft release** with checksums. Publish it by hand.

### Signing and notarization (later)

Prepared in `electron-builder.config.cjs`: once the secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set as environment variables in the release workflow, the app is signed with a Developer ID, Hardened Runtime is enabled and it is notarized. Without them, macOS is signed ad hoc (needed so Apple Silicon Macs start the app at all).

## Support

<!-- Placeholder: only add a link once provider and terms are settled. -->
Voluntary support, nothing in return: *(link to follow)*

There is no entitlement to support and no feature depends on support.

## License

[MIT](LICENSE)
