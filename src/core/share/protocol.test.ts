import { describe, expect, it } from 'vitest';
import {
  MAX_ITEM_CHARS, MAX_NAME_CHARS, MAX_OFFER_ITEMS, MAX_TOTAL_CHARS, readMessage, SHARE_PROTOCOL, ShareReceiver, ShareSender,
  type ShareItem, type ShareMessage,
} from './protocol';

const item = (id: string, text = `{"id":"${id}"}`, over: Partial<ShareItem> = {}): ShareItem => ({ id, kind: 'route', name: `Route ${id}`, chars: text.length, text, ...over });

describe('readMessage', () => {
  it('reads each kind of message', () => {
    expect(readMessage({ t: 'hello', v: 1 })).toEqual({ t: 'hello', v: 1 });
    expect(readMessage({ t: 'bye' })).toEqual({ t: 'bye' });
    expect(readMessage({ t: 'want', ids: ['a', 'b'] })).toEqual({ t: 'want', ids: ['a', 'b'] });
    expect(readMessage({ t: 'item', id: 'a', text: '{}' })).toEqual({ t: 'item', id: 'a', text: '{}' });
    expect(readMessage({ t: 'offer', items: [{ id: 'a', kind: 'workout', name: 'Easy', chars: 10 }] }))
      .toEqual({ t: 'offer', items: [{ id: 'a', kind: 'workout', name: 'Easy', chars: 10 }] });
  });

  it('refuses what is not a message, and unknown kinds', () => {
    for (const v of [null, undefined, 3, 'hello', [], {}, { t: 'run' }, { t: 'hello' }, { t: 'hello', v: 1.5 }, { t: 'hello', v: '1' }]) {
      expect(readMessage(v), JSON.stringify(v)).toBeNull();
    }
  });

  it('keeps only the known fields', () => {
    expect(readMessage({ t: 'hello', v: 1, speed: 20, extra: {} })).toEqual({ t: 'hello', v: 1 });
    const offer = readMessage({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'R', chars: 5, url: 'http://x' }] });
    expect(offer).toEqual({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'R', chars: 5 }] });
  });

  it('leaves out items that are not usable and repeated ids', () => {
    const msg = readMessage({ t: 'offer', items: [
      { id: 'ok', kind: 'route', name: 'Fine', chars: 5 },
      { id: 'ok', kind: 'route', name: 'Again', chars: 5 },
      { id: 'bad id!', kind: 'route', name: 'X', chars: 5 },
      { id: 'noname', kind: 'route', name: '  ', chars: 5 },
      { id: 'kind', kind: 'firmware', name: 'X', chars: 5 },
      { id: 'zero', kind: 'route', name: 'X', chars: 0 },
      { id: 'huge', kind: 'route', name: 'X', chars: MAX_ITEM_CHARS + 1 },
      { id: 'frac', kind: 'route', name: 'X', chars: 1.5 },
      'text',
    ] });
    expect(msg).toEqual({ t: 'offer', items: [{ id: 'ok', kind: 'route', name: 'Fine', chars: 5 }] });
  });

  it('shows names as plain text: control characters out, cut to length', () => {
    const msg = readMessage({ t: 'offer', items: [{ id: 'a', kind: 'route', name: `Line\u0000one\nand\u0007two ${'x'.repeat(200)}`, chars: 5 }] });
    const name = msg?.t === 'offer' ? msg.items[0]!.name : '';
    expect(name.startsWith('Line one and two xxx')).toBe(true);
    expect(name).not.toMatch(/[\u0000-\u001f]/);
    expect(name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });

  it('refuses too many items, bad ids and texts that are too long', () => {
    expect(readMessage({ t: 'offer', items: Array.from({ length: MAX_OFFER_ITEMS + 1 }, (_, i) => ({ id: `i${i}`, kind: 'route', name: 'R', chars: 5 })) })).toBeNull();
    expect(readMessage({ t: 'want', ids: ['../etc'] })).toBeNull();
    expect(readMessage({ t: 'want', ids: Array(MAX_OFFER_ITEMS + 1).fill('a') })).toBeNull();
    expect(readMessage({ t: 'item', id: 'a', text: 'x'.repeat(MAX_ITEM_CHARS + 1) })).toBeNull();
    expect(readMessage({ t: 'item', id: 'a', text: 5 })).toBeNull();
  });
});

/** Both sides, with what one sends handed to the other */
function exchange(items: ShareItem[], choose: (offered: readonly { id: string }[]) => string[]) {
  const sender = new ShareSender(items);
  const receiver = new ShareReceiver();
  const received: { id: string; text: string }[] = [];
  const toSender: ShareMessage[] = [receiver.hello()];
  let toReceiver: ShareMessage[] = [];
  let senderDone = false, receiverDone = false;
  const errors: string[] = [];
  const take = (step: { send: ShareMessage[]; done?: true; error?: string }, side: 'sender' | 'receiver') => {
    (side === 'sender' ? toReceiver : toSender).push(...step.send);
    if (step.error) errors.push(`${side}: ${step.error}`);
    if (step.done) { if (side === 'sender') senderDone = true; else receiverDone = true; }
  };
  for (let guard = 0; guard < 20 && (toSender.length || toReceiver.length); guard++) {
    while (toSender.length) take(sender.receive(toSender.shift()!), 'sender');
    const incoming = toReceiver; toReceiver = [];
    for (const msg of incoming) {
      const step = receiver.receive(msg);
      if (step.received) received.push({ id: step.received.item.id, text: step.received.text });
      take(step, 'receiver');
      if (msg.t === 'offer') take(receiver.want(choose(receiver.offeredItems)), 'receiver');
    }
  }
  return { received, errors, senderDone, receiverDone };
}

describe('an exchange', () => {
  const items = [item('a'), item('b', '{"b":2}'), item('c', '{"c":3}')];

  it('delivers exactly what the receiver asked for', () => {
    const r = exchange(items, () => ['a', 'c']);
    expect(r.received).toEqual([{ id: 'a', text: '{"id":"a"}' }, { id: 'c', text: '{"c":3}' }]);
    expect(r.errors).toEqual([]);
    expect(r.senderDone && r.receiverDone).toBe(true);
  });

  it('ends without a transfer when the receiver wants nothing', () => {
    const r = exchange(items, () => []);
    expect(r.received).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.senderDone && r.receiverDone).toBe(true);
  });

  it('offers the names and lengths, not the contents', () => {
    const sender = new ShareSender([item('a', '{"secret":1}')]);
    const [offer] = sender.receive({ t: 'hello', v: SHARE_PROTOCOL }).send;
    expect(offer).toEqual({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'Route a', chars: 12 }] });
    expect(JSON.stringify(offer)).not.toContain('secret');
  });

  it('announces the real length, whatever the item said', () => {
    const sender = new ShareSender([item('a', '{"x":1}', { chars: 3 })]);
    const [offer] = sender.receive({ t: 'hello', v: SHARE_PROTOCOL }).send;
    expect(offer).toMatchObject({ items: [{ chars: 7 }] });
  });
});

describe('ShareSender', () => {
  it('refuses another protocol version', () => {
    const step = new ShareSender([item('a')]).receive({ t: 'hello', v: SHARE_PROTOCOL + 1 });
    expect(step).toMatchObject({ error: 'version', done: true });
  });

  it('sends nothing before the receiver has said hello', () => {
    expect(new ShareSender([item('a')]).receive({ t: 'want', ids: ['a'] })).toMatchObject({ error: 'unexpected', send: [{ t: 'bye' }] });
  });

  it('refuses a request for something that was not offered, or the same item twice', () => {
    const ask = (ids: string[]) => {
      const s = new ShareSender([item('a')]);
      s.receive({ t: 'hello', v: SHARE_PROTOCOL });
      return s.receive({ t: 'want', ids });
    };
    expect(ask(['zzz'])).toMatchObject({ error: 'invalid', send: [{ t: 'bye' }] });
    expect(ask(['a', 'a'])).toMatchObject({ error: 'invalid' });
  });

  it('sends each item once: a second request is refused', () => {
    const s = new ShareSender([item('a')]);
    s.receive({ t: 'hello', v: SHARE_PROTOCOL });
    expect(s.receive({ t: 'want', ids: ['a'] }).send).toHaveLength(1);
    expect(s.receive({ t: 'want', ids: ['a'] })).toMatchObject({ error: 'unexpected' });
  });

  it('ignores everything once the exchange is over', () => {
    const s = new ShareSender([item('a')]);
    s.receive({ t: 'bye' });
    expect(s.receive({ t: 'hello', v: SHARE_PROTOCOL })).toEqual({ send: [], error: 'unexpected' });
  });

  it('offers at most the allowed number of items', () => {
    const many = Array.from({ length: MAX_OFFER_ITEMS + 5 }, (_, i) => item(`i${i}`));
    const [offer] = new ShareSender(many).receive({ t: 'hello', v: SHARE_PROTOCOL }).send;
    expect(offer?.t === 'offer' && offer.items).toHaveLength(MAX_OFFER_ITEMS);
  });
});

describe('ShareReceiver', () => {
  /** A receiver that has been offered the given items and has asked for them */
  const asked = (offered: { id: string; chars: number }[], ids = offered.map(o => o.id)) => {
    const r = new ShareReceiver();
    r.hello();
    r.receive({ t: 'offer', items: offered.map(o => ({ ...o, kind: 'route' as const, name: o.id })) });
    r.want(ids);
    return r;
  };

  it('takes in an item only when it was asked for', () => {
    const r = asked([{ id: 'a', chars: 2 }, { id: 'b', chars: 2 }], ['a']);
    expect(r.receive({ t: 'item', id: 'b', text: '{}' })).toMatchObject({ error: 'unexpected', done: true });
  });

  it('ends the exchange when an item is not the length it announced', () => {
    expect(asked([{ id: 'a', chars: 2 }]).receive({ t: 'item', id: 'a', text: '{"x":1}' })).toMatchObject({ error: 'tooLarge', done: true });
    expect(asked([{ id: 'a', chars: 20 }]).receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'tooLarge' });
  });

  it('does not take an item twice', () => {
    const r = asked([{ id: 'a', chars: 2 }, { id: 'b', chars: 2 }]);
    expect(r.receive({ t: 'item', id: 'a', text: '{}' }).received?.item.id).toBe('a');
    expect(r.receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'unexpected' });
  });

  it('takes in nothing before it has asked', () => {
    const r = new ShareReceiver();
    r.hello();
    r.receive({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'A', chars: 2 }] });
    expect(r.receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'unexpected' });
  });

  it('takes an offer only once, and only after hello', () => {
    const early = new ShareReceiver();
    expect(early.receive({ t: 'offer', items: [] })).toMatchObject({ error: 'unexpected' });
    const r = new ShareReceiver();
    r.hello();
    r.receive({ t: 'offer', items: [] });
    expect(r.receive({ t: 'offer', items: [] })).toMatchObject({ error: 'unexpected' });
  });

  it('refuses to ask for what was not offered', () => {
    const r = new ShareReceiver();
    r.hello();
    r.receive({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'A', chars: 2 }] });
    expect(r.want(['b'])).toMatchObject({ error: 'invalid', done: true });
  });

  it('refuses a transfer above the total limit before it starts', () => {
    const r = new ShareReceiver();
    r.hello();
    const per = MAX_ITEM_CHARS;
    r.receive({ t: 'offer', items: Array.from({ length: Math.ceil(MAX_TOTAL_CHARS / per) + 1 }, (_, i) => ({ id: `i${i}`, kind: 'route' as const, name: 'R', chars: per })) });
    expect(r.want(r.offeredItems.map(i => i.id))).toMatchObject({ error: 'tooLarge' });
  });

  it('ends with bye after the last item', () => {
    const r = asked([{ id: 'a', chars: 2 }]);
    expect(r.receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ send: [{ t: 'bye' }], done: true });
  });

  it('ignores everything once the exchange is over', () => {
    const r = asked([{ id: 'a', chars: 2 }]);
    r.receive({ t: 'bye' });
    expect(r.receive({ t: 'item', id: 'a', text: '{}' })).toEqual({ send: [], error: 'unexpected' });
  });
});
