import { describe, expect, it } from 'vitest';
import {
  MAX_ITEM_CHARS, MAX_NAME_CHARS, MAX_OFFER_ITEMS, MAX_TOTAL_CHARS, MAX_WANT_IDS, MAX_WANTS, readMessage, SHARE_PROTOCOL, SharePeer,
  ShareReceiver, ShareSender, sideOf, type OfferedItem, type ShareItem, type ShareMessage, type Step,
} from './protocol';

const SHA = 'a'.repeat(64);
const item = (id: string, text = `{"id":"${id}"}`, over: Partial<ShareItem> = {}): ShareItem => ({ id, kind: 'route', name: `Route ${id}`, sha256: SHA, chars: text.length, text, ...over });
const offered = (id: string, chars = 2, over: Partial<OfferedItem> = {}): OfferedItem => ({ id, kind: 'route', name: id, chars, sha256: SHA, ...over });
const HELLO: ShareMessage = { t: 'hello', v: SHARE_PROTOCOL };

describe('readMessage', () => {
  it('reads each kind of message', () => {
    expect(readMessage({ t: 'hello', v: 1 })).toEqual({ t: 'hello', v: 1 });
    expect(readMessage({ t: 'bye', role: 'taker' })).toEqual({ t: 'bye', role: 'taker' });
    expect(readMessage({ t: 'bye', role: 'sharer' })).toEqual({ t: 'bye', role: 'sharer' });
    expect(readMessage({ t: 'want', ids: ['a', 'b'] })).toEqual({ t: 'want', ids: ['a', 'b'] });
    expect(readMessage({ t: 'gone', ids: ['a'] })).toEqual({ t: 'gone', ids: ['a'] });
    expect(readMessage({ t: 'item', id: 'a', text: '{}' })).toEqual({ t: 'item', id: 'a', text: '{}' });
    expect(readMessage({ t: 'offer', items: [{ id: 'a', kind: 'workout', name: 'Easy', chars: 10, sha256: SHA }] }))
      .toEqual({ t: 'offer', items: [{ id: 'a', kind: 'workout', name: 'Easy', chars: 10, sha256: SHA }] });
  });

  it('refuses what is not a message, and a bye without a role', () => {
    for (const v of [null, undefined, 3, 'hello', [], {}, { t: 'run' }, { t: 'hello' }, { t: 'hello', v: 1.5 }, { t: 'hello', v: '1' }, { t: 'bye' }, { t: 'bye', role: 'both' }]) {
      expect(readMessage(v), JSON.stringify(v)).toBeNull();
    }
  });

  it('keeps only the known fields', () => {
    expect(readMessage({ t: 'hello', v: 1, speed: 20, extra: {} })).toEqual({ t: 'hello', v: 1 });
    const offer = readMessage({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'R', chars: 5, sha256: SHA, url: 'http://x', speed: 30 }] });
    expect(offer).toEqual({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'R', chars: 5, sha256: SHA }] });
  });

  it('reads the place, country and tags an offer carries for the list, and drops what is not usable', () => {
    const offer = readMessage({ t: 'offer', items: [{
      id: 'a', kind: 'route', name: 'R', chars: 5, sha256: SHA,
      place: 'Hamburg,\u0000 Germany', country: 'DE', tags: ['park', 'Bad Tag', 'park', 'loop'],
    }, {
      id: 'b', kind: 'route', name: 'R', chars: 5, sha256: SHA, place: '   ', country: 'Germany', tags: 'park',
    }] });
    expect(offer).toEqual({ t: 'offer', items: [
      { id: 'a', kind: 'route', name: 'R', chars: 5, sha256: SHA, place: 'Hamburg, Germany', country: 'DE', tags: ['park', 'loop'] },
      { id: 'b', kind: 'route', name: 'R', chars: 5, sha256: SHA },
    ] });
  });

  it('leaves out items that are not usable and repeated ids', () => {
    const msg = readMessage({ t: 'offer', items: [
      { id: 'ok', kind: 'route', name: 'Fine', chars: 5, sha256: SHA },
      { id: 'ok', kind: 'route', name: 'Again', chars: 5, sha256: SHA },
      { id: 'bad id!', kind: 'route', name: 'X', chars: 5, sha256: SHA },
      { id: 'noname', kind: 'route', name: '  ', chars: 5, sha256: SHA },
      { id: 'kind', kind: 'firmware', name: 'X', chars: 5, sha256: SHA },
      { id: 'zero', kind: 'route', name: 'X', chars: 0, sha256: SHA },
      { id: 'huge', kind: 'route', name: 'X', chars: MAX_ITEM_CHARS + 1, sha256: SHA },
      { id: 'frac', kind: 'route', name: 'X', chars: 1.5, sha256: SHA },
      { id: 'nohash', kind: 'route', name: 'X', chars: 5 },
      { id: 'short', kind: 'route', name: 'X', chars: 5, sha256: 'abc' },
      { id: 'upper', kind: 'route', name: 'X', chars: 5, sha256: 'A'.repeat(64) },
      'text',
    ] });
    expect(msg).toEqual({ t: 'offer', items: [{ id: 'ok', kind: 'route', name: 'Fine', chars: 5, sha256: SHA }] });
  });

  it('shows names as plain text: control characters out, cut to length', () => {
    const msg = readMessage({ t: 'offer', items: [{ id: 'a', kind: 'route', name: `Line\u0000one\nand\u0007two ${'x'.repeat(200)}`, chars: 5, sha256: SHA }] });
    const name = msg?.t === 'offer' ? msg.items[0]!.name : '';
    expect(name.startsWith('Line one and two xxx')).toBe(true);
    // oxlint-disable-next-line no-control-regex -- checks that the control characters are gone
    expect(name).not.toMatch(/[\u0000-\u001f]/);
    expect(name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });

  it('refuses too many items, bad ids and texts that are too long', () => {
    expect(readMessage({ t: 'offer', items: Array.from({ length: MAX_OFFER_ITEMS + 1 }, (_, i) => ({ id: `i${i}`, kind: 'route', name: 'R', chars: 5, sha256: SHA })) })).toBeNull();
    expect(readMessage({ t: 'want', ids: ['../etc'] })).toBeNull();
    expect(readMessage({ t: 'want', ids: Array.from({ length: MAX_WANT_IDS + 1 }, (_, i) => `i${i}`) })).toBeNull();
    expect(readMessage({ t: 'gone', ids: Array.from({ length: MAX_WANT_IDS + 1 }, (_, i) => `i${i}`) })).toBeNull();
    expect(readMessage({ t: 'item', id: 'a', text: 'x'.repeat(MAX_ITEM_CHARS + 1) })).toBeNull();
    expect(readMessage({ t: 'item', id: 'a', text: 5 })).toBeNull();
  });
});

describe('sideOf', () => {
  it('says which side a message is for: what the taker sends goes to the sharer and the other way round', () => {
    expect(sideOf({ t: 'hello', v: 1 })).toBe('sharer');
    expect(sideOf({ t: 'want', ids: ['a'] })).toBe('sharer');
    expect(sideOf({ t: 'offer', items: [] })).toBe('taker');
    expect(sideOf({ t: 'item', id: 'a', text: '{}' })).toBe('taker');
    expect(sideOf({ t: 'gone', ids: ['a'] })).toBe('taker');
  });

  it('settles a bye by who says it, which is what made it ambiguous on a connection that goes both ways', () => {
    expect(sideOf({ t: 'bye', role: 'taker' })).toBe('sharer');
    expect(sideOf({ t: 'bye', role: 'sharer' })).toBe('taker');
  });
});

describe('ShareSender', () => {
  const ready = (items: ShareItem[] = [item('a'), item('b', '{"b":2}'), item('c', '{"c":3}')]) => {
    const s = new ShareSender(items);
    s.receive(HELLO);
    return s;
  };

  it('refuses another protocol version', () => {
    expect(new ShareSender([item('a')]).receive({ t: 'hello', v: SHARE_PROTOCOL + 1 })).toMatchObject({ error: 'version', done: true });
  });

  it('sends nothing before the other side has said hello', () => {
    expect(new ShareSender([item('a')]).receive({ t: 'want', ids: ['a'] })).toMatchObject({ error: 'unexpected', send: [{ t: 'bye', role: 'sharer' }] });
  });

  it('offers names, lengths and hashes, not the contents', () => {
    const [offer] = new ShareSender([item('a', '{"secret":1}', { place: 'Hamburg', country: 'DE', tags: ['park'] })]).receive(HELLO).send;
    expect(offer).toEqual({ t: 'offer', items: [{ id: 'a', kind: 'route', name: 'Route a', chars: 12, sha256: SHA, place: 'Hamburg', country: 'DE', tags: ['park'] }] });
    expect(JSON.stringify(offer)).not.toContain('secret');
  });

  it('announces the real length, whatever the item said', () => {
    const [offer] = new ShareSender([item('a', '{"x":1}', { chars: 3 })]).receive(HELLO).send;
    expect(offer).toMatchObject({ items: [{ chars: 7 }] });
  });

  it('offers at most the allowed number of items', () => {
    const many = Array.from({ length: MAX_OFFER_ITEMS + 5 }, (_, i) => item(`i${i}`));
    const [offer] = new ShareSender(many).receive(HELLO).send;
    expect(offer?.t === 'offer' && offer.items).toHaveLength(MAX_OFFER_ITEMS);
  });

  it('sends exactly what was asked for, over several requests', () => {
    const s = ready();
    expect(s.receive({ t: 'want', ids: ['a'] }).send).toEqual([{ t: 'item', id: 'a', text: '{"id":"a"}' }]);
    expect(s.receive({ t: 'want', ids: ['c', 'b'] }).send).toEqual([{ t: 'item', id: 'c', text: '{"c":3}' }, { t: 'item', id: 'b', text: '{"b":2}' }]);
  });

  it('refuses a request for something that was never offered, or for the same item twice in one request', () => {
    expect(ready().receive({ t: 'want', ids: ['zzz'] })).toMatchObject({ error: 'invalid', done: true, send: [{ t: 'bye', role: 'sharer' }] });
    expect(ready().receive({ t: 'want', ids: ['a', 'a'] })).toMatchObject({ error: 'invalid', done: true });
  });

  it('sends an item again when it is asked for again (a person who deleted it takes it back), within the limits of the connection', () => {
    const s = ready();
    const first = s.receive({ t: 'want', ids: ['a'] });
    const again = s.receive({ t: 'want', ids: ['a'] });
    expect(again.error).toBeUndefined();
    expect(again.send).toEqual(first.send);
  });

  it('allows only a limited number of requests on a connection', () => {
    const s = ready(Array.from({ length: MAX_WANTS + 2 }, (_, i) => item(`i${i}`)));
    for (let i = 0; i < MAX_WANTS; i++) expect(s.receive({ t: 'want', ids: [`i${i}`] }).error, `request ${i}`).toBeUndefined();
    expect(s.receive({ t: 'want', ids: [`i${MAX_WANTS}`] })).toMatchObject({ error: 'tooLarge', done: true });
  });

  it('sends no more than the total limit on a connection', () => {
    const big = 'x'.repeat(MAX_ITEM_CHARS - 10);
    const s = ready(Array.from({ length: 7 }, (_, i) => item(`i${i}`, big)));
    for (let i = 0; i < 5; i++) expect(s.receive({ t: 'want', ids: [`i${i}`] }).error, `item ${i}`).toBeUndefined();
    expect(5 * big.length).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(s.receive({ t: 'want', ids: ['i5'] })).toMatchObject({ error: 'tooLarge', done: true });
  });

  it('sends a new offer when what is shared changes, and nothing before hello', () => {
    const s = new ShareSender([item('a')]);
    expect(s.update([item('a'), item('b')])).toEqual({ send: [] });
    s.receive(HELLO);
    const step = s.update([item('c')]);
    expect(step.send).toMatchObject([{ t: 'offer', items: [{ id: 'c' }] }]);
  });

  it('sends no new offer when the offer has not changed (the library changes for other reasons all the time)', () => {
    const s = ready([item('a'), item('b', '{"b":2}')]);
    expect(s.update([item('a'), item('b', '{"b":2}')])).toEqual({ send: [] });
    expect(s.update([item('a'), item('b', '{"b":2}')])).toEqual({ send: [] });
    // a change in the offer is sent, and the new state is the one that is compared with from then on
    expect(s.update([item('a')]).send).toMatchObject([{ t: 'offer', items: [{ id: 'a' }] }]);
    expect(s.update([item('a')])).toEqual({ send: [] });
    expect(s.update([item('a'), item('b', '{"b":2}')]).send).toHaveLength(1);
  });

  it('answers a request for something that is no longer shared with gone, and sends the rest', () => {
    const s = ready();
    s.update([item('b', '{"b":2}')]);
    const step = s.receive({ t: 'want', ids: ['a', 'b'] });
    expect(step.error).toBeUndefined();
    expect(step.send).toEqual([{ t: 'item', id: 'b', text: '{"b":2}' }, { t: 'gone', ids: ['a'] }]);
  });

  it('knows an id that was offered once even after it left the offer, but not one that never was', () => {
    const s = ready();
    s.update([]);
    expect(s.receive({ t: 'want', ids: ['a'] }).send).toEqual([{ t: 'gone', ids: ['a'] }]);
    expect(s.receive({ t: 'want', ids: ['never'] })).toMatchObject({ error: 'invalid', done: true });
  });

  it('ends when the other side leaves, and ignores everything after', () => {
    const s = ready();
    expect(s.receive({ t: 'bye', role: 'taker' })).toEqual({ send: [], done: true });
    expect(s.receive({ t: 'want', ids: ['a'] })).toEqual({ send: [], error: 'unexpected' });
  });

  it('refuses a second hello and messages meant for the other side', () => {
    expect(ready().receive(HELLO)).toMatchObject({ error: 'unexpected', done: true });
    expect(ready().receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'unexpected', done: true });
    expect(ready().receive({ t: 'bye', role: 'sharer' })).toMatchObject({ error: 'unexpected', done: true });
  });
});

describe('ShareReceiver', () => {
  /** A receiver that has been offered the given items */
  const offeredTo = (items: OfferedItem[]) => {
    const r = new ShareReceiver();
    r.hello();
    r.receive({ t: 'offer', items });
    return r;
  };
  /** One that has also asked for some of them */
  const asked = (items: OfferedItem[], ids = items.map(i => i.id)) => {
    const r = offeredTo(items);
    r.want(ids);
    return r;
  };

  it('starts with hello and takes the first offer', () => {
    const r = new ShareReceiver();
    expect(r.hello()).toEqual(HELLO);
    expect(r.receive({ t: 'offer', items: [offered('a')] })).toMatchObject({ send: [], changed: true });
    expect(r.offeredItems).toEqual([offered('a')]);
  });

  it('takes a newer offer in place of the old one, also while a transfer is on', () => {
    const r = asked([offered('a'), offered('b')], ['a']);
    r.receive({ t: 'offer', items: [offered('b'), offered('c')] });
    expect(r.offeredItems.map(i => i.id)).toEqual(['b', 'c']);
    expect(r.receive({ t: 'item', id: 'a', text: '{}' }).received?.item.id).toBe('a');
  });

  it('takes an offer only after hello', () => {
    expect(new ShareReceiver().receive({ t: 'offer', items: [] })).toMatchObject({ error: 'unexpected', done: true });
  });

  it('asks for some of what was offered, and several times one after the other', () => {
    const r = offeredTo([offered('a'), offered('b'), offered('c')]);
    expect(r.want(['a', 'c']).send).toEqual([{ t: 'want', ids: ['a', 'c'] }]);
    expect(r.busy).toBe(true);
    r.receive({ t: 'item', id: 'a', text: '{}' });
    expect(r.receive({ t: 'item', id: 'c', text: '{}' })).toMatchObject({ received: { item: { id: 'c' } } });
    expect(r.busy).toBe(false);
    expect(r.want(['b']).send).toEqual([{ t: 'want', ids: ['b'] }]);
  });

  it('does not end after the last item: the person may take more', () => {
    const r = asked([offered('a')]);
    const step = r.receive({ t: 'item', id: 'a', text: '{}' });
    expect(step.done).toBeUndefined();
    expect(step.send).toEqual([]);
  });

  it('allows one transfer at a time, and says so without ending the exchange', () => {
    const r = asked([offered('a'), offered('b')], ['a']);
    expect(r.want(['b'])).toEqual({ send: [], error: 'busy' });
    expect(r.receive({ t: 'item', id: 'a', text: '{}' }).received).toBeDefined();
  });

  it('does not end the exchange because of a request of its own that cannot be made', () => {
    const r = offeredTo([offered('a'), offered('b', 2), offered('big', MAX_ITEM_CHARS)]);
    expect(r.want(['zzz'])).toEqual({ send: [], error: 'gone' });
    expect(r.want(['a', 'a'])).toEqual({ send: [], error: 'invalid' });
    expect(r.want([])).toEqual({ send: [] });
    expect(r.busy).toBe(false);
    expect(r.want(['a']).send).toHaveLength(1);
  });

  it('does not ask for more at once than allowed, nor for the same item twice in one request', () => {
    const many = Array.from({ length: MAX_WANT_IDS + 1 }, (_, i) => offered(`i${i}`));
    const r = offeredTo(many);
    expect(r.want(many.map(i => i.id))).toEqual({ send: [], error: 'invalid' });
    expect(r.want(['i0', 'i0'])).toEqual({ send: [], error: 'invalid' });
  });

  it('asks again for an item it took before (it may have been deleted since), but the total limit still counts', () => {
    const r = offeredTo([offered('a', 2)]);
    r.want(['a']);
    expect(r.receive({ t: 'item', id: 'a', text: '{}' }).received?.item.id).toBe('a');
    expect(r.want(['a']).send).toEqual([{ t: 'want', ids: ['a'] }]);
    const big = offeredTo([offered('b', MAX_ITEM_CHARS)]);
    for (let i = 0; i < 5; i++) {
      expect(big.want(['b']).error, `take ${i}`).toBeUndefined();
      big.receive({ t: 'item', id: 'b', text: 'x'.repeat(MAX_ITEM_CHARS) });
    }
    expect(big.want(['b'])).toEqual({ send: [], error: 'tooLarge' });
  });

  it('does not ask for more than the total limit', () => {
    const items = Array.from({ length: 6 }, (_, i) => offered(`i${i}`, MAX_ITEM_CHARS));
    const r = offeredTo(items);
    expect(r.want(items.map(i => i.id).slice(0, 6))).toEqual({ send: [], error: 'tooLarge' });
  });

  it('takes in an item only when it was asked for', () => {
    const r = asked([offered('a'), offered('b')], ['a']);
    expect(r.receive({ t: 'item', id: 'b', text: '{}' })).toMatchObject({ error: 'unexpected', done: true, send: [{ t: 'bye', role: 'taker' }] });
  });

  it('ends the exchange when an item is not the length it announced', () => {
    expect(asked([offered('a', 2)]).receive({ t: 'item', id: 'a', text: '{"x":1}' })).toMatchObject({ error: 'tooLarge', done: true });
    expect(asked([offered('a', 20)]).receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'tooLarge' });
  });

  it('does not take an item twice', () => {
    const r = asked([offered('a'), offered('b')]);
    expect(r.receive({ t: 'item', id: 'a', text: '{}' }).received?.item.id).toBe('a');
    expect(r.receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'unexpected' });
  });

  it('takes in nothing before it has asked', () => {
    expect(offeredTo([offered('a')]).receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'unexpected', done: true });
  });

  it('takes the items that are gone out of the transfer and of the list, and is free again when nothing is left to wait for', () => {
    const r = asked([offered('a'), offered('b')]);
    expect(r.receive({ t: 'gone', ids: ['a'] })).toMatchObject({ gone: ['a'], changed: true });
    expect(r.busy).toBe(true);
    expect(r.offeredItems.map(i => i.id)).toEqual(['b']);
    r.receive({ t: 'item', id: 'b', text: '{}' });
    expect(r.busy).toBe(false);
  });

  it('is free again when everything it asked for is gone', () => {
    const r = asked([offered('a')]);
    r.receive({ t: 'gone', ids: ['a'] });
    expect(r.busy).toBe(false);
    expect(r.receive({ t: 'item', id: 'a', text: '{}' })).toMatchObject({ error: 'unexpected' });
  });

  it('ends the exchange when the text does not match the hash it was offered with', () => {
    const r = asked([offered('a')]);
    r.receive({ t: 'item', id: 'a', text: '{}' });
    expect(r.rejectItem()).toMatchObject({ error: 'invalid', done: true, send: [{ t: 'bye', role: 'taker' }] });
  });

  it('leaves with a bye, and ignores everything after', () => {
    const r = offeredTo([offered('a')]);
    expect(r.leave()).toEqual({ send: [{ t: 'bye', role: 'taker' }], done: true });
    expect(r.receive({ t: 'offer', items: [] })).toEqual({ send: [], error: 'unexpected' });
    expect(r.want(['a'])).toEqual({ send: [], error: 'unexpected' });
  });

  it('ends when the other side leaves, and refuses messages meant for the other side', () => {
    expect(offeredTo([]).receive({ t: 'bye', role: 'sharer' })).toEqual({ send: [], done: true });
    expect(offeredTo([]).receive({ t: 'bye', role: 'taker' })).toMatchObject({ error: 'unexpected', done: true });
    expect(offeredTo([]).receive({ t: 'want', ids: ['a'] })).toMatchObject({ error: 'unexpected', done: true });
  });

  it('asks only after an offer has arrived', () => {
    const r = new ShareReceiver();
    r.hello();
    expect(r.want(['a'])).toEqual({ send: [], error: 'unexpected' });
  });
});

/** Two devices, each sharing something and taking something, with what one sends handed to the other */
function connect(a: SharePeer, b: SharePeer) {
  const log: { from: 'a' | 'b'; msg: ShareMessage }[] = [];
  const queue: { to: 'a' | 'b'; msg: ShareMessage }[] = [];
  const peers = { a, b };
  const events: { at: 'a' | 'b'; step: ReturnType<SharePeer['receive']> }[] = [];
  const send = (from: 'a' | 'b', step: Pick<Step, 'send'>) => {
    for (const msg of step.send) { log.push({ from, msg }); queue.push({ to: from === 'a' ? 'b' : 'a', msg }); }
  };
  const pump = () => {
    for (let guard = 0; guard < 200 && queue.length; guard++) {
      const { to, msg } = queue.shift()!;
      const step = peers[to].receive(msg);
      events.push({ at: to, step });
      send(to, step);
    }
  };
  for (const m of a.open()) { log.push({ from: 'a', msg: m }); queue.push({ to: 'b', msg: m }); }
  for (const m of b.open()) { log.push({ from: 'b', msg: m }); queue.push({ to: 'a', msg: m }); }
  pump();
  return { send, pump, events, log };
}

describe('SharePeer: both directions on one connection', () => {
  it('lets both sides share and take at the same time', () => {
    const a = new SharePeer([item('a1', '{"a":1}'), item('a2', '{"a":2}')]);
    const b = new SharePeer([item('b1', '{"b":1}')]);
    const link = connect(a, b);
    expect(a.receiver.offeredItems.map(i => i.id)).toEqual(['b1']);
    expect(b.receiver.offeredItems.map(i => i.id)).toEqual(['a1', 'a2']);
    link.send('a', a.receiver.want(['b1']));
    link.send('b', b.receiver.want(['a2', 'a1']));
    link.pump();
    const received = (at: 'a' | 'b') => link.events.filter(e => e.at === at && 'received' in e.step && e.step.received).map(e => (e.step as { received: { item: { id: string }; text: string } }).received.text);
    expect(received('a')).toEqual(['{"b":1}']);
    expect(received('b')).toEqual(['{"a":2}', '{"a":1}']);
  });

  it('keeps the two directions apart when one side leaves its taking side and still shares', () => {
    const a = new SharePeer([item('a1')]);
    const b = new SharePeer([item('b1')]);
    const link = connect(a, b);
    link.send('a', a.receiver.leave());
    link.pump();
    // a no longer takes, so b's sharing side is closed; a's sharing side is still open for b
    expect(b.sender.receive({ t: 'want', ids: ['b1'] })).toEqual({ send: [], error: 'unexpected' });
    link.send('b', b.receiver.want(['a1']));
    link.pump();
    expect(link.events.some(e => e.at === 'b' && 'received' in e.step && e.step.received?.item.id === 'a1')).toBe(true);
  });

  it('works when one side has nothing to share', () => {
    const a = new SharePeer([item('a1')]);
    const b = new SharePeer();
    const link = connect(a, b);
    expect(a.receiver.offeredItems).toEqual([]);
    link.send('b', b.receiver.want(['a1']));
    link.pump();
    expect(link.events.some(e => e.at === 'b' && 'received' in e.step && e.step.received?.item.id === 'a1')).toBe(true);
  });

  it('shows a changed offer to the other side as it happens', () => {
    const a = new SharePeer([item('a1')]);
    const b = new SharePeer();
    const link = connect(a, b);
    link.send('a', a.sender.update([item('a1'), item('a2')]));
    link.pump();
    expect(b.receiver.offeredItems.map(i => i.id)).toEqual(['a1', 'a2']);
  });
});
