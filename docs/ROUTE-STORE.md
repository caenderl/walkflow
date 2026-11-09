# Route store

Routes that people contributed to the project, kept in the project's public repository on GitHub and offered in the app
(**Routes → Route store**). It needs no server and no account: the repository is the server, and a pull request is how a route
gets in. It is separate from [Community](P2P.md) (sharing between devices), which is off in the first release.

## What is where

```
store/
  index.json          what the app reads first: one entry per route file
  routes/*.walkflow   route packages ([format](ROUTE-PACKAGE.md)), as exported by the app
  README.md           how to add a route
```

`index.json` is written by `npm run store:build` (`scripts/build-store.mjs`, logic in `src/core/store/route-index.ts`) and sorted by
file name, so the same files always give the same bytes and a change shows line by line in a review.
`npm run store:check` runs in CI: it fails if a file is not a valid route package, has no `license`, has a waypoint more than 150 m from its route, is a copy of another file, or
the index is not what the build would write.

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
same pull request and runs `npm run store:build`; the file name stays, because the file name is what identifies the route.

The app remembers for each route it took from the store the file (`storeFile`) and the revision it came with. In the store
list a route is then one of three things: **new** (button *Add*), **in your library** (the copy is as new as the store's, or
newer), or **update** (button *Update to version N*, when the store's revision is higher). An update asks first, then
replaces the route in the library with the new version: it keeps its place in the list and stays chosen and shared, everything
else, including changes the person made to it, is the new version. A route that was added from the store twice is matched
by the copy with the highest revision. A route taken from somewhere else is never updated, even if it has the same name.

The revision is for people and for the update: the check that a download is the file the list described is still the hash.
`store:check` does not (yet) test that a changed file has a higher revision; a review does.

## How the app uses it

- **Where from.** `https://raw.githubusercontent.com/<owner>/<repo>/main/store/` for the repository the build was made for
  (`GITHUB_REPOSITORY`, `src/platform/store-url.ts`). A build without a repository has no store and shows nothing of it.
  `WALKFLOW_STORE_BASE` (https, or a local server) replaces the address, for trying it out.
- **When.** Never on its own. The list is read when the person opens the store for the first time, a route when they press *Add*.
  GitHub sees the IP address of the device; no cookie, no referrer is sent, and nothing else. The info section and the notice in
  the store say so.
- **What is checked.** The index is read strictly (`parseIndex`): the version, the size (2 MB, 2000 routes), every file name
  (no path), hash, length, name, country and tags; texts are cut and stripped of control characters. A downloaded file is compared
  with the length and SHA-256 of its entry (`verifyDownload`), then read as a route package (every point and text checked, an
  id or a date in the file is not used), and the person is asked before it is saved. It always becomes a new route and never
  replaces one that is there.
- **Allowed connections.** The content security policy and the request filter of the desktop app allow exactly the store folder
  (with a trailing slash, so nothing else on `raw.githubusercontent.com`), in addition to what was allowed before.
- **No path to the belt.** A route only shows progress; it sends nothing to the treadmill (see ROUTE-PACKAGE.md).

## What it does not do

- It does not check who made a route or whether the data may be used: that is what the `license` and `source` of a package are
  for, and what the review of a pull request is for. The app says that nobody checked the route when it asks to add it.
- Raw files on GitHub are cached for a few minutes, so a new route can take a moment to appear.
- GitHub is the only place it reads from. If the repository moves or the branch is renamed, the app has to be updated (the branch
  is `STORE_BRANCH` in `src/platform/store-url.ts`).
