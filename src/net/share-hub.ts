// The sharing on a connection to many devices: it joins a room, runs a `SharePeer` for each device that is there, keeps the list
// of what they offer (`Directory`), offers what this device shares, and takes a file from a device that has it, one transfer at a
// time. Nothing here trusts a device: everything it sends is read and limited by the protocol, a file is compared with its hash
// before it is handed on, and a device that breaks a rule is told bye and ignored. It does not know how the connection is made
// (see transport.ts) and it cannot reach the treadmill.

import { Directory } from '../core/share/directory';
import { matchesHash } from '../core/share/hash';
import { readMessage, SharePeer, sideOf, type OfferedItem, type ShareItem, type ShareMessage, type TakerStep } from '../core/share/protocol';
import type { Room, Transport } from './transport';

export interface HubOptions {
  transport: Transport;
  room: string;
  /** Protects the set-up of the connection (a share code) */
  password?: string;
  /** Devices beyond this number are ignored */
  maxPeers: number;
  /** What this device shares */
  items: readonly ShareItem[];
  /** How long a device may take to send a file we asked it for */
  takeTimeoutMs?: number;
  /** Hashes the person has hidden before */
  hidden?: Iterable<string>;
  /** The list or the number of devices changed: the screen draws again */
  onChange?: () => void;
}

export type TakeResult =
  | { ok: true; item: OfferedItem; text: string; peer: string }
  /** No device could give it: none has it, they left, were too slow, or sent something else */
  | { ok: false; reason: 'unavailable' };

const DEFAULT_TAKE_TIMEOUT_MS = 60_000;

type Answer = { text: string } | 'gone' | 'timeout';

export class ShareHub {
  readonly directory: Directory;
  private room: Room | null = null;
  private stopped = false;
  private items: readonly ShareItem[];
  private readonly peers = new Map<string, SharePeer>();
  private readonly ignored = new Set<string>();
  private readonly waiting = new Map<string, (answer: Answer) => void>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: HubOptions) {
    this.directory = new Directory(options.hidden);
    this.items = options.items;
  }

  /** Our id in the room, for the other devices (random for each visit) */
  get selfId(): string { return this.room?.selfId ?? ''; }
  /** How many devices we are talking to */
  get peerCount(): number { return this.peers.size; }

  async start() {
    const room = await this.options.transport.join(this.options.room, { password: this.options.password, maxPeers: this.options.maxPeers });
    if (this.stopped) { room.leave(); return; }
    this.room = room;
    room.onPeerLeave = peer => this.drop(peer);
    room.onMessage = (peer, data) => this.receive(peer, data);
    room.onPeerJoin = peer => this.join(peer);
  }

  /** What this device shares has changed: every device is told */
  update(items: readonly ShareItem[]) {
    this.items = items;
    for (const [peer, p] of this.peers) this.send(peer, p.sender.update(items).send);
  }

  /** Says bye to everyone and leaves; nothing happens after this */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const peer of [...this.peers.keys()]) this.send(peer, [{ t: 'bye', role: 'sharer' }, { t: 'bye', role: 'taker' }]);
    this.peers.clear();
    this.answerAll('gone');
    this.room?.leave();
    this.room = null;
    this.changed();
  }

  /**
   * Takes the file with this hash from a device that has it. One transfer at a time, whatever is asked. The text is what the
   * device sent and has been compared with the hash; it still has to be read by the reader of its format before it is saved.
   */
  take(sha256: string): Promise<TakeResult> {
    const run = () => this.takeNow(sha256);
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async takeNow(sha256: string): Promise<TakeResult> {
    for (const { peer: id, id: itemId } of this.directory.candidates(sha256)) {
      if (this.stopped) break;
      const peer = this.peers.get(id);
      const offered = this.directory.offeredBy(id, itemId);
      if (!peer || !offered) continue;
      const step = peer.receiver.want([itemId]);
      if (step.error) continue;
      this.send(id, step.send);
      const answer = await this.waitFor(id, itemId);
      if (answer === 'timeout') { this.ignore(id); continue; }
      if (answer === 'gone') continue;
      if (!(await matchesHash(answer.text, offered.sha256))) { this.ignore(id); continue; }
      return { ok: true, item: offered, text: answer.text, peer: id };
    }
    return { ok: false, reason: 'unavailable' };
  }

  private waitFor(peer: string, id: string): Promise<Answer> {
    return new Promise(resolve => {
      const key = `${peer}\u0000${id}`;
      const timer = setTimeout(() => { this.waiting.delete(key); resolve('timeout'); }, this.options.takeTimeoutMs ?? DEFAULT_TAKE_TIMEOUT_MS);
      this.waiting.set(key, answer => { clearTimeout(timer); this.waiting.delete(key); resolve(answer); });
    });
  }

  private answerAll(answer: Answer, peer?: string) {
    for (const [key, resolve] of [...this.waiting]) if (peer === undefined || key.startsWith(`${peer}\u0000`)) resolve(answer);
  }

  private join(peer: string) {
    if (this.stopped || this.peers.has(peer) || this.ignored.has(peer)) return;
    if (this.peers.size >= this.options.maxPeers) { this.ignored.add(peer); return; }
    const p = new SharePeer(this.items);
    this.peers.set(peer, p);
    this.send(peer, p.open());
    this.changed();
  }

  private drop(peer: string) {
    const known = this.peers.delete(peer);
    this.directory.remove(peer);
    this.answerAll('gone', peer);
    if (known) this.changed();
  }

  /** A device that broke a rule, or does not answer: told bye, and not listened to again this visit */
  private ignore(peer: string) {
    this.ignored.add(peer);
    this.send(peer, [{ t: 'bye', role: 'sharer' }, { t: 'bye', role: 'taker' }]);
    this.drop(peer);
  }

  private receive(peer: string, data: unknown) {
    if (this.stopped || this.ignored.has(peer)) return;
    if (!this.peers.has(peer)) this.join(peer);
    const p = this.peers.get(peer);
    if (!p) return;
    const msg = readMessage(data);
    if (!msg) { this.ignore(peer); return; }
    const step = p.receive(msg) as TakerStep;
    this.send(peer, step.send);
    // Whatever the other side did wrong, the exchange with it is over
    if (step.error) { this.ignore(peer); return; }
    const fromSharer = sideOf(msg) === 'taker';
    if (step.received) this.waiting.get(`${peer}\u0000${step.received.item.id}`)?.({ text: step.received.text });
    if (step.gone) for (const id of step.gone) this.waiting.get(`${peer}\u0000${id}`)?.('gone');
    if (step.done && fromSharer) { this.directory.remove(peer); this.answerAll('gone', peer); this.changed(); return; }
    if (step.changed) { this.directory.update(peer, p.receiver.offeredItems); this.changed(); }
  }

  private send(peer: string, messages: readonly ShareMessage[]) {
    for (const m of messages) this.room?.send(peer, m);
  }

  private changed() {
    this.options.onChange?.();
  }
}
