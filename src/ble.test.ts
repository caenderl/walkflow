import { describe, expect, it, vi } from 'vitest';
import { DroppedError, SerialQueue, TreadmillClient, type BleAdapter, type BleDevice, type TreadmillEvents, type Uuid } from './ble';
import { dataView, hex } from './ftms';

function deferred() {
  let resolve!: () => void, reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class FakeDevice implements BleDevice {
  name = 'FAKE';
  connected = false;
  calls: string[] = [];
  readable = new Map<string, number[]>();
  subscribable = new Set<string>();
  subs = new Map<string, (dv: DataView) => void>();
  writes: string[] = [];
  writeImpl: (data: Uint8Array) => Promise<void> = async () => {};
  private disconnectCb: (() => void) | null = null;

  async connect() { this.calls.push('connect'); this.connected = true; }
  disconnect() { this.connected = false; const cb = this.disconnectCb; this.disconnectCb = null; cb?.(); }
  onDisconnected(cb: () => void) { this.disconnectCb = cb; }
  async read(s: Uuid, c: Uuid) {
    const key = `${s.toString(16)}/${c.toString(16)}`;
    this.calls.push(`read ${key}`);
    const v = this.readable.get(key);
    if (!v) throw new Error('nicht da');
    return dataView(v);
  }
  async subscribe(s: Uuid, c: Uuid, cb: (dv: DataView) => void) {
    const key = `${s.toString(16)}/${c.toString(16)}`;
    this.calls.push(`sub ${key}`);
    if (!this.subscribable.has(key)) throw new Error('nicht da');
    this.subs.set(key, cb);
  }
  async write(_s: Uuid, _c: Uuid, data: Uint8Array) {
    this.writes.push(`start ${hex(data)}`);
    await this.writeImpl(data);
    this.writes.push(`end ${hex(data)}`);
  }
}

function setup(dev = new FakeDevice()) {
  const adapter: BleAdapter = { kind: 'fake', availability: async () => ({ ok: true }), requestDevice: vi.fn(async () => dev) };
  const logs: string[] = [];
  const ev: TreadmillEvents = {
    log: m => logs.push(m), data: vi.fn(), heartRate: vi.fn(), machineStatus: vi.fn(), trainingStatus: vi.fn(), disconnected: vi.fn(),
  };
  return { dev, adapter, logs, ev, client: new TreadmillClient(adapter, ev) };
}

describe('TreadmillClient.connect', () => {
  it('fragt die drei Services an und hält die Reihenfolge des Prototyps ein', async () => {
    const { dev, adapter, client, logs } = setup();
    dev.subscribable = new Set(['1826/2ad9', '1826/2acd', '1826/2ada', '180d/2a37']);
    dev.readable.set('180a/2a29', [...new TextEncoder().encode('FITHOME')]);
    dev.readable.set('1826/2ad4', [100, 0, 0x58, 0x02, 10, 0]);
    const info = await client.connect();

    expect(adapter.requestDevice).toHaveBeenCalledWith([0x1826, 0x180d, 0x180a]);
    expect(dev.calls).toEqual([
      'connect', 'sub 1826/2ad9', 'sub 1826/2acd', 'sub 1826/2ada', 'sub 1826/2ad3',
      'read 180a/2a29', 'read 180a/2a24', 'read 180a/2a26',
      'read 1826/2acc', 'read 1826/2ad4', 'read 1826/2ad5', 'sub 180d/2a37',
    ]);
    expect(info).toMatchObject({ deviceName: 'FAKE', speedRange: { min: 1, max: 6, step: 0.1 }, hasHeartRate: true });
    expect(info.inclRange).toBeUndefined();
    expect(logs).toContain('Hersteller: FITHOME');
    expect(logs).toContain('(Status 0x2ad3 nicht abonnierbar)');
    expect(logs).toContain('Inclination-Range nicht lesbar (Fallback 0–15 %)');
  });

  it('ohne Control Point schlägt connect fehl und trennt wieder', async () => {
    const { dev, client } = setup();
    await expect(client.connect()).rejects.toThrow();
    expect(dev.connected).toBe(false);
  });

  it('leitet Notifications geparst weiter und loggt CP-Antworten lesbar', async () => {
    const { dev, client, ev, logs } = setup();
    dev.subscribable = new Set(['1826/2ad9', '1826/2acd']);
    await client.connect();
    dev.subs.get('1826/2acd')!(dataView([0, 0, 0x2c, 0x01]));
    expect(ev.data).toHaveBeenCalledWith({ speed: 3 });
    dev.subs.get('1826/2ad9')!(dataView([0x80, 0x03, 0x02]));
    expect(logs).toContain('← Set Inclination: nicht unterstützt');
  });

  it('meldet Disconnect', async () => {
    const { dev, client, ev } = setup();
    dev.subscribable = new Set(['1826/2ad9', '1826/2acd']);
    await client.connect();
    dev.disconnect();
    expect(ev.disconnected).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(false);
  });
});

describe('TreadmillClient.send', () => {
  it('schreibt nie parallel, auch wenn schnell hintereinander gesendet wird', async () => {
    const { dev, client } = setup();
    dev.subscribable = new Set(['1826/2ad9', '1826/2acd']);
    await client.connect();
    const gates = [deferred(), deferred()];
    let n = 0;
    dev.writeImpl = () => gates[n++]!.promise;

    const a = client.send(new Uint8Array([0x00]));
    const b = client.send(new Uint8Array([0x07]));
    await Promise.resolve(); await Promise.resolve();
    expect(dev.writes).toEqual(['start 00']);
    gates[0]!.resolve();
    await a;
    await Promise.resolve();
    expect(dev.writes).toEqual(['start 00', 'end 00', 'start 07']);
    gates[1]!.resolve();
    await expect(b).resolves.toBe(true);
  });

  it('ein Schreibfehler wird geloggt und hält die Queue nicht an', async () => {
    const { dev, client, logs } = setup();
    dev.subscribable = new Set(['1826/2ad9', '1826/2acd']);
    await client.connect();
    dev.writeImpl = async d => { if (d[0] === 0x00) throw new Error('GATT busy'); };
    const a = client.send(new Uint8Array([0x00]));
    const b = client.send(new Uint8Array([0x07]));
    await expect(a).resolves.toBe(false);
    await expect(b).resolves.toBe(true);
    expect(logs).toContain('❌ Schreibfehler: GATT busy');
  });

  it('ohne Verbindung: Fehler statt Write', async () => {
    const { client, logs } = setup();
    await expect(client.send(new Uint8Array([0x07]))).resolves.toBe(false);
    expect(logs).toContain('❌ Schreibfehler: nicht verbunden');
  });
});

describe('SerialQueue', () => {
  it('reicht Ergebnisse und Fehler durch', async () => {
    const q = new SerialQueue();
    await expect(q.run(async () => 1)).resolves.toBe(1);
    await expect(q.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(q.run(async () => 2)).resolves.toBe(2);
  });
});

describe('Vorrang für Stop/Pause', () => {
  it('SerialQueue.runUrgent verwirft Wartendes, wartet aber den laufenden Task ab', async () => {
    const q = new SerialQueue();
    const order: string[] = [];
    const gate = deferred();
    const a = q.run(async () => { order.push('a start'); await gate.promise; order.push('a end'); });
    const b = q.run(async () => { order.push('b'); });
    const c = q.run(async () => { order.push('c'); });
    await Promise.resolve();
    const u = q.runUrgent(async () => { order.push('urgent'); });
    await expect(b).rejects.toBeInstanceOf(DroppedError);
    await expect(c).rejects.toBeInstanceOf(DroppedError);
    expect(order).toEqual(['a start']);
    gate.resolve();
    await a; await u;
    expect(order).toEqual(['a start', 'a end', 'urgent']);
  });

  it('TreadmillClient: dringender Write verwirft wartende Writes und loggt das', async () => {
    const { dev, client, logs } = setup();
    dev.subscribable = new Set(['1826/2ad9', '1826/2acd']);
    await client.connect();
    const gate = deferred();
    dev.writeImpl = d => (d[0] === 0x02 ? gate.promise : Promise.resolve());
    const s1 = client.send(new Uint8Array([0x02, 0x2c, 0x01]));
    const s2 = client.send(new Uint8Array([0x02, 0x5e, 0x01]));
    await Promise.resolve();
    const stop = client.send(new Uint8Array([0x08, 0x01]), { urgent: true });
    await expect(s2).resolves.toBe(false);
    expect(logs).toContain('verworfen: 02 5e 01 (Stop/Pause hat Vorrang)');
    gate.resolve();
    await expect(s1).resolves.toBe(true);
    await expect(stop).resolves.toBe(true);
    expect(dev.writes).toEqual(['start 02 2c 01', 'end 02 2c 01', 'start 08 01', 'end 08 01']);
  });
});
