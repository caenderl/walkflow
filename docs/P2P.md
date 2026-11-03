# Sharing between devices (peer to peer)

Status: design and the pure core are in (`src/core/share/`); the connection and the screens are still to do.

## What it is for

Send a route or a workout from one device to another, directly, without an account and without a server of the project.
It is not for the treadmill: nobody who is connected to you can see, steer or stop your belt. Running together, with live
figures of the others, is a possible later step and would need its own design.

## How it feels

1. **Sender**: *Share* on a route or workout. The app shows a code like `K7M2Q-XR4NT`. It stays valid while this
   dialog is open.
2. **Receiver**: *Receive*, types the code. Both devices connect.
3. The receiver sees **what is offered** (names and sizes) and picks what to take. Nothing arrives without being asked for.
4. What arrives is read and checked like an imported file, and the receiver confirms before it is saved (the same
   question as when a package is opened from outside).

## The code

Ten characters from an alphabet without look-alikes (no `I L O 0 1`), about 49 bits. It is a one-time secret: it is not
stored and it ends when the dialog closes. From it the app derives two things with different prefixes: the **room**
(a hash, what the relay sees) and the **password** that protects the set-up of the connection. A relay operator who sees
the room cannot get the password from it without guessing the whole code.

## How two devices find each other

WebRTC connects the devices directly. To start, they need a way to exchange a few lines of connection data, and there is
no server of the project for that, so a public relay carries them: the **Nostr** strategy of the library
[Trystero](https://github.com/dmotz/trystero) (MIT). After that, everything goes directly between the devices over an
encrypted channel; the relay never sees names, routes or workouts.

- **Dependency**: `trystero` 0.26.0 (pinned), which pulls in `@trystero-p2p/nostr` and `@noble/secp256k1`. About 120 KB
  unpacked in total. Added only when the connection is built, and only loaded when the person opens the share dialog.
- **Relays**: the library knows 29 public relays and picks five. We pin our own short list (`relayConfig.urls`) and put
  exactly those hosts into the `connect-src` of the content security policy instead of allowing `wss:` everywhere. The list
  is a constant in `src/net/`; a relay that goes away is replaced there.
- **STUN**: by default Google (three servers) and Cloudflare, to find out how the device can be reached. They see the IP
  address of the device, like any WebRTC call. Overridable with `rtcConfig`.

## What the other side learns

- The **other device** sees your IP address (WebRTC cannot avoid that) and what you offer.
- The **relay** sees the room hash, your IP address and when you connected, not what you share.
- The **STUN servers** see your IP address.

The share dialog says this in one sentence before the first connection.

## The messages (`core/share/protocol.ts`)

| Message | From | Meaning |
| --- | --- | --- |
| `hello {v}` | receiver | I am here and speak version `v` |
| `offer {items}` | sender | What I have: `id`, `kind` (route, workout), `name`, `chars` |
| `want {ids}` | receiver | Of these, I take those |
| `item {id, text}` | sender | The package, as text, in its file format |
| `bye` | both | Done or stopping |

The rules are in a state machine on each side and tested without a connection:

- The sender sends nothing before `hello`, and only what is asked for, once.
- The receiver accepts only items it asked for, exactly as long as announced (`chars`), at most 2,000,000 characters
  each and 10,000,000 in all, at most 20 items.
- Anything else ends the exchange with an error: unknown message, wrong order, other version.
- Names are cut and stripped of control characters; they are only ever shown as plain text.

## Safety

- **No path to the belt.** Sharing code (`src/net/`, `src/core/share/`) may not import the FTMS commands
  (`core/protocol/`) or the treadmill connection (`device/`). `tests/architecture.test.ts` fails if it does.
- **Data, never code.** An item is text that goes through the same reader as a file (`readPackage` for routes). It cannot
  change speed limits or settings, and it starts nothing.
- **Nothing on its own.** The receiver picks, then confirms. No automatic import, no "accept all from this person".
- **While the belt runs**, the share dialog can be used like any other dialog, but a connection or a failure never
  touches the control path (display only, wrapped like the rest of the display code).

## What is still to do

1. **Workout package** (`walkflow-workout`, like the route package: a language map for the name, the steps, author,
   licence), with a reader and tests. Until then only routes can be shared.
2. **Connection** in `src/net/`: a thin adapter around Trystero that turns the protocol's messages into data channel
   messages, with the pinned relay list. The library is loaded on demand.
3. **Screens**: *Share* in the route and workout lists, *Receive* in the menu, the dialog with code, status and the choice
   of what to take. Texts in German, English and French.
4. **CSP** for the pinned relays in `src/platform/csp.ts` and a test for it.
5. **Hardware-free checks**: two browser tabs on one machine exchange a route; a wrong code, a closed dialog and a stopped
   sender end cleanly.

## Later, maybe

- A catalogue of community routes (see `ROUTE-PACKAGE.md`), which would use the same packages.
- Running together with live figures. Others would only ever see figures; they would never control a belt.
