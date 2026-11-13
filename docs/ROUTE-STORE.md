# Route store

Routes that people contributed to the project, kept in their own public repository on GitHub,
[walkflow-app/route-store](https://github.com/walkflow-app/route-store), and offered in the app (**Routes → Route store**). It needs no
server and no account: the repository is the server, and a pull request is how a route gets in. It is separate from [Community](P2P.md) (sharing between devices), which is off in the first release.

## What is where

In the route-store repository:

```
index.json          what the app reads first: one entry per route file
routes/*.walkflow   route packages ([format](ROUTE-PACKAGE.md)), as exported by the app
README.md           how to add a route, and how a route is reviewed
scripts/, tests/    the map of a route that CI writes into a pull request, and its tests
```

`index.json` is written by CI from the route files after a merge (`scripts/build-store.mjs` in this repository, logic in
`src/core/store/route-index.ts`) and sorted by file name, so the same files always give the same bytes. A pull request carries
only **one** route file and must not touch the index. The CI of the route-store repository checks out this repository and runs
the script: it fails a pull request if it changes more than one file in `routes/`, if a file is not a valid route package, has no `license`,
has a waypoint more than 150 m from its route, or is a copy of another file. So the checks are the app's own code, and a route that passes is one the app can read.
`tests/build-store.test.ts` tests the script here. The route-store workflow runs the script from this repository's `main`; a change
to the script is a change to the checks of the store.

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

The routes that the project adds itself (author `Walkflow`) are made with `scripts/make-route.mjs`, in one of two ways. **A loop:**
the outline of a lake or a park is taken from OpenStreetMap, laid onto the paths around it, and the pieces are joined by shortest paths,
so the loop follows the real paths. **A walk from one place to another** (through a city, say): the places worth a word along the way
come first, and the route is the shortest way over paths and streets from one to the next. A person who adds a route to the store exports it from the app instead (see the README of the route-store repository).

1. **Pick the place.** A lake with a path along its shore works well. A park only works if its outline follows a path: with
   three parks that were tried (Regent's Park, Vondelpark, Tempelhofer Feld) the loop wandered off through the park. A lake that is
   several pieces in OpenStreetMap (Sortedams Sø in Copenhagen) gives only its largest piece. Take the
   OpenStreetMap id from the address of its page (`openstreetmap.org/relation/62215` → `relation/62215`, a way is `way/<id>`).
   **A walk from one place to another** has no lake: find the places first (a square, a bridge, a building; 4 to 6 for 2 to 3 km),
   in the order they are walked, start and goal included, and take the coordinates of each from OpenStreetMap (the address of its
   page, or Nominatim). The route goes through them.
2. **Write a spec**, `scripts/route-specs/<file>.json` (the folder has examples of both kinds):

   | Field | Meaning |
   |---|---|
   | `file` | Name of the package without `.walkflow`: lower-case letters, digits, `.` `_` `-`. Place first, then the feature (`berlin-schlachtensee`). |
   | `osm` | `relation/<id>` or `way/<id>` of the lake or park. Leave it out for a walk from one place to another: the route then goes through the `waypoints` in order. |
| `path` | Only without `osm`, optional: a list of `[lat, lon]` the route goes through instead of the waypoints, when it needs more places than there are waypoints to be kept to the street that is meant (a bridge, a crossing). The first is the start and the last the goal. |
   | `step`, `snapDist`, `corr`, `pen` | How the loop is laid, all optional: the outline is sampled every `step` m (200); a sample is snapped to a path within `snapDist` m (60); only paths within `corr` m of the outline are used (60), and the further from it, the dearer (`pen`, 15: bigger is stricter about staying close to the outline). For a walk from one place to another the line between the places takes the part of the outline, and the defaults are `snapDist` 80, `corr` 250, `pen` 200. A stop is snapped to the nearest *node* of a way, so a place on a long straight bridge needs `snapDist` raised or a stop at one of its nodes; canals and parks can cut the streets off from each other within `corr`, then raise `corr` (Amsterdam needed 400). |
| `spur` | Only without `osm`, optional (240): a way out to a place and straight back that is shorter than this many metres in all is cut out, so that a stop in a side street does not send the route there and back; the stop is then up to half of `spur` from the route. Raise it if side trips are too many. |
   | `country`, `tags`, `name`, `place`, `description`, `waypoints` | As in [the package format](ROUTE-PACKAGE.md). In a `description`, `{km}` and `{mi}` are replaced by the length of the loop (a comma as the decimal sign except in English, Japanese, Chinese and Korean). |
   | `author`, `license`, `source`, `defaultSpeed`, `revision` | Optional: `Walkflow`, `ODbL-1.0`, `© OpenStreetMap contributors (ODbL)`, 4, 1. Raise `revision` when a route that is already in the store changes. |
   | `sources` | Where the facts of the texts come from (addresses). Not written into the package, but kept so the next person can check them. |

3. **Run it** with the route-store checkout next to this repository, and look at the picture:

   ```
   node scripts/make-route.mjs scripts/route-specs/berlin-schlachtensee.json --root ../route-store --preview berlin.svg
   ```

   It prints the length, the number of pieces it could not route, and whether the loop closes. It stops (and writes nothing) if a
   piece could not be routed, the loop does not close, or its length is not within 80 to 120 % of the outline's: look at the picture,
   then change `step`, `snapDist`, `corr` or `pen`. A walk from one place to another stops if a piece could not be routed, a place is
   not within `snapDist` of a street, or the route is more than 1.8 times as long as the straight line between the places (a detour: add
   places to `path`, or lower `corr`); the picture then shows the straight line between the places in grey. `--streets` lists the names of the streets the route follows, in order, which is how to see whether it takes the street that is meant (a place without a name shows as `(no name)`). `--force` writes anyway. When it writes the file it runs the store check
   (`build-store.mjs --check --files-only`) on the checkout, so a file that was written has passed it.
4. **Waypoints and texts.** Take the coordinates of a place from OpenStreetMap (the waypoint has to be within 150 m of the route; the
   script says which one is not) and the facts from sources you have read, not from memory. Where sources disagree, say less (a decade
   instead of a year) rather than pick one. A name is up to 80 characters, a waypoint text up to 300, a description up to 1000; a longer
   one is refused. Keep the languages of the existing routes (`en`, `de`, `fr`, `uk`) and have the French and Ukrainian read.
5. **Open a pull request** in the route-store repository from a branch with that one route file only: one route per pull request
   (see [Reviewing a route](#reviewing-a-route)), and the CI of that repository writes a map of it into the pull request. `index.json` is written by CI
   after the merge.

The script asks Nominatim for one outline and Overpass for one area per route and keeps the answers in a folder in the temporary
folder of the system (`--cache`), so running it again asks for nothing. Overpass is often busy and answers `502`: the script tries
eight times with a growing pause, and running it again later is the way to go on. OpenStreetMap changes, so a run months later can give a
slightly different track from the file in the store; the file in the store is what counts. `tests/make-route.test.ts` tests the
pieces on a made-up lake, without the network, and checks that what the script writes is what the app itself would write.

## Reviewing a route

A pull request in the route-store repository takes **one route**, and the CI of that repository writes a **map of it** into the pull
request as a comment (GitHub shows a `geojson` code block as a map on OpenStreetMap), changed on every push. Both are done and
described in the route-store repository itself (its README, "Reviewing a route"; the scripts and their tests are in its `scripts/` and
`tests/`), so that the store does not depend on this repository for them. What belongs here is the making of a route: after
`make-route.mjs` has written the file, open its pull request with that one file and look at the map in it.

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
