# Workout package format

A workout package is one JSON file that holds a workout together with what goes with it: the name and a description in
several languages, credit and tags. It works like the [route package](ROUTE-PACKAGE.md) and is meant for sharing a
workout as a file today, and for a catalogue and [sharing between devices](P2P.md) later.

File extension: `.walkflow`, the same as for a route package. The content is JSON, UTF-8. The app recognises the kind by
the `format` field, not by the extension. Size: up to 500,000 characters (200 steps are about 12 KB).

## Example

```json
{
  "format": "walkflow-workout",
  "version": 1,
  "name": {
    "en": "Easy intervals",
    "de": "Leichte Intervalle",
    "fr": "Fractionné léger"
  },
  "tags": ["intervals", "easy"],
  "author": "Name or handle",
  "license": "CC0-1.0",
  "source": "Where it comes from",
  "description": {
    "en": "Warm up, three easy intervals, cool down.",
    "de": "Aufwärmen, drei leichte Intervalle, Auslaufen."
  },
  "steps": [
    { "sec": 120, "speed": 2 },
    { "sec": 180, "speed": 3.5, "incline": 1 },
    { "meters": 400, "speed": 4 }
  ]
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"walkflow-workout"`. |
| `version` | yes | Whole number, `1` for this description. A package with a higher version is refused with a note to update the app. |
| `name` | yes | Language code → name (up to 60 characters each), at least one. `"und"` is a name without a known language (a name someone typed). The app shows its own language if there is one, else the plain name: the `"und"` one, else English, else the first language. |
| `steps` | yes | 1 to 200 steps, see below. |
| `description` | no | Language code → text (up to 1000 characters each). The app shows its own language, else a text without a language (`"und"`), else English, else any other. |
| `tags` | no | Up to 8 words of `a-z`, `0-9` and `-`, up to 24 characters each, for filtering. |
| `author` | no | Who made it (up to 80 characters). |
| `license` | no | Free text, e.g. an SPDX identifier (up to 80 characters). Whoever shares a package chooses it. |
| `source` | no | Where it comes from (up to 200 characters). |

### Steps

Each step is one of two things:

- `{ "sec": 120, "speed": 2 }`: a time (whole seconds, 0 to 86,400) at a speed.
- `{ "meters": 400, "speed": 4 }`: a distance (whole metres, up to 100,000) at a speed greater than 0, so the step can end.

`speed` is in km/h (0 to 30). `incline` is optional, in percent (−10 to 40); the app shows it but does not send it to the
treadmill. One step that is not usable makes the whole package invalid; the app does not guess what was meant.

Fields the format does not know are ignored, so a later version can add some. A package never contains an id or a date:
importing always makes a **new** workout (new id, date of the import), so it can never replace one that is there already.

## Languages

`name` and `description` are language → text, written as in the route package: a language is its ISO 639 code and nothing
else (`en`, `de`, `fr`, `gsw`, no `de-CH`), `und` stands for "not known". Languages the app is not translated into are
kept and written back on export. A key that is not a language code, or an empty text, is left out.

## What a package is not

It is data and never code. Reading it checks every field (the same check as for everything the app saves), cuts texts to
length and takes control characters out; texts are shown as plain text. It cannot change the safety settings, the speed
limit or the way the belt is controlled.

The speeds are those of the person who made it. **Your speed limit still applies**: when the workout runs, every step is
held to it, and the question before the start says so when a step is above the limit. A workout from someone else never
starts on its own: it is only ever selected, and starting it asks for confirmation like any other.

Author, licence and source stay with the workout when it is exported again, so the credit travels with it.
