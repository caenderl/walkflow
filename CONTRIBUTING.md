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
npm run lint
npm test
```

## Static analysis

`npm run lint` runs [oxlint](https://oxc.rs/docs/guide/usage/linter) with type information (`--type-aware`, built on
TypeScript 7, which typescript-eslint cannot use) and then [knip](https://knip.dev), which finds unused files, exports and
dependencies. The rules are in `.oxlintrc.json`, knip's entry points (the page, Electron, the scripts, the tests) in `knip.json`.
Above all, no promise may be left unhandled: a forgotten `await` on `tm.stop()` fails the lint. Type information comes from the
three projects that `tsconfig.json` refers to (`tsconfig.app.json` for `src/`, `tsconfig.node.json` for the config and `tests/`,
`tsconfig.electron.json` for `electron/`).

If a rule is wrong for one line, switch it off on that line and say why:

```ts
// oxlint-disable-next-line typescript/no-unnecessary-condition -- the Wake Lock API is missing in Firefox and older Safari
```

Typical cases are browser APIs that the types promise but not every browser has, and checks after an `await` that another call may
have changed in the meantime. In safety code (`src/core/safety/`, anything that ends in a call that drives the belt) a finding that
would change behaviour is not "fixed" in passing: it gets a test first, like any other safety change. Rules that are off for the
whole app, and why:

- `unicorn/prefer-add-event-listener`: the UI assigns `onclick` and the like on purpose, so a re-render replaces the handler
  instead of adding a second one.
- `unicorn/no-useless-spread`: listeners are copied before they are called, so a listener may unsubscribe while the others run.
- `unicorn/no-array-sort`: what is sorted is a fresh copy, and `toSorted` is not in the ES2022 library the app is built against.
- `typescript/consistent-return`: TypeScript already checks that every path of a function returns, also for exhaustive `switch`es.
- `no-await-in-loop`: some steps (retries, ramps) are sequential on purpose.

GitHub's CodeQL (default setup, extended queries) checks the code and the workflows for security problems on every push and pull
request; Dependabot keeps the GitHub Actions, which are pinned by commit, and the dev dependencies current once a month.

## Pull requests

- **The title is a [Conventional Commit](https://www.conventionalcommits.org/).** Pull requests are squash merged, and the title
  becomes the commit message that the release notes and the version are made from. Types: `feat`, `fix`, `perf`, `revert`, and
  **`safety`** for anything that changes the speed limit, the ramp, stopping, or the warnings; `docs`, `refactor`, `test`, `build`,
  `ci`, `style`, `chore` do not appear in the release notes. Example: `fix(routes): keep the progress when a route is updated`.
- **Safety first.** Code that decides what is sent to the treadmill (the app's `src/core/safety/`, and the library [`ftms-treadmill`](https://github.com/walkflow-app/ftms-treadmill), which has its own repository)
  gets its test first, and the change must not weaken a limit, a delay or a warning. If you are not sure, say so in the pull request.
- **Small and focused.** One change per pull request, with the tests that show it works.
- **Through a pull request only.** `main` takes no direct pushes; a pull request is merged once CI (`test`) is green.
- **Working with an AI agent?** `CLAUDE.md` holds the rules an agent needs (safety, hardware checks, texts, releases) and
  `.claude/settings.json` the commands it may and may not run, `.claude/skills/` and `.claude/agents/` the ways of working (release,
  hardware checks, specs) and the reviewers (safety, docs and texts, architecture, the site); `.github/CODEOWNERS` names what needs a human review.
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
