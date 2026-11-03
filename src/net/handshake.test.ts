import { describe, expect, it } from 'vitest';
import { SHARE_PROTOCOL } from '../core/share/protocol';
import { acceptsHandshake, HANDSHAKE } from './handshake';

describe('acceptsHandshake', () => {
  it('accepts what a Walkflow of this version says', () => {
    expect(acceptsHandshake(HANDSHAKE)).toBe(true);
    expect(acceptsHandshake({ app: 'walkflow', protocol: SHARE_PROTOCOL, extra: 'later versions may add' })).toBe(true);
  });

  it('refuses another program, another version and anything that is not an object', () => {
    for (const v of [{ app: 'other', protocol: SHARE_PROTOCOL }, { app: 'walkflow', protocol: SHARE_PROTOCOL + 1 }, { app: 'walkflow', protocol: String(SHARE_PROTOCOL) },
      { app: 'walkflow' }, {}, null, undefined, 'walkflow', 1, [], [HANDSHAKE]]) {
      expect(acceptsHandshake(v), JSON.stringify(v)).toBe(false);
    }
  });
});
