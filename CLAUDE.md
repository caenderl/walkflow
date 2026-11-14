# Walkflow: notes for agents

Walkflow drives a real treadmill that a person is standing on. Treat every change that can end in a command to the belt as
safety-relevant. Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing code; this file only adds what an agent tends to miss.

## The repositories of walkflow-app

Cloned side by side in one folder, so relative paths like `../ftms-treadmill` work:

| Repository | What | Notes |
| --- | --- | --- |
| `walkflow` (this one) | The app (PWA and Electron) and the product page (`site/`) | |
| `ftms-treadmill` | The library that drives the belt (FTMS, BLE, safety, start and stop) | The app pins an exact npm version. A library change reaches the app only through a library release and a version bump here; to try it before that, `npm run build` there and `npm link ../ftms-treadmill` here. |
| `route-store` | Routes for the in-app store, and the tooling to make them | |
| `meta` | Internal planning, private to the organisation's members: specs across repositories, decisions, the setup | Read the decisions before proposing bigger work. Never copy internal notes from there into this public repository. |
| `walkflow-app.github.io` | The deployed site | **Build output only.** `.github/workflows/pages.yml` replaces it on every deploy. Never edit it; change `site/` (or the app) here. |

## Roadmap

[ROADMAP.md](ROADMAP.md) is the public plan of this repository (*Now*, *Next*, *Later, maybe*). Only the maintainer moves
something into *Now*. When a pull request finishes or drops a roadmap item, update the roadmap in the same pull request.

## Rules

- **English in the repository**: docs, code comments, test names, commit messages, workflow step names. Exceptions: the
  locale files, the de/fr/uk legal pages, `legacy/`.
- **Safety test first.** Anything that changes the speed limit, the ramp, stopping or the warnings (`src/core/safety/`, and
  everything that ends in a call that drives the belt) gets its failing test before the code, and must not weaken a limit,
  a delay or a warning. Most of that logic lives in `ftms-treadmill`; change it there.
- **You cannot test Bluetooth.** For a change that touches the treadmill, say exactly what to check in the log (hex bytes,
  expected lines) and add or update the checks in [HARDWARE-TESTS.md](HARDWARE-TESTS.md). Not yet confirmed on a treadmill,
  so never treat as known: incline, heart rate, program transitions, reconnecting, the belt on a lost connection.
- **Every UI text in all four locales** (`src/i18n/locales/`: en, de, fr, uk). Say in the pull request that fr and uk are
  not proofread by a native speaker.
- **Docs in the same pull request.** With every change, check README.md, HARDWARE-TESTS.md, CONTRIBUTING.md and `docs/*.md`
  for text it makes wrong, and fix it there.
- **Never invent** legal texts, addresses, names or donation links. The maintainer fills those in.
- **Layers** are enforced by `tests/architecture.test.ts`. `src/net/` and `src/core/share/` (sharing with other devices) must
  never reach the treadmill. Every peer is hostile: validate, limit, and let the person confirm before anything is saved.

## Commands

```bash
npm ci
npm run typecheck && npm run lint && npm test   # what CI runs; all three must pass before a pull request
npm run dev                                     # Demo (no treadmill) in the connection menu runs a simulator speaking real FTMS bytes
```

## Commits and pull requests

- One branch and one pull request per change, from `main`. Avoid stacked pull requests: squash merging and deleting the base
  branch closes the one on top.
- The pull request title becomes the squash commit and must be a Conventional Commit; release-please makes the version and
  the changelog from it (table in README → *Versions and releases*). `safety` for limit, ramp, stop or warnings. Changes only
  to `site/` or the Pages workflow are `docs(site)` or `chore(site)`, never `feat(site)` (that would open a release).
- `main` takes changes only through pull requests with CI (`test`) green.

## How work is done here

- **Bigger features start as a spec** (skill `write-spec`, in `docs/specs/`); code starts once the maintainer set it to
  `accepted`. Small fixes need none.
- **Before opening a pull request**, run the reviewers that apply and fix what they find (or say in the pull request why not):
  - `safety-reviewer` when the diff touches `src/core/safety/`, `src/ui/live/`, Bluetooth, the `ftms-treadmill` version, or
    anything that ends in a call that drives the belt;
  - `docs-i18n-reviewer` for every change to behaviour, settings, UI texts or the site;
  - `architect` for a spec, a refactor, or a change across layers or repositories.
- **Treadmill checks**: skill `hardware-check` writes them into HARDWARE-TESTS.md, and reads a log the maintainer pastes.
- **Website**: agent `site-editor`.
- **"release"**: skill `release` (the whole chain, publishing included; it stops before publishing safety changes).

## Never without being asked

Publish to npm, force-push, merge with `--admin`, push to the site repository, change repository settings, rulesets or
secrets, or delete releases, tags or branches other than your own.
