# Walkflow

Open-source control for treadmills with Bluetooth FTMS (Fitness Machine Service), right in the browser via Web Bluetooth or as a desktop app. No account, no server, no tracking. The app is available in English, German, French and Ukrainian.

**[Product page](https://walkflow-app.github.io/)** · **[Web app](https://walkflow-app.github.io/app/)** · **[Downloads](https://github.com/walkflow-app/walkflow/releases/latest)** · **[Route store](https://github.com/walkflow-app/route-store)**

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

- Connect/disconnect, start/pause/stop (Start waits while the belt moves or a program runs, Pause is there while the belt may be running, Stop is always available while connected), speed via slider, presets and ±0.5, incline
- Incline: the treadmill is asked whether it accepts an incline (FTMS features and its supported range). If it does not, the incline card, the incline figure and the incline fields of the workout editor are not shown (the editor hides them once a real treadmill has said so). If it does, the incline is set from buttons for level 0 up to the highest level you set in Settings → Treadmill → Incline levels (none, or 2 to 10; 5 gives the buttons 0 to 5, spread evenly from the lowest to the highest incline the treadmill reports; the percent of each level will be configurable later). With “none” the training view shows nothing about the incline: no card, no figure. The value sent is always held inside the range the treadmill reported.
- Connecting, language and theme live in small menus in the header: click the connection status, or the settings button at the top right
- Workouts: a saved list of steps, each ending after a time or after a distance (the treadmill’s own distance counter), with a speed. Editor with examples, library, import/export as text (`5 min 4.0`, `400 m 3.5`), and a week plan (minutes per weekday) that is ticked off from the history. A step can carry an optional incline (`incl 2`), which is saved and shown but not sent to the treadmill yet (untested on the target hardware). Each weekday of the plan can suggest a workout or route; the training view offers today’s suggestion, and the day is still done by minutes.
- Units: metric (km, km/h, m) or imperial (mi, mph, ft), chosen in the settings and kept in the browser. It only changes what is shown and typed (also in the workout editor and its text format, where `mi` and `ft` work next to `m` and `km`). Everything stored, sent to the treadmill and checked stays km/h and metres: the limit of 6 km/h, the step of 0.5 km/h per command, saved runs and the exports (CSV, TCX, GPX). In mph the limit field takes mph and rounds it to 0.1 km/h; the default limit is 3.73 mph, and a limit above 6 km/h (3.8 mph and up) asks for the same confirmation as before. The experiment console and the Bluetooth log stay in km/h on purpose, so they can be compared with the protocol.
- Training view: it is about one thing, a workout or a route chosen with “Use” (the Walkflow icon on a route) in the Workouts or Routes view, or nothing (free training: you set the speed). Start starts what is chosen. The main element is the steps of the workout (target speed, time left, strip of all steps, next steps), the map of the route when the map is on, or otherwise the speed chart. Views: Training, Workouts, Routes, History.
- Settings: one large dialog (language, theme, units, speed limit and ramp, backup and export, info). It is locked while the belt runs. An optional switch hides the safety notice and the question before a start; the speed limit, the ramp, the standstill check, Stop and the alarm for a lost connection stay active.
- Routes: import a GPX file (track or route, with or without elevations), keep it in a library, export it again. A route can also be exported and imported as a **route package** (`.walkflow`): the route with its name, place and texts in any number of languages, credit and tags, see [the format](docs/ROUTE-PACKAGE.md). An import always makes a new route. A package can carry **waypoints** (a bridge, a view …): they show in the route’s details and on the map, and the training view says which one is next and how far. In the desktop app the files have their own icon, and a double click (or “Open with”) opens the package in Walkflow and asks before it imports it. A route has a walking speed (default 3 km/h, from which its duration follows) and an optional description (a text you write stays in the language you wrote it in; the text of a route from the store follows the language of the app until you change it), both shown next to the map when a route is opened with the arrow icon, and editable there with the pencil icon. With a route chosen, the training view shows where on the route you are (“0.9 of 5.2 km”), the elevation and the slope of the next 100 m, with an elevation profile. Progress follows the treadmill’s own distance counter. Start walks the route as a workout (one distance step over the whole route at its walking speed, with the usual speed steps, limit and confirmation); the route’s elevation never changes speed or incline. The training view shows how long the route takes and whether it reaches today’s goal, and the history shows which workout or route a run was. An optional map shows the route and your position on it (training view) and opens under a route in the library; see [Map](#map). The library starts empty: the routes that come with the project (Central Park Reservoir Loop, Außenalster Loop in Hamburg, Vienna Ringstraße Loop, Imperial Palace Loop in Tokyo) are in the route store, see below.
- Route store: routes that people contributed to the project, kept in their own repository, [walkflow-app/route-store](https://github.com/walkflow-app/route-store) (added by pull request, see its README). The Routes view lists them with search and filters, and adds one to your library after you confirm. A route has a revision: when it is improved in the store, a copy in your library is offered an update. The app reads the list from GitHub only when you open it; each file is checked against the hash in the list first (`docs/ROUTE-STORE.md`).
- Live values, chart of the last 5 minutes, export as CSV and TCX (Strava, Garmin Connect & co.)
- History: runs are saved automatically on the device. Totals per week and month, distance per week, days in a row, records, a chart per run, CSV/TCX per run, backup and restore as a JSON file. Saving can be turned off; demo runs are listed but not counted.
- Log of sent/received bytes. The experiment console for the Control Point (raw commands, with the same checks) only shows in developer mode (Settings → General, switching it on asks first); in the desktop app the developer tools are only available then, too (no menu entry, one opened another way is closed again). That keeps them out of the way, it is not a security boundary
- Demo mode with a simulated treadmill, no hardware needed
- Works offline and can be installed as an app (PWA): in Chrome or Edge with the button in *Settings → Info*, or the install icon in the address bar
- English, German, French and Ukrainian; picked from the browser languages, switchable in the settings menu at the top right, or via `?lang=de|en|fr|uk` in the URL. Ukrainian has no legal pages of its own yet (they are in `public/legal/`): its links point to the English ones
- Dark and light theme, or following the system (default), and a choice of colours on top of that: Standard, Lagoon (teal and violet) or Candy (each part of the app has its own colour: training green, routes blue, workouts violet, community pink, history yellow). Both are switchable in the settings dialog at the top right

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

The web version runs at <https://walkflow-app.github.io/app/> (the Pages workflow pushes the built site to the repository `walkflow-app/walkflow-app.github.io`; a fork sets `SITE_REPO` and `SITE_URL` in `.github/workflows/pages.yml` and the secret `PAGES_DEPLOY_KEY`). Links can set the language, e.g. `…/app/?lang=fr`.

**Install it as an app:** in Chrome or Edge, open *Settings → Info* and press **Install Walkflow** (or use the install icon at the right end of the address bar). Walkflow then opens in a window of its own from the Dock, the Start menu or the home screen, works offline, and needs no download and no signature. Where the browser does not offer it (Safari, Firefox, or after the offer was dismissed), the section says how to do it from the browser’s menu. The product page is at <https://walkflow-app.github.io/>.

## Desktop app

> [!NOTE]
> **There is no macOS app for now.** It would have to be notarized by Apple (a paid Apple developer account); without that, macOS blocks it at first and again after every update. On a Mac, use the [web app](https://walkflow-app.github.io/app/) in Chrome or Edge and install it as an app (*Settings → Info → Install Walkflow*): it opens like any other app and does everything the desktop app does except the global stop shortcut and the device chooser of its own. You can still build the macOS app yourself with `npm run dist` on a Mac.

Downloads for Windows and Linux are on the **Releases** page. The app is not signed, so the system warns when you open it for the first time:

- **Windows:** at “Windows protected your PC”, click *More info → Run anyway*.
- **Linux:** `chmod +x Walkflow-*.AppImage` and start it. Web Bluetooth on Linux is untested.

On startup, and every few hours after that, the desktop app asks GitHub whether there is a newer version and shows a notice if so. On Windows and for the Linux AppImage the notice offers **Download and install**; once the update is installed it asks for a **restart**. Nothing is downloaded before the first yes and nothing restarts without the second, and never while the app is connected to a treadmill. Usually only the changed parts of the installer are downloaded. The macOS app is not signed yet, and macOS does not let an unsigned app replace itself: there the notice opens the release page. With a signed and notarized build (see the note at the top of `electron-builder.config.cjs`) it updates itself like the others. The check can be turned off in the info section. Besides that, the app contacts GitHub only when you open the route store (see `docs/ROUTE-STORE.md`).

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
| `npm run electron:dev` | Start Electron in watch mode: changes in `src/` show at once (hot reload), a change in `electron/` restarts the app |
| `npm run dist` | Installer for the current system in `release/` |
| `npm run icons` | Regenerate the icons (`scripts/make-icons.mjs`) |
| `node scripts/build-country-data.mjs <50m> <10m> <flags>` | Rebuild `src/core/routes/data/countries.json` and `src/ui/routes/flags/` from Natural Earth and flag-icons (only to update the data) |

Community (sharing between devices) is off in the first release. To try it, set `WALKFLOW_COMMUNITY=on` for `npm run dev`, `npm run build`, `npm run electron` or `npm run dist` (`docs/P2P.md`).

Without a treadmill: click “Demo (no treadmill)”. The simulator speaks real FTMS bytes and can simulate a connection loss and the safety key.

### Map

The map of a route is optional. In the training view it is off until a person switches it on (the choice is kept in the browser); in the routes view it opens under a route when the arrow icon of the route is pressed. Nothing is requested from the map server before that. The map is [MapLibre GL JS](https://maplibre.org/) (BSD 3-Clause), loaded on demand as a separate chunk, with the free vector tiles of [OpenFreeMap](https://openfreemap.org/): a light style (Positron) in the light theme and a dark one in the dark theme, with a little more colour added in the app (blue water, green parks, warm roads in light; deep blue and green in dark; `src/core/routes/map-tint.ts`), so the route stands out. The colours are set after the style has loaded and only for these two built-in styles; no extra request is made, and a style you set yourself is shown as it is. It only shows the route and the position; it sends nothing to the treadmill.

The styles are chosen when the app is built, not in the running app, because the Content-Security-Policy lets the app talk to exactly the map servers of the build. Set `WALKFLOW_MAP_STYLE` (light theme) and, if you like, `WALKFLOW_MAP_STYLE_DARK` for `npm run build` or `npm run dist`:

| Value | Effect |
| --- | --- |
| unset | OpenFreeMap: `https://tiles.openfreemap.org/styles/positron` (light) and `.../styles/dark` (dark) |
| an `https://` URL | That style. Given for the light style only, it is used for the dark theme too. Everything a style refers to (tiles, sprites, fonts) has to be on the host of a style given here, otherwise the policy blocks it. |
| `off` (in either) | No map in this build; the policy allows no outside host |

An invalid value stops the build. The privacy texts name the default server; change them if you change the styles.

### Structure

The source is split into layers, each in its own folder; a layer only uses the ones below it. The full description, the rules and where new code goes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); `tests/architecture.test.ts` checks them.

| Folder | Contents |
| --- | --- |
| `src/i18n/` | Language selection, texts per language (`locales/`), units (km/h or mph) |
| `src/core/` | Pure logic without browser: FTMS protocol, safety rules, workouts and programs, routes and route packages, runs and statistics |
| `src/platform/` | Pure helpers around the app's shell: build settings, version, security policy, file types, desktop file opening |
| `src/device/` | The treadmill: Bluetooth adapter and the simulator |
| `src/data/` | Storage in the browser (IndexedDB) |
| `src/ui/` | Everything that draws or listens: views per feature, components, theme, desktop integration; vanilla TS |
| `src/main.ts` | Wires it all together |
| `electron/` | Main process and preload of the desktop app (uses only pure code of `src/`) |
| `tests/` | Tests about the project itself (structure rules); unit tests sit next to their code |
| `public/legal/<lang>/` | Legal notice and privacy pages per language |
| `site/` | The product page for GitHub Pages (English and German, plain HTML and CSS, screenshots in `site/img/`); `npm run build:pages` puts it at the root and the web app under `app/` |

A second BLE path (e.g. native) only implements `BleAdapter`/`BleDevice` from `src/device/ble.ts`.

### Translations

All texts live in `src/i18n/locales/en.ts`, `de.ts` and `fr.ts`. `en.ts` defines the structure; TypeScript and `src/i18n/i18n.test.ts` check that every language has every text and that every `data-i18n` key in `index.html` exists. Safety texts must keep the same meaning and strength in every language.

Adding a language: copy `src/i18n/locales/en.ts`, translate it, register it in `src/i18n/i18n.ts` (`LANGS`, `MESSAGES`), add legal pages under `public/legal/<lang>/` and, for the macOS Bluetooth prompt, `build/lproj/<lang>.lproj/InfoPlist.strings`.

The FTMS terms in the log (`Set Speed`, `Request Control` …) stay English in every language. CSV column names are English too, as they are part of the file format.

### Themes

Every colour is a token at the top of `src/style.css`, defined once as `light-dark(light, dark)`. The theme only sets `color-scheme` (`data-theme` on `<html>`; none = follow the system), so form controls and scrollbars follow too. The chart reads the same tokens; the legal pages use a copy in `public/legal/legal.css`. `src/ui/theme.test.ts` checks that every token used is defined and that the main text and control colours reach WCAG contrast (4.5:1 for text, 3:1 for controls) in both themes. Alarm and stop stay strong red in both. A palette (`data-palette` on `<html>`, chosen in the settings dialog, stored as `walkflow.palette`) overrides only the tokens that change, again as `light-dark()`, so it works in light and dark; the tests run every palette, and fail if one changes the reds of Stop or the alarm. Standard is the tokens at the top; Lagoon and Candy are the blocks `:root[data-palette="…"]` below them. Candy also tints the cards of each part of the app (`--sec-*`, `--tint-*`). A new palette is one more block plus its name in `PALETTES` (`src/ui/theme.ts`) and in the three locale files.

## Publishing

### GitHub Pages

The site has two parts: the product page (`site/`: what Walkflow is, screenshots, download links to the latest release) at the root, and the web app under `app/` (so `https://walkflow-app.github.io/` is the page and `…/app/` the app; the former address `…/walkflow/` forwards there). `npm run build:pages` builds both into `pages/` (the pages in `site/` carry `{{version}}` in the download links; the build fills in the tag from `WALKFLOW_RELEASE`, or the version in `package.json` if it is not set); for a local look, build with `BASE_PATH=/app/` and serve `pages/` with any static server. The page takes no scripts, fonts or other content from third parties. Its two pages (`site/index.html`, `site/de/index.html`) must keep the same shape, which `tests/site.test.ts` checks, together with every link and image.

For search engines and link previews the pages carry a canonical address, `hreflang` links, Open Graph and Twitter tags, structured data (`SoftwareApplication`) and `sitemap.xml`; `{{site}}` in them is the address of the site (`SITE_URL`, set by the Pages workflow). `site/img/social-<en|de>.png` (1200 × 630) is the preview image; make it again from the training screenshot when that changes. `robots.txt` names the sitemap; submitting `…/sitemap.xml` in the Google Search Console and Bing Webmaster Tools still speeds things up.

The screenshots in `site/img/` show the app with made-up runs and workouts and the routes of the route store (not a real person's data). They are `<dark|light>-<en|de>-<training|routes|workouts|history>.webp`, 1600 × 1000, and are taken again when the look of the app changes a lot.

1. Repository settings → *Pages* → Source: **GitHub Actions**. (For a private repository, Pages needs a paid GitHub plan.)
2. Fill in the pages under `public/legal/` (legal notice and privacy, per language). As long as they contain `TODO`, the Pages workflow fails on purpose. If you only want legal pages in one language, delete the others and point `info.imprintHref`/`info.privacyHref` in the locale files to the remaining ones.
3. Publishing a release deploys the site on its own (the Pages workflow runs on `release: published`): the download links and the version on the product page come from the latest published release. Between releases, deploy by hand: *Actions → Pages → Run workflow*.

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
2. Merging it creates the tag `vx.y.z` and a **draft release** with the changelog. The desktop app for Windows and Linux is built and attached with checksums. macOS is left out for now (not notarized, see [Desktop app](#desktop-app)).
3. Check the changed areas on the treadmill (`HARDWARE-TESTS.md`), then publish the draft by hand. Only published releases reach the update notice of the desktop app. Publishing also rebuilds and deploys the site (see [GitHub Pages](#github-pages)).

The repository variable `MAC_BUILD` (*Settings → Secrets and variables → Actions → Variables*) decides about macOS. Not set (the default for now): no macOS app. `github`: built on a GitHub macOS runner like the others (do this once the build is signed and notarized). `local`: built on your own Mac, for when GitHub has no macOS runner free: when the draft exists, `git checkout v<version>` and run `scripts/release-mac.sh v<version>`. It runs the checks, builds both macOS apps (arm64, x64), adds them to the draft and updates `SHA256SUMS.txt`; it needs `gh` (logged in with write access) and a clean checkout of the tag.

One-time setup: *Settings → Actions → General → Workflow permissions →* “Allow GitHub Actions to create and approve pull requests”. Without it, release-please cannot open its pull request.

The first `feat` or `fix` after setting this up leads to version 0.1.0. A release by hand still works: set the version in `package.json` and `.release-please-manifest.json`, commit, push the tag `v<version>`.

### Signing and notarization (later)

Prepared in `electron-builder.config.cjs`: once the secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set as environment variables in the release workflow, the app is signed with a Developer ID, Hardened Runtime is enabled and it is notarized. Without them, macOS is signed ad hoc (needed so Apple Silicon Macs start the app at all).

## Support

<!-- Placeholder: only add a link once provider and terms are settled. -->
Support this project: *(link to follow)*

There is no entitlement to support and no feature depends on support.

## License

[MIT](LICENSE)

The routes that come with the project (in the [route store](https://github.com/walkflow-app/route-store)) are track data from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Each file says so in its `source` and `license`, and the app shows author, licence and source in the details of the route. The country flags in front of the routes are from [flag-icons](https://github.com/lipis/flag-icons) (MIT, licence in `src/ui/routes/flags/LICENSE`). The borders that decide which flag a route gets are from [Natural Earth](https://www.naturalearthdata.com/) (public domain), simplified by `scripts/build-country-data.mjs`; the country is worked out on the device from the start of the route and nothing is sent anywhere. The map uses OpenFreeMap tiles, which are also based on OpenStreetMap data and show their credits on the map.
