# Sharing between devices (peer to peer)

Status: design, the pure core (`src/core/share/`) and both package formats are in; the connection and the screens are
still to do. The core was first written for sending to one person with a code and has been extended for the community mode below.

## What it is for

Find and take routes and workouts that other people share, directly from their devices, without an account and without a
server of the project. It is not for the treadmill: nobody who is connected to you can see, steer or stop your belt.
Running together, with live figures of the others, is a possible later step and would need its own design.

There are two ways to meet. Both use the same connection, the same messages and the same checks.

| | **Community** (main mode) | **Direct** (with a code) |
| --- | --- | --- |
| For | Finding what others share, without arranging anything | Sending something to one person, nobody else sees it |
| Meeting point | A public room per language | A room that only exists for the code |
| Who sees your offer | Everyone in the room, only if you switched it on | The person who has the code |
| Who sees your IP address | Everyone you are connected to | That person |

## Community: how devices find each other

A browser cannot find other devices on its own: there is no DHT and no mDNS for a web page. Two devices need a **meeting
point** where they first notice each other. That is the job of public relays; the data itself never goes through them (and
could not: a package can be 2 MB, the relays allow 64–128 KB per message).

1. **Opt-in.** Community is off. Switching it on says in one sentence who sees what (see "What the others learn").
2. **One room per language**, e.g. `walkflow/1/community/de` (the `1` is the protocol version). Everyone who has switched Community on joins the room of the
   language they chose (default: the language of the app). The library announces each device through the relays and the
   devices connect directly (WebRTC).
3. **Offers.** Over every connection each side sends what it shares: kind, name, place, size, SHA-256 of the file (the
   same identity a catalogue uses, see `ROUTE-PACKAGE.md`). The app merges them into one list with filters (kind,
   country, tags), shows how many devices have each item, and de-duplicates by hash.
4. **Taking.** You pick an offer; the app asks one device that has it. The package arrives as text, is read by the reader
   of its kind (`readPackage`, `readWorkoutPackage`), its SHA-256 is compared with the one that was offered, and you confirm
   before it is saved. Nothing is ever saved on its own.
5. **Present while it is on.** Because what you take is passed on, the device has to be in the room for that to mean anything:
   it joins when Community is switched on and the app is open, and leaves when you switch it off or close the app. It does
   not need the Community view to be open. The switch says so, and the number of connections is limited. (Decided: the
   alternative, being in the room only while the view is open, would expose you less but pass on almost nothing.)

### Offering

Nothing of your own is offered by default: in the list of your routes and workouts each item has a switch *Share with the
community*, off until you turn it on.

**What you take from the community is passed on automatically** while Community is switched on, so every device that
takes something becomes one more place to get it from, and an item stays available when the first person is offline. The
notice at the Community switch says so: *what you take, you pass on*. The rules:

- **Only what came from the community.** A package from a file or from a code is private; it is never offered on its own.
- **Identity is the bytes.** The hash of an item is the hash of the file as it is stored. If a device offered a file that
  differs from what everyone else has, it would be a different item. An item is saved with the hash it arrived with and is
  offered only while the file the app would write is byte-identical to it (the app writes a package the same way every time;
  a package that was made by another tool and would come out differently is saved, but not passed on).
- **Editing makes it your own.** Once you change a route or workout from the community, the file differs and it is no
  longer offered, unless you switch it on yourself.
- **Deleting stops it.** A deleted item is withdrawn from the offer at once (`update`; one that is asked for in the
  meantime is answered with `gone`).
- **It can be seen.** Another device that is connected to you can see that you have an item. That is the price of passing
  things on, and the reason it is only while Community is on.

### Size of a room

Every device in a room connects to every other (a browser handles a limited number of connections). With few people one room
per language is plenty. If it grows, rooms are split further (language and country: `…/de/AT`), which doubles as the
filter. A device limits itself to a fixed number of connections and ignores the rest.

## Direct: with a code

*Share* on an item shows a code such as `K7M2Q-XR4NT`; the receiver types it. Ten characters from an alphabet without
look-alikes (no `I L O 0 1`), about 49 bits. It is a one-time secret: not stored, valid while the dialog is open. From it
the app derives, in one slow step (PBKDF2, 600,000 rounds), the **room** (what the relay sees) and the **password** that
protects the set-up of the connection, with different prefixes, so the room says nothing about the password.

## The connection

[Trystero](https://github.com/dmotz/trystero) (MIT) with its Nostr strategy turns the meeting at a relay into a direct
WebRTC data channel, encrypted end to end.

- **Dependency**: `trystero` 0.26.0 (pinned), which pulls in `@trystero-p2p/nostr` and `@noble/secp256k1`; about 120 KB
  unpacked. Loaded only when a share or Community view opens.
- **Relays**: the library knows 29 public relays and picks five at random; five of them do not work for this (checked
  2026-11-03). We pin our own list (`relayConfig.urls`) and put exactly those hosts into the `connect-src` of the content
  security policy instead of allowing `wss:` everywhere. The list is a constant in `src/net/`; a relay that goes away is
  replaced there. A small script checks the list.
- **STUN**: by default Google (three servers) and Cloudflare, to find out how the device can be reached. They see the IP
  address of the device, like in any WebRTC call. Overridable with `rtcConfig`.

## What the others learn

- **Every device you are connected to** sees your IP address (WebRTC cannot avoid that) and what you offer. In the
  Community room that can be many people you do not know; with a code it is one person you chose.
- **The relays** see the room name, your IP address and when you connected, not what you share. In Community the room name
  is public, so a relay can tell that a device is looking at the Walkflow community.
- **The STUN servers** see your IP address.
- **Everything you took** from the community is offered again, so the devices you are connected to can tell what you have taken.

The switch for Community says this in one sentence, and the share dialog says it before the first connection.
The id the other devices see is random for each session, so a device cannot be followed from one visit to the next.

## Who can connect, and what protects what

**Can it be made sure that only Walkflow apps connect? No.** The app is open source and a web page has no way to prove to
another device what program it is: anyone can write a client that speaks WebRTC and the relay protocol, and say it is
Walkflow. So the design does not trust the other device at all. It is safe against whatever connects, and that is stronger
than checking who it is.

What keeps it tidy:

- **Own namespace.** The app id and the room names carry the protocol version (`walkflow/1/community/de`), so other apps that
  use the same library and relays do not end up in the room, and a later incompatible version gets its own rooms.
- **Handshake.** A device that is connected but does not say a valid `hello` within 10 seconds is dropped. A device that
  breaks a rule (unknown message, wrong order, over a limit, a hash that does not match) gets a `bye` and is ignored for the
  rest of the session. A device keeps only a fixed number of connections.
- **Strict reading of everything**, so a program that speaks something else can only fail.

What protects what:

| Threat | What stands against it |
| --- | --- |
| Someone listens to the data | A WebRTC data channel is encrypted (DTLS) between the two devices. The relay never sees an item. |
| Someone alters the connection set-up (a relay or a device in between) | **With a code:** the set-up is encrypted and authenticated with a key from the code (AES-GCM, by the library), which the relay does not have, so it cannot swap the connection's fingerprint. The code is stretched (PBKDF2, 600,000 rounds), so the room a relay sees is no shortcut to guessing it; 49 bits and a few minutes of validity make a live attack unrealistic. **In the community** there is no secret and the set-up can be intercepted: the community is for public data and does not rely on the channel. |
| Data is damaged or mixed up | The hash of what arrived is compared with the one that was offered. |
| A device offers something harmful | It is only ever text that goes through the reader of its format, with limits, with no path to the belt, and you confirm before it is saved. The hash does not help here: a hostile device offers the hash of its own file. |
| A device floods or blocks | The limits per connection and device (see below), a limit of connections, and ignoring those who break a rule. |
| Who made it | **Not proven.** `author` in a package is free text that anyone can write. Later: signatures of the author (Ed25519 in the browser's crypto) and a list of hashes in a catalogue that is signed by the project, which would mark an item as *verified*. Not part of the first version. |
| The app itself is tampered with | The content security policy allows connections to the pinned relays only; the library is pinned and in the lock file; nothing is loaded from elsewhere. |

What remains, and is said to the person: the devices you are connected to see your IP address, the relays see that you
connected, and in the community everyone can see what you offer and what you took.

## The messages (`core/share/protocol.ts`)

On one connection a device is two things at once: a **sharer** (it offers what it shares) and a **taker** (it asks for what
the other device offers). Each role is a state machine of its own (`ShareSender`, `ShareReceiver`), and `SharePeer` hands
every message to the role it is meant for (`sideOf`). Both are tested without a connection.

| Message | From | Meaning |
| --- | --- | --- |
| `hello {v}` | taker | I am here and speak version `v` |
| `offer {items}` | sharer | What I share now: `id`, `kind` (route, workout), `name`, `chars`, `sha256`, and for the list `place`, `country`, `tags`. A new offer replaces the old one. |
| `want {ids}` | taker | Of these, I take those |
| `item {id, text}` | sharer | The package, as text, in its file format |
| `gone {ids}` | sharer | These are not shared any more (an answer to a `want` that came too late) |
| `bye {role}` | both | I stop being a sharer or a taker; the role says which, so the two ends cannot be mixed up |

The rules:

- The sharer sends nothing before `hello`, and only what is asked for, each item once per connection.
- It tells the taker when what it shares changes (`update`), and answers a request for something that was offered but is
  gone now with `gone`, without ending the exchange. A request for something that was never offered ends it.
- The taker accepts only items it asked for, exactly as long as announced (`chars`). It asks for several items one request
  after another but **one transfer at a time** (`busy` is its own error, nothing is sent and the exchange goes on).
- Before an item is read, the taker compares its SHA-256 with the offered one (`matchesHash`); a mismatch ends the
  exchange (`rejectItem`).
- A misuse of our own side (a request for something that is gone, a second transfer) is refused locally and sends nothing.
  Only what the other side does wrong ends the exchange, with a `bye`.
- Names and places are cut and stripped of control characters; they are only ever shown as plain text.

### Limits (per connection and device)

| What | Limit |
| --- | --- |
| Items in an offer | 50 |
| Items in a request, or in a `gone` | 10 |
| Requests the sharer answers | 20 |
| One item | 2,000,000 characters |
| Everything one side sends to the other | 10,000,000 characters |

Anything above ends the exchange with an error (`tooLarge`, `invalid`, `unexpected`, `version`).

## Safety

- **No path to the belt.** Sharing code (`src/net/`, `src/core/share/`) may not import the FTMS commands
  (`core/protocol/`) or the treadmill connection (`device/`). `tests/architecture.test.ts` fails if it does.
- **Data, never code.** An item is text that goes through the same reader as a file. It cannot change speed limits or
  settings, and it starts nothing. A workout from someone else keeps your speed limit: its speeds are held to it.
- **Nothing on its own.** You pick, then confirm. No automatic import, no "accept all from this person".
- **Strangers can send offers.** So every limit above applies per device, the content is checked like a file, and what
  is offensive can only be hidden locally. A name is plain text. Items from the community are shown as *not verified*; a
  catalogue could later mark those whose SHA-256 it knows.
- **While the belt runs**, the share and Community views can be used like any other view, but a connection or a failure
  never touches the control path (display only, wrapped like the rest of the display code).

## What is still to do

Done: the share code, the messages and rules of the exchange (both roles on one connection, offers with hashes and limits,
check by hash), both package formats.

1. **The list** (`core/share/directory.ts`): merges the offers of all connected devices into one list, de-duplicated by
   hash, with the number of devices that have each item, filters (kind, country, tag, text) and the room per language.
   Pure and tested.
2. **Connection** in `src/net/`: a thin adapter around Trystero that turns the protocol's messages into data channel
   messages, with the pinned relay list; a room for a language and a room for a code. The library is loaded on demand.
   The handshake timeout, dropping and ignoring devices that break a rule, and the limit of connections belong here.
3. **What was taken from the community**: a route or workout is saved with the hash it arrived with and a mark that it came
   from the community; the offer is the marked items whose file is still byte-identical (a package written by the app comes out
   byte for byte the same when it is read and written again; this is tested for routes and workouts).
4. **Screens**: the Community view (switch with the one-sentence notice, list with filters, take), *Share with the
   community* on routes and workouts, *Share with a code* and *Receive with a code*. Texts in German, English and French.
5. **CSP** for the pinned relays in `src/platform/csp.ts` and a test for it; the script that checks the relays.
6. **Checks without hardware**: two browser tabs on one machine see each other in the room and exchange a route; a wrong
   code, a closed view and a stopped sender end cleanly.

## Later, maybe

- A catalogue of community routes (see `ROUTE-PACKAGE.md`): its list of hashes would mark items as verified and could name
  a place to fetch them when no device has them.
- Finding devices on the same network (mDNS) in the desktop app, without a relay.
- Running together with live figures. Others would only ever see figures; they would never control a belt.
