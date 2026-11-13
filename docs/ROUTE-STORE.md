# Route store

Routes that people contributed to the project, kept in their own public repository on GitHub,
[walkflow-app/route-store](https://github.com/walkflow-app/route-store), and offered in the app (**Routes → Route store**). It needs no
server and no account: the repository is the server, and a pull request is how a route gets in. It is separate from [Community](P2P.md) (sharing between devices), which is off in the first release.

## What is where

In the route-store repository:

```
index.json          what the app reads first: one entry per route file
routes/*.walkflow   route packages ([format](ROUTE-PACKAGE.md)), as exported by the app
README.md           how to add a route, how a route is made and reviewed
specs/*.json        what the routes of the project were made from
scripts/, tests/    make-route.mjs (spec → route), the check and index script, the map of a route that CI writes into a pull request, and their tests
```

`index.json` is written by CI from the route files after a merge (`scripts/build-store.mjs` in the route-store repository) and sorted by file
name, so the same files always give the same bytes. A pull request carries only **one** route file and must not touch the index. The CI of the
route-store repository fails a pull request if it changes more than one file in `routes/`, if a file is not a valid route package, has no
`license`, has a waypoint more than 150 m from its route, or is a copy of another file. What counts as valid is **this repository's code**
(`src/core/store/route-index.ts`, `src/core/routes/route-package.ts`, `route-waypoints.ts`): the script checks this repository out (`main`) and
bundles that code with this repository's esbuild (so it has to stay in `package.json`), so a route that passes is one the app can read. A change to that code is a change to the checks of the store, and a change
that makes today's routes invalid shows up in the route-store's CI at the next run.

```json
{
  "version": 1,
  "routes": [
    {
      "file": "alster-rundweg.walkflow",
      "sha256": "…64 hex digits, the file as stored…",
      "chars": 6103,
      "length": 7540,
      "name": { "en": "Outer Alster loop", "de": "Außenalster-Runde" },
      "place": { "en": "Hamburg, Germany" },
      "country": "DE",
      "tags": ["city", "lake"]
    }
  ]
}
```

`length` is the length of the route in metres, `chars` the length of the file's text. `place`, `country` and `tags` are
optional.

## Versions and updates

Every route has a **revision**, a whole number from 1 in the package (`"revision": 2`; without it the route is at 1) and in the
index. When a route in the store is improved (a better track, a corrected name), the contributor raises the revision in the
same pull request; the file name stays, because the file name is what identifies the route.

The app remembers for each route it took from the store the file (`storeFile`) and the revision it came with. In the store
list a route is then one of three things: **new** (button *Add*), **in your library** (the copy is as new as the store's, or
newer), or **update** (button *Update to version N*, when the store's revision is higher). An update asks first, then
replaces the route in the library with the new version: it keeps its place in the list and stays chosen and shared, everything
else, including changes the person made to it, is the new version. A route that was added from the store twice is matched
by the copy with the highest revision. A route taken from somewhere else is never updated, even if it has the same name.

The revision is for people and for the update: the check that a download is the file the list described is still the hash.
The check does not (yet) test that a changed file has a higher revision; a review does.

## How the app uses it

- **Where from.** `https://raw.githubusercontent.com/<owner>/route-store/main/` for the owner of the repository the build was made for
  (`GITHUB_REPOSITORY`, `src/platform/store-url.ts`; `walkflow-app/walkflow` reads `walkflow-app/route-store`). A build without a repository has no store and shows nothing of it.
  `WALKFLOW_STORE_BASE` (https, or a local server) replaces the address, for trying it out.
- **When.** Never on its own. The list is read when the person opens the store for the first time, a route when they press *Add*.
  GitHub sees the IP address of the device; no cookie, no referrer is sent, and nothing else. The info section says so (the store
  itself shows no notice).
- **What is checked.** The index is read strictly (`parseIndex`): the version, the size (2 MB, 2000 routes), every file name
  (no path), hash, length, name, country and tags; texts are cut and stripped of control characters. A downloaded file is compared
  with the length and SHA-256 of its entry (`verifyDownload`), then read as a route package (every point and text checked, an
  id or a date in the file is not used), and the person is asked before it is saved. It always becomes a new route and never
  replaces one that is there.
- **Allowed connections.** The content security policy and the request filter of the desktop app allow exactly that address
  (with a trailing slash, so nothing else on `raw.githubusercontent.com`), in addition to what was allowed before.
- **No path to the belt.** A route only shows progress; it sends nothing to the treadmill (see ROUTE-PACKAGE.md).

## Making routes

Everything that makes, checks and approves a route is in the route-store repository, so that it does not depend on this one for it: the
**specs** (`specs/*.json`) the routes of the project were made from, `scripts/make-route.mjs` that turns a spec into a route package from
OpenStreetMap data (a loop around a lake, or a walk from one place to another through the places in the spec), the check and index script, the
map of a route that the CI writes into a pull request, and their tests. How to make a route, the fields of a spec and how a route is
reviewed (**one route per pull request**, the map in it) are in the README of that repository. The only thing it needs from here is this
repository's code for reading a package, as a checkout (`--app`, `$WALKFLOW_APP`, or `../walkflow` next to it).

## What it does not do

- It does not check who made a route or whether the data may be used: that is what the `license` and `source` of a package are
  for, and what the review of a pull request is for. The app says that nobody checked the route when it asks to add it.
- Raw files on GitHub are cached for a few minutes, so a new route can take a moment to appear.
- GitHub is the only place it reads from. If the repository moves or the branch is renamed, the app has to be updated (the branch
  is `STORE_BRANCH` in `src/platform/store-url.ts`).

## Later, maybe

- **Pictures at waypoints.** A waypoint could show a photo (a view, a bridge) in the route's details and in the training view.
  Not part of the format yet; today a waypoint has only `at`, `name` and `text` ([format](ROUTE-PACKAGE.md)), and a field the
  format does not know is ignored. The idea, so that the Content-Security-Policy stays as narrow as it is:
  - The pictures live in the route-store repository (for instance `images/`), next to the route files, and are served from the
    store's own host. A waypoint names one by a path relative to the store, never by a free URL. The policy then needs that one
    host in `img-src` and no wildcard, and no other server learns who is looking at which route.
  - Each picture has a `license`/credit and a text for screen readers, in several languages like `name` and `text`.
  - Limits like those of the other fields: size and dimensions per picture (the CI shrinks or refuses), and a number per route.
    The CI of the store checks that every named picture exists, is used, and is an image of a plain type (no SVG).
  - The app loads a picture only when it is looked at, and a route works without it: offline, or when the picture is missing, the
    waypoint shows its name and text as before. A route shared from device to device ([P2P](P2P.md)) carries no pictures; there,
    and for a route someone wrote, a picture is simply not shown.
  - Not planned: pictures embedded in a package (`data:`) and free URLs, which would load from servers nobody vetted.
