# Roadmap

What is being done on the Walkflow app and its site, what comes next, and what may come later. The maintainer decides what
moves into *Now*. Each line links to where the work is. The treadmill library and the route store have their own roadmaps:
[ftms-treadmill](https://github.com/walkflow-app/ftms-treadmill/blob/main/ROADMAP.md),
[route-store](https://github.com/walkflow-app/route-store/blob/main/ROADMAP.md). Last updated: 2026-11-14.

State: [0.7.1](https://github.com/walkflow-app/walkflow/releases/tag/v0.7.1) (2026-11-13), with ftms-treadmill 0.2.0, tested on
a Sportstech sPad 500.

## Now

- **Hardware checks still open.** 63 items in [HARDWARE-TESTS.md](HARDWARE-TESTS.md) are not ticked, among them heart rate,
  incline levels, program transitions, reconnecting, **the belt on a lost connection** and stop on a standing belt. Needs a
  real treadmill. `needs-hardware`

## Next

- **Community (sharing between devices) for a release.** Built but switched off ([docs/P2P.md](docs/P2P.md)). Open before it
  goes live: one room for everyone instead of one per language, a message when a room is full, the number of connections
  measured, a test with several real devices and from the desktop app. `spec`
- **Share and receive with a code** (sending to one person), the other half of the screens in [docs/P2P.md](docs/P2P.md).

## Later, maybe

- **Incline:** a percent per level, configurable (the real slope of a level is unknown).
- **macOS app signed and notarized** (prepared in `electron-builder.config.cjs`, needs an Apple Developer ID).
- **Community extras** ([docs/P2P.md → Later](docs/P2P.md#later-maybe),
  [→ Who can connect](docs/P2P.md#who-can-connect-and-what-protects-what)): a signed catalogue that marks items as verified,
  signatures of authors, devices on the same network without a relay (mDNS), running together with live figures (never control
  of someone else's belt).
- **Pictures at waypoints** of store routes ([docs/ROUTE-STORE.md → Later](docs/ROUTE-STORE.md#later-maybe)), together with the
  route store.

## Done recently

- 2026-11-14: docs out of date fixed ([#41](https://github.com/walkflow-app/walkflow/issues/41)): `src/net/` and the
  Community view are built, texts in four languages.
- 2026-11-13: 0.7.1 (`ended` comes once per run of the belt, ftms-treadmill 0.2.0); route tooling moved into the route store;
  the treadmill library in its own repository.
- 2026-11-12: 0.6.0 and 0.7.0: treadmill control moved into ftms-treadmill; incline as levels, set only while the belt runs.
