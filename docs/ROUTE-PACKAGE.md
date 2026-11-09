# Route package format

A route package is one JSON file that holds a route together with what goes with it: texts in several languages,
the place, credit and tags. It is what Walkflow exports with **Routes → ⋯ → Export as package** and reads with
**Routes → Import GPX file or route package**. It is meant for sharing a route as a file today, and for a catalogue and
peer-to-peer sharing later.

File extension: `.walkflow` (the same for [workout packages](WORKOUT-PACKAGE.md)). The content is JSON, UTF-8. The app recognises a package, and which kind, by its content, not by its extension.
The desktop app registers the extension with the system (own file icon, double click opens the file in Walkflow, which asks before it imports it); the icon is drawn by `scripts/make-icons.mjs`. Size: up to 2 MB (a route of a few thousand points is a few
hundred KB at most).

## Example

```json
{
  "format": "walkflow-route",
  "version": 1,
  "name": {
    "en": "Central Park Reservoir Loop",
    "de": "Central-Park-Reservoir-Runde",
    "fr": "Tour du réservoir de Central Park"
  },
  "place": {
    "en": "New York, USA",
    "de": "New York, USA",
    "fr": "New York, États-Unis"
  },
  "country": "US",
  "defaultSpeed": 4,
  "tags": ["park", "loop"],
  "author": "Name or handle",
  "license": "CC0-1.0",
  "source": "© OpenStreetMap contributors (ODbL)",
  "description": {
    "en": "Text in English.",
    "de": "Text auf Deutsch.",
    "fr": "Texte en français."
  },
  "points": [
    [40.782163, -73.962538],
    [40.782071, -73.962314]
  ]
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"walkflow-route"`. |
| `version` | yes | Whole number, `1` for this description. A package with a higher version is refused with a note to update the app. |
| `revision` | no | The version of this route's content, a whole number from 1 (without it: 1). Not the `version` of the format. Raise it when you change a route that others may have: a copy with a lower revision is offered an update in the [route store](ROUTE-STORE.md). A value that is not a whole number from 1 makes the package invalid. |
| `name` | yes | Language code → name (up to 80 characters each), at least one. The name without a known language (a name someone typed) has the key `"und"`. The app shows the language it is set to, else English, else the plain name of the route: the `"und"` one, else English, else the first language. |
| `waypoints` | no | Places along the route worth a word (a bridge, a view, where the path turns): a list of `{ "at": [lat, lon], "name": {…}, "text": {…} }`. `name` (up to 80 characters) and the optional `text` (up to 300) are language code → text like the route's own, and at most 50 waypoints are read. Where a waypoint is along the route is worked out from `at`: the nearest point of the route counts, and a waypoint more than 150 m from the route is left out. On a loop, a place at the start is taken as the start. The app shows them in the route's details, as markers on the map, and in the training view as "next: …" with the text when you are within 150 m. A waypoint that cannot be read is left out, the package is still accepted. |
| `points` | yes | `[lat, lon]` or `[lat, lon, ele]` (elevation in metres), 2 to 5000 points, together at least 10 m long. All points have an elevation or none. Latitude and longitude are written with up to 6 decimals, elevation with 1. |
| `place` | no | Language code → where it is, for browsing (up to 80 characters each). |
| `country` | no | ISO 3166-1 alpha-2, e.g. `"DE"`. Without it the app works it out from the start of the route. |
| `defaultSpeed` | no | A suggested walking speed in km/h (0.5 to 20). A suggestion only: the speed limit of the person still applies, and nothing in a package can change it. |
| `tags` | no | Up to 8 words of `a-z`, `0-9` and `-`, up to 24 characters each, for filtering. |
| `author` | no | Who made it (up to 80 characters). |
| `license` | no | Free text, e.g. an SPDX identifier (up to 80 characters). Whoever shares a package chooses it. |
| `source` | no | Where the track comes from, e.g. the attribution the data asks for (up to 200 characters). |
| `description` | no | Language code → text (up to 1000 characters each). The app shows the language it is set to, else English, else any other. The key `"und"` is for a text whose language is not known (a text the person wrote). |

Fields the format does not know are ignored, so a later version can add some. A package never contains an id or a
date: importing always makes a **new** route (new id, date of the import), so it can never replace a route that is
already there.

## Languages

`name`, `place` and `description` are all language → text. A language is its ISO 639 code and nothing else: two or three
lower-case letters (`en`, `de`, `fr`, `gsw`), no country and no script (not `de-CH`, not `ch_fr`). `und` stands for
"not known". Any number of languages can be in a package (the app reads up to 64 per field); languages the app is not
translated into are kept and written back on export, so a package passes through unchanged. A key that is not a language
code, or a text that is empty, is left out.

## What a package is not

It is data and never code. Reading it checks every field (the same check as for everything the app saves), cuts texts
to length and takes control characters out; texts are shown as plain text. It does not start anything and it
cannot change the safety settings, the speed limit or the way the belt is controlled. A route only displays progress.

Author, licence and source stay with the route when it is exported again, so the credit travels with it.

## For a catalogue

The [route store](ROUTE-STORE.md) is such a catalogue.

The identity of a package in a catalogue is the SHA-256 of the file as it is stored (the bytes, no re-formatting),
so an index can name it and the app can check what it downloaded. `serializePackage` writes one point per line, so a
change to a route shows line by line in a review.
