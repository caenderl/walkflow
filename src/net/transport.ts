// What the sharing code needs from a connection to other devices, without saying how it is made: a room that devices join, a
// way to send a message to one of them, and to hear when one comes, goes or sends something. The one implementation that
// talks to the network is in trystero-transport.ts; the rest of net/ and the tests use this.

export interface Room {
  /** Who we are in this room (random for each visit, so a device cannot be followed from one visit to the next) */
  readonly selfId: string;
  /** A device has joined and is ready (it has passed the handshake). A handler that is set later is told about the devices already there. */
  onPeerJoin: ((peer: string) => void) | null;
  onPeerLeave: ((peer: string) => void) | null;
  /** Something arrived from a device. Whatever it is, it is not trusted: the receiver reads it (readMessage). */
  onMessage: ((peer: string, data: unknown) => void) | null;
  /** Never throws; a message to a device that is gone is lost */
  send(peer: string, data: unknown): void;
  leave(): void;
}

export interface JoinOptions {
  /** Protects the set-up of the connection; devices with another password do not connect */
  password?: string;
  /** More devices than this are not admitted */
  maxPeers: number;
}

export interface Transport {
  join(room: string, options: JoinOptions): Promise<Room>;
}
