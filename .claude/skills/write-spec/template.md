# NNNN: Name of the feature

Status: draft
Issue: #…
Repositories: walkflow (and ftms-treadmill / route-store if they change)

## Problem

Who wants what, and why it matters. One paragraph.

## Scope

What will be built, as the person using the app sees it.

## Non-goals

What this deliberately does not do (and might later).

## Acceptance criteria

- [ ] … (test: `src/…/x.test.ts`)
- [ ] … (hardware: HARDWARE-TESTS.md → section …)

## Safety

None / or: what it changes about the speed limit, the ramp, start, stop or warnings, and why that is not weaker than today.
Anything here makes the implementing commits `safety` and is written test first.

## Hardware

What only a treadmill can show, with the expected log lines and bytes (see the `hardware-check` skill). "None" if the belt is
not involved.

## Design

Layers and files it touches (see docs/ARCHITECTURE.md), app or library, new dependencies (none without asking), data formats
and how old data is read.

## Texts and docs

New UI texts (en, de, fr, uk), and which docs change (README, HARDWARE-TESTS.md, docs/*.md, the site).

## Open questions

- Question? Proposed answer: …
