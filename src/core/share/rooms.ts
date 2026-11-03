// The names of the rooms two devices meet in, and how many devices a room may hold. The protocol version is part of the name, so a
// later version that cannot talk to this one gets rooms of its own, and other programs that use the same relays do not end up here.

import { SHARE_PROTOCOL } from './protocol';

/** Devices in the community room of a language. A browser handles a limited number of connections at a time. */
export const COMMUNITY_MAX_PEERS = 16;
/** Sending something to one person with a code: that person */
export const DIRECT_MAX_PEERS = 1;

/** The room for everyone who has switched Community on and chose this language (two or three lower-case letters; anything else is "und") */
export function communityRoom(lang: string): string {
  return `walkflow/${SHARE_PROTOCOL}/community/${/^[a-z]{2,3}$/.test(lang) ? lang : 'und'}`;
}

/** The room of a share code: `room` is what roomFromCode returns */
export function directRoom(room: string): string {
  return `walkflow/${SHARE_PROTOCOL}/direct/${room}`;
}
