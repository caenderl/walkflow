// The public relays through which two devices find each other for sharing (docs/P2P.md). Only a few lines of connection set-up
// go through them, never a package. They are listed here, and nowhere else, so that the content security policy allows exactly
// these and no others. Checked on 2026-11-03: each one accepted an ephemeral event and passed it on to a second connection;
// they run different software, so one fault does not stop all five. A relay that goes away or changes its rules is replaced here.

export const RELAY_URLS: readonly string[] = [
  'wss://nos.lol',
  'wss://relay.layer.systems',
  'wss://relay.piazza.today',
  'wss://nostr.christiansass.de',
  'wss://relay.bullishbounty.com',
];

/** The relays this build may connect to: none while Community is off */
export const sharingRelays = (community: boolean): readonly string[] => (community ? RELAY_URLS : []);
