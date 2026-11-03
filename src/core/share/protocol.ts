// What two devices say to each other when they share routes or workouts. Transport-free: the connection (net/) hands
// messages in and sends what comes out. Nothing here touches the treadmill, and nothing is accepted that was not asked for:
// the side that takes names what it wants, anything else is an error and ends the exchange. What arrives is text that is
// compared with the hash it was offered with and then checked again by the reader of its format (readPackage and the like)
// before anything is saved.
//
// On one connection a device is two things at once: a **sharer** (it offers what it shares) and a **taker** (it asks for
// what the other device offers). Each role has its own state machine, and a message says by its kind, or for `bye` by its
// role, which of the two it is meant for (`sideOf`).

import { TAG_KEY, ROUTE_TAGS_MAX } from '../routes/routes';

export const SHARE_PROTOCOL = 1;
/** In one offer: the most that one device shows to another */
export const MAX_OFFER_ITEMS = 50;
/** In one request, and in one notice that items are gone */
export const MAX_WANT_IDS = 10;
/** Requests the sharer answers on one connection: the other side cannot ask for ever */
export const MAX_WANTS = 20;
/** One item: the same limit as a route package */
export const MAX_ITEM_CHARS = 2_000_000;
/** Everything that is transferred in one direction on one connection */
export const MAX_TOTAL_CHARS = 10_000_000;
export const MAX_NAME_CHARS = 80;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export type ItemKind = 'route' | 'workout';
export type Role = 'sharer' | 'taker';

/** What is offered, before anything is sent: enough to show it in a list and to check it when it has arrived */
export interface OfferedItem {
  /** Only means something on this connection */
  id: string;
  kind: ItemKind;
  name: string;
  /** Length of the text that will be sent, so the taker can check it got all of it and nothing more */
  chars: number;
  /** SHA-256 of the text, lower-case hex: the same file has the same hash on every device */
  sha256: string;
  /** For the list and its filters */
  place?: string;
  /** ISO 3166-1 alpha-2 */
  country?: string;
  tags?: string[];
}

export type ShareMessage =
  | { t: 'hello'; v: number }
  | { t: 'offer'; items: OfferedItem[] }
  | { t: 'want'; ids: string[] }
  | { t: 'item'; id: string; text: string }
  /** These are no longer shared (they were in an offer, and are not any more) */
  | { t: 'gone'; ids: string[] }
  /** `role` is the role of the one who says it: it stops being a sharer or a taker */
  | { t: 'bye'; role: Role };

export type ShareError =
  /** The other side speaks another version */
  | 'version'
  /** A message that does not fit the state of the exchange, or was not asked for */
  | 'unexpected'
  /** A message that is not well formed, or names something that was not offered */
  | 'invalid'
  /** More than the limits allow, or not the length that was announced */
  | 'tooLarge'
  /** A request of our own that cannot be made now: another transfer is still on. The exchange goes on. */
  | 'busy'
  /** A request of our own for something that is not offered any more. The exchange goes on. */
  | 'gone';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Control characters out, cut to length: shown as plain text */
function cleanName(v: unknown, max = MAX_NAME_CHARS): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

function readItem(v: unknown): OfferedItem | null {
  if (!isObject(v)) return null;
  const name = cleanName(v.name);
  if (typeof v.id !== 'string' || !ID_PATTERN.test(v.id) || (v.kind !== 'route' && v.kind !== 'workout') || !name) return null;
  if (typeof v.chars !== 'number' || !Number.isInteger(v.chars) || v.chars < 1 || v.chars > MAX_ITEM_CHARS) return null;
  if (typeof v.sha256 !== 'string' || !HASH_PATTERN.test(v.sha256)) return null;
  const item: OfferedItem = { id: v.id, kind: v.kind, name, chars: v.chars, sha256: v.sha256 };
  const place = cleanName(v.place);
  if (place) item.place = place;
  if (typeof v.country === 'string' && COUNTRY_PATTERN.test(v.country)) item.country = v.country;
  if (Array.isArray(v.tags)) {
    const tags = [...new Set(v.tags.filter((t): t is string => typeof t === 'string' && TAG_KEY.test(t)))].slice(0, ROUTE_TAGS_MAX);
    if (tags.length) item.tags = tags;
  }
  return item;
}

const readIds = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= MAX_WANT_IDS && v.every(id => typeof id === 'string' && ID_PATTERN.test(id)) ? (v as string[]) : null;

/** null = not a message of this protocol. Items that are not usable are left out of an offer (so are repeated ids). */
export function readMessage(v: unknown): ShareMessage | null {
  if (!isObject(v)) return null;
  switch (v.t) {
    case 'hello':
      return typeof v.v === 'number' && Number.isInteger(v.v) ? { t: 'hello', v: v.v } : null;
    case 'bye':
      return v.role === 'sharer' || v.role === 'taker' ? { t: 'bye', role: v.role } : null;
    case 'offer': {
      if (!Array.isArray(v.items) || v.items.length > MAX_OFFER_ITEMS) return null;
      const items: OfferedItem[] = [];
      for (const raw of v.items as unknown[]) {
        const item = readItem(raw);
        if (item && !items.some(i => i.id === item.id)) items.push(item);
      }
      return { t: 'offer', items };
    }
    case 'want':
    case 'gone': {
      const ids = readIds(v.ids);
      return ids ? { t: v.t, ids } : null;
    }
    case 'item':
      return typeof v.id === 'string' && ID_PATTERN.test(v.id) && typeof v.text === 'string' && v.text.length <= MAX_ITEM_CHARS
        ? { t: 'item', id: v.id, text: v.text } : null;
    default:
      return null;
  }
}

/** Which role of the device that receives a message it is meant for */
export function sideOf(msg: ShareMessage): Role {
  switch (msg.t) {
    case 'hello':
    case 'want':
      return 'sharer';
    case 'bye':
      return msg.role === 'taker' ? 'sharer' : 'taker';
    default:
      return 'taker';
  }
}

export interface ShareItem extends OfferedItem {
  /** What is sent: a package in its file format */
  text: string;
}

export interface Step {
  /** Messages to send to the other side, in this order */
  send: ShareMessage[];
  /** The exchange of this role is over (nothing more is accepted) */
  done?: true;
  /** Without `done` the error is ours and nothing was sent: the exchange goes on */
  error?: ShareError;
}

/** The side that shares. It offers what it was given, sends exactly what is asked for, and each item once. */
export class ShareSender {
  private state: 'waiting' | 'active' | 'closed' = 'waiting';
  private items: ShareItem[] = [];
  /** Everything that was in an offer on this connection, also what is not any more */
  private readonly everOffered = new Set<string>();
  private readonly sent = new Set<string>();
  private wants = 0;
  private sentChars = 0;

  constructor(items: readonly ShareItem[] = []) {
    this.set(items);
  }

  private set(items: readonly ShareItem[]) {
    // What the other side would refuse is not offered
    this.items = items.filter(i => i.text.length >= 1 && i.text.length <= MAX_ITEM_CHARS).slice(0, MAX_OFFER_ITEMS).map(i => ({ ...i, chars: i.text.length }));
  }

  private offer(): ShareMessage {
    for (const i of this.items) this.everOffered.add(i.id);
    return { t: 'offer', items: this.items.map(({ text: _text, ...offered }) => offered) };
  }

  private fail(error: ShareError): Step {
    this.state = 'closed';
    return { send: [{ t: 'bye', role: 'sharer' }], done: true, error };
  }

  /** What is shared has changed: the other side gets the new offer, as soon as it has said hello */
  update(items: readonly ShareItem[]): Step {
    this.set(items);
    return { send: this.state === 'active' ? [this.offer()] : [] };
  }

  receive(msg: ShareMessage): Step {
    if (this.state === 'closed') return { send: [], error: 'unexpected' };
    if (msg.t === 'bye' && msg.role === 'taker') { this.state = 'closed'; return { send: [], done: true }; }
    if (msg.t === 'hello' && this.state === 'waiting') {
      if (msg.v !== SHARE_PROTOCOL) return this.fail('version');
      this.state = 'active';
      return { send: [this.offer()] };
    }
    if (msg.t === 'want' && this.state === 'active') return this.answer(msg.ids);
    return this.fail('unexpected');
  }

  private answer(ids: string[]): Step {
    if (++this.wants > MAX_WANTS) return this.fail('tooLarge');
    if (new Set(ids).size !== ids.length || !ids.every(id => this.everOffered.has(id) && !this.sent.has(id))) return this.fail('invalid');
    const have = ids.map(id => this.items.find(i => i.id === id)).filter((i): i is ShareItem => i !== undefined);
    const gone = ids.filter(id => !have.some(i => i.id === id));
    const chars = have.reduce((sum, i) => sum + i.text.length, 0);
    if (this.sentChars + chars > MAX_TOTAL_CHARS) return this.fail('tooLarge');
    this.sentChars += chars;
    for (const i of have) this.sent.add(i.id);
    return { send: [...have.map(i => ({ t: 'item' as const, id: i.id, text: i.text })), ...(gone.length ? [{ t: 'gone' as const, ids: gone }] : [])] };
  }
}

export interface TakerStep extends Step {
  /** An item has arrived in full: the text is still to be compared with its hash and read by the reader of its format */
  received?: { item: OfferedItem; text: string };
  /** The list of what is offered has changed */
  changed?: true;
  /** Items that the other side does not share any more */
  gone?: string[];
}

/** The side that takes. It sees what is offered, asks for some of it, one transfer at a time, and takes in only that. */
export class ShareReceiver {
  private state: 'start' | 'waitingOffer' | 'idle' | 'receiving' | 'closed' = 'start';
  private offered: OfferedItem[] = [];
  private readonly requested = new Set<string>();
  private pending = new Map<string, OfferedItem>();
  private total = 0;

  private fail(error: ShareError): Step {
    this.state = 'closed';
    return { send: [{ t: 'bye', role: 'taker' }], done: true, error };
  }

  /** The first message, when the connection is there */
  hello(): ShareMessage {
    this.state = 'waitingOffer';
    return { t: 'hello', v: SHARE_PROTOCOL };
  }

  /** What is offered now */
  get offeredItems(): readonly OfferedItem[] { return this.offered; }

  /** A transfer is on: nothing else can be asked for until it is over */
  get busy(): boolean { return this.state === 'receiving'; }

  /**
   * Asks for some of what is offered. A request that cannot be made (not offered any more, one transfer already on, too much)
   * is refused here and nothing is sent: the exchange goes on.
   */
  want(ids: readonly string[]): Step {
    if (this.state === 'receiving') return { send: [], error: 'busy' };
    if (this.state !== 'idle') return { send: [], error: 'unexpected' };
    if (!ids.length) return { send: [] };
    if (ids.length > MAX_WANT_IDS || new Set(ids).size !== ids.length || ids.some(id => this.requested.has(id))) return { send: [], error: 'invalid' };
    const chosen = ids.map(id => this.offered.find(i => i.id === id));
    if (chosen.some(i => i === undefined)) return { send: [], error: 'gone' };
    const items = chosen as OfferedItem[];
    if (this.total + items.reduce((sum, i) => sum + i.chars, 0) > MAX_TOTAL_CHARS) return { send: [], error: 'tooLarge' };
    this.state = 'receiving';
    this.pending = new Map(items.map(i => [i.id, i]));
    for (const id of ids) this.requested.add(id);
    return { send: [{ t: 'want', ids: [...ids] }] };
  }

  receive(msg: ShareMessage): TakerStep {
    if (this.state === 'closed') return { send: [], error: 'unexpected' };
    if (msg.t === 'bye' && msg.role === 'sharer') { this.state = 'closed'; return { send: [], done: true }; }
    if (msg.t === 'offer' && this.state !== 'start') {
      this.offered = msg.items;
      if (this.state === 'waitingOffer') this.state = 'idle';
      return { send: [], changed: true };
    }
    if (msg.t === 'item' && this.state === 'receiving') {
      const item = this.pending.get(msg.id);
      if (!item) return this.fail('unexpected');
      // The total cannot go over its limit here: want() asked for no more than what was left
      if (msg.text.length !== item.chars) return this.fail('tooLarge');
      this.total += msg.text.length;
      this.pending.delete(msg.id);
      if (!this.pending.size) this.state = 'idle';
      return { send: [], received: { item, text: msg.text } };
    }
    if (msg.t === 'gone' && (this.state === 'idle' || this.state === 'receiving')) {
      for (const id of msg.ids) this.pending.delete(id);
      this.offered = this.offered.filter(i => !msg.ids.includes(i.id));
      if (this.state === 'receiving' && !this.pending.size) this.state = 'idle';
      return { send: [], gone: msg.ids, changed: true };
    }
    return this.fail('unexpected');
  }

  /** The text of an item did not match the hash it was offered with: the other side is not to be trusted, the exchange ends */
  rejectItem(): Step {
    return this.fail('invalid');
  }

  /** The person is done: this device stops taking */
  leave(): Step {
    const was = this.state;
    this.state = 'closed';
    return was === 'closed' ? { send: [], done: true } : { send: [{ t: 'bye', role: 'taker' }], done: true };
  }
}

export type PeerStep = Step | TakerStep;

/** A device on a connection: it shares and takes at the same time, and hands each message to the role it is meant for */
export class SharePeer {
  readonly sender: ShareSender;
  readonly receiver = new ShareReceiver();

  constructor(items: readonly ShareItem[] = []) {
    this.sender = new ShareSender(items);
  }

  /** What to send when the connection is there */
  open(): ShareMessage[] {
    return [this.receiver.hello()];
  }

  receive(msg: ShareMessage): PeerStep {
    return sideOf(msg) === 'sharer' ? this.sender.receive(msg) : this.receiver.receive(msg);
  }
}
