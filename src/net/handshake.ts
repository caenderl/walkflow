// What two devices say to each other the moment they are connected, before they count as being in the room: that they are
// Walkflow and which version of the protocol they speak. It cannot prove that the other side really is Walkflow (nothing can),
// it keeps other programs and other versions out of the room; everything that follows is read strictly anyway.

import { SHARE_PROTOCOL } from '../core/share/protocol';

export const HANDSHAKE = { app: 'walkflow', protocol: SHARE_PROTOCOL } as const;

export function acceptsHandshake(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const v = data as Record<string, unknown>;
  return v.app === HANDSHAKE.app && v.protocol === HANDSHAKE.protocol;
}
