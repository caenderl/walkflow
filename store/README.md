# Route store

Routes that people contributed to Walkflow. The app lists them in **Routes → Route store** and adds a route to the
person's library only after they picked it and confirmed. How it works is in [`docs/ROUTE-STORE.md`](../docs/ROUTE-STORE.md).

```
store/
  index.json          the list the app reads; written by "npm run store:build", never by hand
  routes/*.walkflow   one route package per file
```

## Adding a route

1. Get a route package: in the app **Routes → ⋯ → Export as package** ([format](../docs/ROUTE-PACKAGE.md)).
2. Open the file in a text editor and add who made it and under which terms:
   ```json
   "author": "Your name",
   "license": "CC0-1.0",
   "source": "Where the track comes from, e.g. © OpenStreetMap contributors (ODbL)",
   ```
   `license` is required: a route is only accepted if you say under which terms others may use it. If the track is
   derived from someone else's data, the `source` says whose. Do not add a route that gives away where you live.
   Also helpful: `name` and `place` in several languages, a `country`, and a few lower-case `tags`. Places worth a word along
   the way go into `waypoints` ([format](../docs/ROUTE-PACKAGE.md)): `store:check` fails if one is more than 150 m from the route.
3. Put the file in `store/routes/`. The name uses lower-case letters, digits, `.`, `_`, `-` and ends in `.walkflow`,
   e.g. `alster-rundweg.walkflow`. Do not change the line endings (the file is hashed as it is).
4. Run `npm run store:build`, which checks the file and updates `index.json`, and open a pull request with both.
   `npm run store:check` (CI runs it) fails if a file is not a valid package, has no `license`, or the index is out of date.

## Changing a route

Edit the file in `store/routes/`, **raise its `"revision"`** (add `"revision": 2` after `"version": 1` if there is none) and run
`npm run store:build`. People who have the route get an offer to update it. Keep the file name: it is what identifies the route.

A route in the store is shown to everyone, so a maintainer looks at each pull request before it is merged.
