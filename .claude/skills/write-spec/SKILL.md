---
name: write-spec
description: Turn an idea or issue into a spec in docs/specs/ before anything is built - problem, scope, non-goals, acceptance criteria that become tests, safety and hardware impact, texts, docs. Use when the maintainer asks for a new feature or a bigger change, says "spec", or when a change is too big or unclear to start coding.
---

# Write a spec

A spec is how a feature gets decided before it gets built. Code starts only when the spec says `Status: accepted`, which
only the maintainer sets.

## Where

- `docs/specs/NNNN-short-name.md` in the repository the change mostly belongs to (next free number, four digits).
- A change to the treadmill library goes into `ftms-treadmill/docs/specs/`, with a short spec here for the app side that
  links to it.
- Bigger design documents that already exist (`docs/P2P.md`, `ftms-treadmill/docs/LIBRARY.md`) stay; a spec links to them
  instead of repeating them.

## How

1. Read what exists: README, `docs/ARCHITECTURE.md`, related docs and specs, the code it touches. Open questions that only the
   maintainer can answer go into the spec under *Open questions*, each with a proposed answer; do not stop to ask them one by one.
2. Copy [template.md](template.md), fill it in. Keep it short: a page is plenty for most features.
3. Every acceptance criterion must be checkable: by a test (name the test file) or, for the belt, by a HARDWARE-TESTS.md item.
4. Open a pull request with only the spec, title `docs(spec): <name>`, status `draft`. The maintainer accepts it (status
   `accepted`) or changes it.
5. When it is built, the implementing pull request sets the status to `done` and links itself.

## Statuses

`draft` → `accepted` → `in progress` → `done`, or `dropped` (keep the file, say why).
