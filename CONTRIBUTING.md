# Contributing

Thank you for wanting to help. Walkflow is a small project, so a few rules keep it easy to review and safe to run on a real treadmill.

## Set up

Node.js 24.

```bash
npm ci
npm run dev
```

Without a treadmill, **Demo (no treadmill)** in the connection menu runs against a simulator that speaks real FTMS bytes. Before a
pull request, these have to pass (CI runs them):

```bash
npm run typecheck
npm test
```

## Pull requests

- **The title is a [Conventional Commit](https://www.conventionalcommits.org/).** Pull requests are squash merged, and the title
  becomes the commit message that the release notes and the version are made from. Types: `feat`, `fix`, `perf`, `revert`, and
  **`safety`** for anything that changes the speed limit, the ramp, stopping, or the warnings; `docs`, `refactor`, `test`, `build`,
  `ci`, `style`, `chore` do not appear in the release notes. Example: `fix(routes): keep the progress when a route is updated`.
- **Safety first.** Code that decides what is sent to the treadmill (the app's `src/core/safety/`, and the library [`ftms-treadmill`](https://github.com/walkflow-app/ftms-treadmill), which has its own repository)
  gets its test first, and the change must not weaken a limit, a delay or a warning. If you are not sure, say so in the pull request.
- **Small and focused.** One change per pull request, with the tests that show it works.
- **No new dependency without asking first** (open an issue). What the app runs is bundled at build time and kept small on purpose:
  besides its own code only the treadmill library, the map library and the sharing library.
- **Texts.** The app is in English, German, French and Ukrainian. A new text needs all four (`src/i18n/locales/`); a test checks that
  they have the same shape. If you cannot write one of them, put a clear English text there and say so, and it will be fixed.
- **Structure.** `docs/ARCHITECTURE.md` describes the layers. `npm test` checks them: lower layers do not import higher ones, nothing
  from sharing can reach the treadmill commands, and the pure layers have no DOM.

## Adding a route to the route store

Routes are files in their own repository, [walkflow-app/route-store](https://github.com/walkflow-app/route-store), and a pull request there is
how one gets in. How to make the file, what it has to say (author, licence, source) and how the check works is in its README; the
format is in [`docs/ROUTE-PACKAGE.md`](docs/ROUTE-PACKAGE.md).

Only add a route that you made yourself or that is under a licence that allows it, say which in the file, and do not add one that
gives away where you live. A maintainer looks at every route before it is merged.

## Reporting a bug

Use the bug report form. For anything that has to do with the belt not stopping, see [SECURITY.md](SECURITY.md) instead.
