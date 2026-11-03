// The connection to other devices: the only place that uses the Trystero library. It turns a meeting at the relays into a direct,
// encrypted WebRTC channel (see docs/P2P.md) and hands the rest of net/ the small `Room` of transport.ts. The library is loaded
// when a room is joined, not before, so a person who never shares does not load it.
//
// What this adds to the library's defaults: the relays are our own short list (and the content security policy allows exactly
// those); a device is admitted only after the handshake (it says it is Walkflow, in this version) and only while there is room;
// a single message may not be larger than a package can be.

import { RELAY_URLS } from '../platform/relays';
import { acceptsHandshake, HANDSHAKE } from './handshake';
import type { JoinOptions, Room, Transport } from './transport';

/** What goes over the channel: JSON, as the messages of the protocol are */
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

/** Trystero keeps rooms of different apps apart by this */
export const APP_ID = 'walkflow';
/** A package of 2,000,000 characters is at most 6 MB as text, and a little more with the escapes of JSON */
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const HANDSHAKE_TIMEOUT_MS = 10_000;

class TrysteroRoom implements Room {
  /** Who is here; a handler that is set later is told about them */
  readonly present = new Set<string>();
  private joinHandler: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  onMessage: ((peer: string, data: unknown) => void) | null = null;
  send: Room['send'] = () => undefined;
  leave: Room['leave'] = () => undefined;

  constructor(readonly selfId: string) {}

  get onPeerJoin() { return this.joinHandler; }
  set onPeerJoin(handler: ((peer: string) => void) | null) {
    this.joinHandler = handler;
    if (handler) for (const peer of [...this.present]) handler(peer);
  }

  joined(peer: string) { this.present.add(peer); this.joinHandler?.(peer); }
  left(peer: string) { this.present.delete(peer); this.onPeerLeave?.(peer); }
}

async function join(name: string, { password, maxPeers }: JoinOptions): Promise<Room> {
  const { joinRoom, selfId } = await import('trystero');
  const out = new TrysteroRoom(selfId);
  /** Devices that have passed the handshake and are in the room, and those still shaking hands */
  const admitted = new Set<string>();
  let pending = 0;

  const room = joinRoom(
    { appId: APP_ID, ...(password ? { password } : {}), maxReceiveBytes: MAX_MESSAGE_BYTES, relayConfig: { urls: [...RELAY_URLS] } },
    name,
    {
      handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
      // A device that does not say it is Walkflow, in this version, within the time is never let in; neither is one that is too many
      onPeerHandshake: async (_peer, send, receive, isInitiator) => {
        if (admitted.size + pending >= maxPeers) throw new Error('room full');
        pending++;
        try {
          if (isInitiator) {
            await send({ ...HANDSHAKE });
            if (!acceptsHandshake((await receive()).data)) throw new Error('not Walkflow');
          } else {
            if (!acceptsHandshake((await receive()).data)) throw new Error('not Walkflow');
            await send({ ...HANDSHAKE });
          }
        } finally {
          pending--;
        }
      },
    },
  );

  const action = room.makeAction<JsonValue>('share', { onReceive: ({ byteLength }) => byteLength <= MAX_MESSAGE_BYTES });
  action.onMessage = (data, { peerId }) => { if (admitted.has(peerId)) out.onMessage?.(peerId, data); };
  room.onPeerJoin = peer => { admitted.add(peer); out.joined(peer); };
  room.onPeerLeave = peer => { admitted.delete(peer); out.left(peer); };
  out.send = (peer, data) => { void action.send(data as JsonValue, { target: peer }).catch(() => undefined); };
  out.leave = () => room.leave();
  return out;
}

export function trysteroTransport(): Transport {
  return { join };
}
