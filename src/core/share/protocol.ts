// What two devices say to each other when one shares routes or workouts with the other. Transport-free: the connection
// (net/) hands messages in and sends what comes out. Nothing here touches the treadmill, and nothing is accepted that was not
// asked for: the receiver names what it wants, anything else is an error and ends the exchange. What arrives is text that is
// checked again by the reader of its format (readPackage and the like) before anything is saved.

export const SHARE_PROTOCOL = 1;
export const MAX_OFFER_ITEMS = 20;
/** One item: the same limit as a route package */
export const MAX_ITEM_CHARS = 2_000_000;
/** Everything of one exchange */
export const MAX_TOTAL_CHARS = 10_000_000;
export const MAX_NAME_CHARS = 80;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export type ItemKind = 'route' | 'workout';

/** What is offered, before anything is sent */
export interface OfferedItem {
  id: string;
  kind: ItemKind;
  name: string;
  /** Length of the text that will be sent, so the receiver can check it got all of it and nothing more */
  chars: number;
}

export type ShareMessage =
  | { t: 'hello'; v: number }
  | { t: 'offer'; items: OfferedItem[] }
  | { t: 'want'; ids: string[] }
  | { t: 'item'; id: string; text: string }
  | { t: 'bye' };

export type ShareError =
  /** The other side speaks another version */
  | 'version'
  /** A message that does not fit the state of the exchange, or was not asked for */
  | 'unexpected'
  /** A message that is not well formed, or names something that was not offered */
  | 'invalid'
  /** More than the limits allow, or not the length that was announced */
  | 'tooLarge';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Control characters out, cut to length: a name is shown as plain text */
function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS).trim() : '';
}

function readItem(v: unknown): OfferedItem | null {
  if (!isObject(v)) return null;
  const name = cleanName(v.name);
  if (typeof v.id !== 'string' || !ID_PATTERN.test(v.id) || (v.kind !== 'route' && v.kind !== 'workout') || !name) return null;
  if (typeof v.chars !== 'number' || !Number.isInteger(v.chars) || v.chars < 1 || v.chars > MAX_ITEM_CHARS) return null;
  return { id: v.id, kind: v.kind, name, chars: v.chars };
}

/** null = not a message of this protocol. Items that are not usable are left out of an offer (so are repeated ids). */
export function readMessage(v: unknown): ShareMessage | null {
  if (!isObject(v)) return null;
  switch (v.t) {
    case 'hello':
      return typeof v.v === 'number' && Number.isInteger(v.v) ? { t: 'hello', v: v.v } : null;
    case 'bye':
      return { t: 'bye' };
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
      return Array.isArray(v.ids) && v.ids.length <= MAX_OFFER_ITEMS && v.ids.every(id => typeof id === 'string' && ID_PATTERN.test(id))
        ? { t: 'want', ids: v.ids as string[] } : null;
    case 'item':
      return typeof v.id === 'string' && ID_PATTERN.test(v.id) && typeof v.text === 'string' && v.text.length <= MAX_ITEM_CHARS
        ? { t: 'item', id: v.id, text: v.text } : null;
    default:
      return null;
  }
}

export interface ShareItem extends OfferedItem {
  /** What is sent: a package in its file format */
  text: string;
}

export interface Step {
  /** Messages to send to the other side, in this order */
  send: ShareMessage[];
  /** The exchange is over (nothing more is accepted) */
  done?: true;
  error?: ShareError;
}

/** The side that shares. It offers what it was given and sends exactly what is asked for, once. */
export class ShareSender {
  private state: 'waiting' | 'offered' | 'sent' | 'closed' = 'waiting';
  private readonly items: ShareItem[];

  constructor(items: readonly ShareItem[]) {
    this.items = items.slice(0, MAX_OFFER_ITEMS).map(i => ({ ...i, chars: i.text.length }));
  }

  private fail(error: ShareError): Step {
    this.state = 'closed';
    return { send: [{ t: 'bye' }], done: true, error };
  }

  receive(msg: ShareMessage): Step {
    if (this.state === 'closed') return { send: [], error: 'unexpected' };
    if (msg.t === 'bye') { this.state = 'closed'; return { send: [], done: true }; }
    if (msg.t === 'hello' && this.state === 'waiting') {
      if (msg.v !== SHARE_PROTOCOL) return this.fail('version');
      this.state = 'offered';
      return { send: [{ t: 'offer', items: this.items.map(({ text: _text, ...offered }) => offered) }] };
    }
    if (msg.t === 'want' && this.state === 'offered') {
      const ids = msg.ids;
      if (new Set(ids).size !== ids.length || !ids.every(id => this.items.some(i => i.id === id))) return this.fail('invalid');
      this.state = 'sent';
      return { send: ids.map(id => ({ t: 'item' as const, id, text: this.items.find(i => i.id === id)!.text })) };
    }
    return this.fail('unexpected');
  }
}

/** The side that receives. It sees what is offered, asks for some of it, and takes in only that. */
export class ShareReceiver {
  private state: 'start' | 'waitingOffer' | 'offered' | 'receiving' | 'closed' = 'start';
  private offered: OfferedItem[] = [];
  private pending = new Map<string, OfferedItem>();
  private total = 0;

  private fail(error: ShareError): Step {
    this.state = 'closed';
    return { send: [{ t: 'bye' }], done: true, error };
  }

  /** The first message, when the connection is there */
  hello(): ShareMessage {
    this.state = 'waitingOffer';
    return { t: 'hello', v: SHARE_PROTOCOL };
  }

  /** What was offered, once it has arrived */
  get offeredItems(): readonly OfferedItem[] { return this.offered; }

  /** Asks for some of what was offered; nothing at all ends the exchange */
  want(ids: readonly string[]): Step {
    if (this.state !== 'offered') return this.fail('unexpected');
    if (new Set(ids).size !== ids.length || !ids.every(id => this.offered.some(i => i.id === id))) return this.fail('invalid');
    const chosen = ids.map(id => this.offered.find(i => i.id === id)!);
    if (chosen.reduce((sum, i) => sum + i.chars, 0) > MAX_TOTAL_CHARS) return this.fail('tooLarge');
    if (!chosen.length) { this.state = 'closed'; return { send: [{ t: 'bye' }], done: true }; }
    this.state = 'receiving';
    this.pending = new Map(chosen.map(i => [i.id, i]));
    return { send: [{ t: 'want', ids: [...ids] }] };
  }

  /** `received` is set when an item has arrived in full: the text is still to be checked by the reader of its format */
  receive(msg: ShareMessage): Step & { received?: { item: OfferedItem; text: string } } {
    if (this.state === 'closed') return { send: [], error: 'unexpected' };
    if (msg.t === 'bye') { this.state = 'closed'; return { send: [], done: true }; }
    if (msg.t === 'offer' && this.state === 'waitingOffer') {
      this.offered = msg.items;
      this.state = 'offered';
      return { send: [] };
    }
    if (msg.t === 'item' && this.state === 'receiving') {
      const item = this.pending.get(msg.id);
      if (!item) return this.fail('unexpected');
      this.total += msg.text.length;
      if (msg.text.length !== item.chars || this.total > MAX_TOTAL_CHARS) return this.fail('tooLarge');
      this.pending.delete(msg.id);
      if (this.pending.size) return { send: [], received: { item, text: msg.text } };
      this.state = 'closed';
      return { send: [{ t: 'bye' }], done: true, received: { item, text: msg.text } };
    }
    return this.fail('unexpected');
  }
}
