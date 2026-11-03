// BLE layer: adapter interface (GATT level), Web Bluetooth adapter, serial write queue
// and the FTMS connection sequence. A second adapter (e.g. native) only implements BleAdapter/BleDevice.

import {
  CH, DEVINFO_CH, DEVINFO_SERVICE, FTMS_SERVICE, HR_SERVICE,
  describeControlPointResponse, hex, parseControlPointResponse, parseFeatures,
  parseHeartRate, parseInclinationRange, parseSpeedRange, parseTreadmillData,
  type Features, type Range, type TreadmillData,
} from '../core/protocol/ftms';
import { t } from '../i18n/i18n';

export type Uuid = number;

export interface BleDevice {
  readonly name: string | undefined;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  /** Called exactly once per connection, also when disconnecting manually. */
  onDisconnected(cb: () => void): void;
  read(service: Uuid, characteristic: Uuid): Promise<DataView>;
  /** The listener is registered before notifications are enabled. */
  subscribe(service: Uuid, characteristic: Uuid, cb: (dv: DataView) => void): Promise<void>;
  /** Write with Response. */
  write(service: Uuid, characteristic: Uuid, data: Uint8Array): Promise<void>;
}

export type BleAvailability =
  | { ok: true }
  | { ok: false; reason: 'no-api' | 'no-adapter' };

export interface BleAdapter {
  readonly kind: string;
  availability(): Promise<BleAvailability>;
  /** Opens the device chooser. */
  requestDevice(optionalServices: Uuid[]): Promise<BleDevice>;
}

// ---------- Serial queue ----------

/** A waiting task was displaced by an urgent task. */
export class DroppedError extends Error {
  constructor() { super('dropped'); this.name = 'DroppedError'; }
}

interface Job {
  task: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

/** Runs tasks strictly one after another. An error does not break the chain. */
export class SerialQueue {
  private pending: Job[] = [];
  private running = false;

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ task, resolve: resolve as (v: unknown) => void, reject });
      void this.drain();
    });
  }

  /**
   * Rejects all tasks that have not started yet (DroppedError) and queues `task` next.
   * A task that is already running is awaited; nothing ever runs in parallel.
   */
  runUrgent<T>(task: () => Promise<T>): Promise<T> {
    for (const job of this.pending.splice(0)) job.reject(new DroppedError());
    return this.run(task);
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.pending.shift(); job; job = this.pending.shift()) {
        try { job.resolve(await job.task()); } catch (e) { job.reject(e); }
      }
    } finally {
      this.running = false;
    }
  }
}

// ---------- Web Bluetooth ----------

class WebBluetoothDevice implements BleDevice {
  private server: BluetoothRemoteGATTServer | null = null;
  private services = new Map<Uuid, Promise<BluetoothRemoteGATTService>>();
  private chars = new Map<string, Promise<BluetoothRemoteGATTCharacteristic>>();
  private listeners: [BluetoothRemoteGATTCharacteristic, EventListener][] = [];
  private disconnectCb: (() => void) | null = null;
  private readonly handleDisconnect = () => {
    this.dev.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    for (const [c, l] of this.listeners) c.removeEventListener('characteristicvaluechanged', l);
    this.listeners = [];
    this.services.clear();
    this.chars.clear();
    const cb = this.disconnectCb;
    this.disconnectCb = null;
    cb?.();
  };

  constructor(private readonly dev: BluetoothDevice) {}

  get name() { return this.dev.name; }
  get connected() { return !!this.dev.gatt?.connected; }

  async connect() {
    if (!this.dev.gatt) throw new Error(t.ble.noGatt);
    this.dev.addEventListener('gattserverdisconnected', this.handleDisconnect);
    this.server = await this.dev.gatt.connect();
  }

  disconnect() {
    this.dev.gatt?.disconnect();
  }

  onDisconnected(cb: () => void) {
    this.disconnectCb = cb;
  }

  private service(uuid: Uuid) {
    let s = this.services.get(uuid);
    if (!s) {
      if (!this.server) return Promise.reject(new Error(t.ble.notConnected));
      s = this.server.getPrimaryService(uuid);
      s.catch(() => this.services.delete(uuid));
      this.services.set(uuid, s);
    }
    return s;
  }

  private characteristic(service: Uuid, characteristic: Uuid) {
    const key = `${service}/${characteristic}`;
    let c = this.chars.get(key);
    if (!c) {
      c = this.service(service).then(s => s.getCharacteristic(characteristic));
      c.catch(() => this.chars.delete(key));
      this.chars.set(key, c);
    }
    return c;
  }

  async read(service: Uuid, characteristic: Uuid) {
    return (await this.characteristic(service, characteristic)).readValue();
  }

  async subscribe(service: Uuid, characteristic: Uuid, cb: (dv: DataView) => void) {
    const c = await this.characteristic(service, characteristic);
    const l: EventListener = ev => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (v) cb(v);
    };
    c.addEventListener('characteristicvaluechanged', l);
    this.listeners.push([c, l]);
    await c.startNotifications();
  }

  async write(service: Uuid, characteristic: Uuid, data: Uint8Array) {
    const c = await this.characteristic(service, characteristic);
    const buf = data.slice().buffer;
    if (c.writeValueWithResponse) await c.writeValueWithResponse(buf);
    else await c.writeValue(buf);
  }
}

export class WebBluetoothAdapter implements BleAdapter {
  readonly kind = 'web-bluetooth';

  async availability(): Promise<BleAvailability> {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) return { ok: false, reason: 'no-api' };
    try {
      if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) {
        return { ok: false, reason: 'no-adapter' };
      }
    } catch {
      // getAvailability is optional; when in doubt, carry on
    }
    return { ok: true };
  }

  async requestDevice(optionalServices: Uuid[]): Promise<BleDevice> {
    // No service filter: unclear whether the treadmill advertises 0x1826.
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
    return new WebBluetoothDevice(dev);
  }
}

// ---------- FTMS client ----------

export interface TreadmillEvents {
  log(msg: string): void;
  data(d: TreadmillData): void;
  heartRate(bpm: number): void;
  machineStatus(dv: DataView): void;
  trainingStatus(dv: DataView): void;
  disconnected(): void;
}

export interface ConnectResult {
  deviceName: string | undefined;
  features?: Features;
  speedRange?: Range;
  inclRange?: Range;
  hasHeartRate: boolean;
}

export class TreadmillClient {
  private device: BleDevice | null = null;
  private readonly queue = new SerialQueue();

  constructor(private readonly adapter: BleAdapter, private readonly ev: TreadmillEvents) {}

  get adapterKind() { return this.adapter.kind; }
  get connected() { return !!this.device?.connected; }

  /** Same sequence as the prototype, including the order of GATT accesses. */
  async connect(): Promise<ConnectResult> {
    const { ev } = this;
    const device = await this.adapter.requestDevice([FTMS_SERVICE, HR_SERVICE, DEVINFO_SERVICE]);
    ev.log(t.ble.device(device.name));
    device.onDisconnected(() => {
      if (this.device === device) this.device = null;
      ev.disconnected();
    });
    try {
      await device.connect();
      this.device = device;

      await device.subscribe(FTMS_SERVICE, CH.control, dv => {
        const r = parseControlPointResponse(dv);
        ev.log(r ? `← ${describeControlPointResponse(r)}` : `← CP ${hex(dv)}`);
      });
      await device.subscribe(FTMS_SERVICE, CH.treadmillData, dv => ev.data(parseTreadmillData(dv)));

      const statusChars: [Uuid, (dv: DataView) => void][] = [
        [CH.machineStatus, dv => ev.machineStatus(dv)],
        [CH.trainingStatus, dv => ev.trainingStatus(dv)],
      ];
      for (const [uuid, cb] of statusChars) {
        try { await device.subscribe(FTMS_SERVICE, uuid, cb); }
        catch { ev.log(t.ble.notSubscribable(uuid.toString(16))); }
      }

      const infoChars: [(v: string) => string, Uuid][] = [
        [t.ble.manufacturer, DEVINFO_CH.manufacturer], [t.ble.model, DEVINFO_CH.model], [t.ble.firmware, DEVINFO_CH.firmware],
      ];
      for (const [line, uuid] of infoChars) {
        try { ev.log(line(new TextDecoder().decode(await device.read(DEVINFO_SERVICE, uuid)))); }
        catch { /* optional */ }
      }

      const result: ConnectResult = { deviceName: device.name, hasHeartRate: false };

      try {
        result.features = parseFeatures(await device.read(FTMS_SERVICE, CH.feature));
        ev.log(t.ble.features(result.features.machineNames.join(', ') || '–'));
        ev.log(t.ble.controllable(result.features.targetNames.join(', ') || '–'));
      } catch { ev.log(t.ble.featuresUnreadable); }

      try {
        const r = parseSpeedRange(await device.read(FTMS_SERVICE, CH.speedRange));
        result.speedRange = r;
        ev.log(t.ble.speedRange(r.min, r.max, r.step));
      } catch { ev.log(t.ble.speedRangeUnreadable); }

      try {
        const r = parseInclinationRange(await device.read(FTMS_SERVICE, CH.inclRange));
        result.inclRange = r;
        ev.log(t.ble.inclRange(r.min, r.max, r.step));
      } catch { ev.log(t.ble.inclRangeUnreadable); }

      try {
        await device.subscribe(HR_SERVICE, CH.hr, dv => ev.heartRate(parseHeartRate(dv)));
        result.hasHeartRate = true;
        ev.log(t.ble.hrSubscribed);
      } catch { ev.log(t.ble.noHr); }

      return result;
    } catch (e) {
      try { device.disconnect(); } catch { /* ignore */ }
      throw e;
    }
  }

  disconnect() {
    this.device?.disconnect();
  }

  /**
   * Writes to the Control Point. All writes go serially through a queue, with response.
   * `urgent` (stop/pause): waiting writes are dropped, the running one is awaited.
   * Resolves to false on error or when dropped (both are logged), never throws.
   */
  send(bytes: Uint8Array, opts: { urgent?: boolean } = {}): Promise<boolean> {
    const task = async () => {
      this.ev.log(`→ ${hex(bytes)}`);
      const d = this.device;
      if (!d?.connected) throw new Error(t.ble.notConnected);
      await d.write(FTMS_SERVICE, CH.control, bytes);
    };
    return (opts.urgent ? this.queue.runUrgent(task) : this.queue.run(task)).then(
      () => true,
      (e: unknown) => {
        if (e instanceof DroppedError) this.ev.log(t.ble.dropped(hex(bytes)));
        else this.ev.log(t.ble.writeError(e instanceof Error ? e.message : String(e)));
        return false;
      },
    );
  }
}
