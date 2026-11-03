import { describe, expect, it } from 'vitest';
import { communityRoom, COMMUNITY_MAX_PEERS, directRoom, DIRECT_MAX_PEERS } from './rooms';
import { SHARE_PROTOCOL } from './protocol';

describe('rooms', () => {
  it('names the community room after the protocol version and the language', () => {
    expect(communityRoom('de')).toBe(`walkflow/${SHARE_PROTOCOL}/community/de`);
    expect(communityRoom('gsw')).toBe(`walkflow/${SHARE_PROTOCOL}/community/gsw`);
  });

  it('puts anything that is not a language code into one room, so a strange value cannot make a room of its own', () => {
    for (const lang of ['', 'DE', 'de-CH', 'deu1', '../x', 'a b']) expect(communityRoom(lang), lang).toBe(`walkflow/${SHARE_PROTOCOL}/community/und`);
  });

  it('keeps the room of a code apart from the community rooms', () => {
    expect(directRoom('0123abcd')).toBe(`walkflow/${SHARE_PROTOCOL}/direct/0123abcd`);
    expect(directRoom('x')).not.toBe(communityRoom('x'));
  });

  it('allows one device in a room of a code, and a limited number in the community', () => {
    expect(DIRECT_MAX_PEERS).toBe(1);
    expect(COMMUNITY_MAX_PEERS).toBeGreaterThan(1);
    expect(COMMUNITY_MAX_PEERS).toBeLessThanOrEqual(32);
  });
});
