# Security policy

Walkflow can start and stop a treadmill belt, so two kinds of problems are taken seriously: **anything that keeps the belt from
stopping, or starts it faster or sooner than the person asked**, and anything that lets other people's data reach the app unchecked
(route files, the route store, and sharing between devices once it is switched on).

## Reporting a problem

Please do not open a public issue for these. Use **Security → Report a vulnerability** on the
[repository page](https://github.com/walkflow-app/walkflow/security/advisories/new): it is private and reaches the maintainer directly.
Say what you did, what you expected and what happened; for the belt, the treadmill model and the log from the app (the Log section
of the training view) help most.

This is a project run by one person in their free time, so there is no promised response time. A report is read, and a confirmed
problem in the safety logic is fixed before anything else.

## What is supported

The latest release. Fixes are made on `main` and released from there; there are no patch releases for older versions.

## What is not a security problem

- The app cannot stop the belt when the Bluetooth connection is lost. This is how Bluetooth works and is written in the
  [safety notice](README.md); the stop button on the treadmill and the safety key are what help then.
- The speed limit, the step size and the other settings can be changed by the person using the app. They are there to protect from
  a slip, not from the person who owns the treadmill.
