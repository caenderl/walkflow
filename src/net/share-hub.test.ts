import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeShareItem } from '../core/share/item';
import type { ShareItem } from '../core/share/protocol';
import { ShareHub, type HubOptions } from './share-hub';
import type { JoinOptions, Room, Transport } from './transport';

/** Devices in rooms, with messages handed over the way a network does: later, and as a copy */
class FakeNetwork {
  private readonly rooms = new Map<string, FakeRoom[]>();
  private count = 0;
  transport(): Transport {
    return { join: async (name: string, options: JoinOptions) => this.join(name, options) };
  }
  private join(name: string, _options: JoinOptions): FakeRoom {
    const room = new FakeRoom(`d${++this.count}`, name, this.rooms);
    const others = this.rooms.get(name) ?? [];
    this.rooms.set(name, [...others, room]);
    for (const o of others) { room.present.add(o.selfId); o.present.add(room.selfId); }
    queueMicrotask(() => { for (const o of others) { room.onPeerJoin?.(o.selfId); o.onPeerJoin?.(room.selfId); } });
    return room;
  }
}

class FakeRoom implements Room {
  /** Who is here; a handler that is set later is told about them (the real library does the same) */
  readonly present = new Set<string>();
  private joinHandler: ((peer: string) => void) | null = null;
  onPeerLeave: ((peer: string) => void) | null = null;
  onMessage: ((peer: string, data: unknown) => void) | null = null;
  /** What this device was sent, for tests that look at it */
  readonly received: { from: string; data: unknown }[] = [];
  constructor(readonly selfId: string, private readonly name: string, private readonly rooms: Map<string, FakeRoom[]>) {}
  get onPeerJoin() { return this.joinHandler; }
  set onPeerJoin(handler: ((peer: string) => void) | null) {
    this.joinHandler = handler;
    if (handler) for (const peer of [...this.present]) handler(peer);
  }
  send(peer: string, data: unknown) {
    const target = this.rooms.get(this.name)?.find(r => r.selfId === peer);
    if (!target) return;
    const copy = JSON.parse(JSON.stringify(data));
    queueMicrotask(() => { target.received.push({ from: this.selfId, data: copy }); target.onMessage?.(this.selfId, copy); });
  }
  leave() {
    const rest = (this.rooms.get(this.name) ?? []).filter(r => r !== this);
    this.rooms.set(this.name, rest);
    for (const r of rest) r.present.delete(this.selfId);
    queueMicrotask(() => { for (const r of rest) r.onPeerLeave?.(this.selfId); });
  }
}

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };

const route = (id: string, name: string, text = `{"route":"${name}"}`, over: Partial<ShareItem> = {}) =>
  makeShareItem({ id, kind: 'route', name, text, ...over });

async function start(net: FakeNetwork, items: ShareItem[] = [], options: Partial<HubOptions> = {}) {
  const hub = new ShareHub({ transport: net.transport(), room: 'community', maxPeers: 16, items, ...options });
  await hub.start();
  return hub;
}

afterEach(() => { vi.useRealTimers(); });

describe('ShareHub: finding each other', () => {
  it('shows each device what the other offers, and keeps the list up to date', async () => {
    const net = new FakeNetwork();
    const a = await start(net, [await route('a1', 'Alster loop'), await route('a2', 'Park loop')]);
    const b = await start(net, [await route('b1', 'Beach')]);
    await flush();
    expect(b.directory.list().map(e => e.name)).toEqual(['Alster loop', 'Park loop']);
    expect(a.directory.list().map(e => e.name)).toEqual(['Beach']);
    expect(a.peerCount).toBe(1);

    a.update([await route('a1', 'Alster loop')]);
    await flush();
    expect(b.directory.list().map(e => e.name)).toEqual(['Alster loop']);
  });

  it('merges the same file from several devices into one entry', async () => {
    const net = new FakeNetwork();
    await start(net, [await route('x', 'Same', '{"same":1}')]);
    await start(net, [await route('y', 'Same', '{"same":1}')]);
    const c = await start(net);
    await flush();
    expect(c.directory.list()).toHaveLength(1);
    expect(c.directory.list()[0]!.peers).toHaveLength(2);
  });

  it('tells the screen when something changed', async () => {
    const net = new FakeNetwork();
    const changed = vi.fn();
    await start(net, [], { onChange: changed });
    await start(net, [await route('b1', 'Beach')]);
    await flush();
    expect(changed).toHaveBeenCalled();
  });

  it('forgets a device that leaves', async () => {
    const net = new FakeNetwork();
    const a = await start(net, [await route('a1', 'Alster loop')]);
    const b = await start(net);
    await flush();
    expect(b.directory.size).toBe(1);
    a.stop();
    await flush();
    expect(b.directory.size).toBe(0);
    expect(b.peerCount).toBe(0);
  });

  it('can share nothing and still see what others share', async () => {
    const net = new FakeNetwork();
    await start(net, [await route('a1', 'Alster loop')]);
    const b = await start(net);
    await flush();
    expect(b.directory.size).toBe(1);
  });

  it('keeps to the number of devices it was told to have, and ignores the rest', async () => {
    const net = new FakeNetwork();
    const c = await start(net, [], { maxPeers: 1 });
    await start(net, [await route('a1', 'First')]);
    await start(net, [await route('b1', 'Second')]);
    await flush();
    expect(c.peerCount).toBe(1);
    expect(c.directory.list().map(e => e.name)).toEqual(['First']);
  });
});

describe('ShareHub: taking', () => {
  it('takes a file from a device and checks it against the hash it was offered with', async () => {
    const net = new FakeNetwork();
    const item = await route('a1', 'Alster loop', '{"route":"alster"}');
    await start(net, [item]);
    const b = await start(net);
    await flush();
    const result = await b.take(item.sha256);
    expect(result).toMatchObject({ ok: true, text: '{"route":"alster"}', item: { sha256: item.sha256, name: 'Alster loop' } });
  });

  it('takes several files one after the other, also from the same device, when asked at the same time', async () => {
    const net = new FakeNetwork();
    const one = await route('a1', 'One', '{"n":1}'), two = await route('a2', 'Two', '{"n":2}');
    await start(net, [one, two]);
    const b = await start(net);
    await flush();
    const [r1, r2] = await Promise.all([b.take(one.sha256), b.take(two.sha256)]);
    expect(r1).toMatchObject({ ok: true, text: '{"n":1}' });
    expect(r2).toMatchObject({ ok: true, text: '{"n":2}' });
  });

  it('says so when no device has the file', async () => {
    const net = new FakeNetwork();
    await start(net, [await route('a1', 'Alster loop')]);
    const b = await start(net);
    await flush();
    expect(await b.take('f'.repeat(64))).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('asks the next device when the first one has left before it could answer', async () => {
    const net = new FakeNetwork();
    const item = await route('x', 'Same', '{"same":1}');
    const first = await start(net, [item]);
    await start(net, [{ ...item, id: 'y' }]);
    const c = await start(net);
    await flush();
    const taking = c.take(item.sha256);
    first.stop();
    expect(await taking).toMatchObject({ ok: true, text: '{"same":1}' });
  });

  it('refuses a file that is not what was offered, and no longer listens to the device that sent it', async () => {
    const net = new FakeNetwork();
    const honest = await route('a1', 'Alster loop', '{"real":1}');
    // The same length, another text: what was offered is not what is sent
    const liar = { ...honest, id: 'z', text: '{"fake":1}' };
    const bad = await start(net, [liar]);
    const b = await start(net);
    await flush();
    const result = await b.take(honest.sha256);
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(b.directory.size).toBe(0);
    expect(b.peerCount).toBe(0);
    bad.stop();
  });

  it('takes the file from the next device when one sends something else', async () => {
    const net = new FakeNetwork();
    const honest = await route('a1', 'Alster loop', '{"real":1}');
    await start(net, [{ ...honest, text: '{"fake":1}' }]);
    await start(net, [honest]);
    const c = await start(net);
    await flush();
    expect(await c.take(honest.sha256)).toMatchObject({ ok: true, text: '{"real":1}' });
  });

  it('gives up on a device that does not answer in time', async () => {
    vi.useFakeTimers();
    const net = new FakeNetwork();
    const item = await route('a1', 'Alster loop');
    // A device that offers and then says nothing more
    const quiet = await net.transport().join('community', { maxPeers: 16 });
    const b = await start(net, [], { takeTimeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(10);
    quiet.onMessage = (peer, data) => {
      const msg = data as { t: string };
      if (msg.t === 'hello') quiet.send(peer, { t: 'offer', items: [{ id: 'q', kind: 'route', name: 'Slow', chars: item.chars, sha256: item.sha256 }] });
    };
    quiet.send(b.selfId, { t: 'hello', v: 1 });
    quiet.send(b.selfId, { t: 'offer', items: [{ id: 'q', kind: 'route', name: 'Slow', chars: item.chars, sha256: item.sha256 }] });
    await vi.advanceTimersByTimeAsync(10);
    const taking = b.take(item.sha256);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await taking).toEqual({ ok: false, reason: 'unavailable' });
    expect(b.peerCount).toBe(0);
  });
});

describe('ShareHub: devices that do not behave', () => {
  async function withRogue() {
    const net = new FakeNetwork();
    const hub = await start(net, [await route('a1', 'Mine')]);
    const rogue = await net.transport().join('community', { maxPeers: 16 });
    await flush();
    return { net, hub, rogue };
  }

  it('answers something that is not a message with a bye, and ignores that device from then on', async () => {
    const { hub, rogue } = await withRogue();
    rogue.send(hub.selfId, { t: 'launch', speed: 25 });
    await flush();
    expect((rogue as unknown as FakeRoom).received.some(m => (m.data as { t: string }).t === 'bye')).toBe(true);
    const before = (rogue as unknown as FakeRoom).received.length;
    rogue.send(hub.selfId, { t: 'hello', v: 1 });
    await flush();
    expect((rogue as unknown as FakeRoom).received.length).toBe(before);
    expect(hub.peerCount).toBe(0);
  });

  it('ends the exchange with a device that asks for something it was never offered', async () => {
    const { hub, rogue } = await withRogue();
    rogue.send(hub.selfId, { t: 'hello', v: 1 });
    rogue.send(hub.selfId, { t: 'want', ids: ['secret'] });
    await flush();
    expect(hub.peerCount).toBe(0);
  });

  it('does not let a device that offers things we did not ask for fill the list: the offer is limited', async () => {
    const { hub, rogue } = await withRogue();
    rogue.send(hub.selfId, { t: 'offer', items: Array.from({ length: 51 }, (_, i) => ({ id: `i${i}`, kind: 'route', name: 'X', chars: 5, sha256: 'a'.repeat(64) })) });
    await flush();
    expect(hub.directory.size).toBe(0);
    expect(hub.peerCount).toBe(0);
  });

  it('does not send a package to a device that never said hello', async () => {
    const { hub, rogue } = await withRogue();
    rogue.send(hub.selfId, { t: 'want', ids: ['a1'] });
    await flush();
    expect((rogue as unknown as FakeRoom).received.some(m => (m.data as { t: string }).t === 'item')).toBe(false);
  });
});

describe('ShareHub: stopping', () => {
  it('tells every device bye in both roles before it leaves', async () => {
    const net = new FakeNetwork();
    const a = await start(net, [await route('a1', 'Alster loop')]);
    const watcher = (await net.transport().join('community', { maxPeers: 16 })) as unknown as FakeRoom;
    await flush();
    a.stop();
    await flush();
    const byes = watcher.received.map(m => m.data as { t: string; role?: string }).filter(m => m.t === 'bye');
    expect(byes.map(b => b.role).sort()).toEqual(['sharer', 'taker']);
  });

  it('says bye to every device and leaves the room, and then does nothing more', async () => {
    const net = new FakeNetwork();
    const a = await start(net, [await route('a1', 'Alster loop')]);
    const b = await start(net);
    await flush();
    a.stop();
    a.update([await route('a2', 'Another')]);
    await flush();
    expect(b.directory.size).toBe(0);
    expect(await a.take('a'.repeat(64))).toEqual({ ok: false, reason: 'unavailable' });
  });
});
