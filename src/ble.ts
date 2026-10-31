// BLE-Schicht: Adapter-Interface (GATT-Ebene), Web-Bluetooth-Adapter, serielle Write-Queue
// und der FTMS-Verbindungsablauf. Ein zweiter Adapter (z. B. nativ) implementiert nur BleAdapter/BleDevice.

import {
  CH, DEVINFO_CH, DEVINFO_SERVICE, FTMS_SERVICE, HR_SERVICE,
  describeControlPointResponse, hex, parseControlPointResponse, parseFeatures,
  parseHeartRate, parseInclinationRange, parseSpeedRange, parseTreadmillData,
  type Features, type Range, type TreadmillData,
} from './ftms';

export type Uuid = number;

export interface BleDevice {
  readonly name: string | undefined;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  /** Wird genau einmal pro Verbindung aufgerufen, auch bei manuellem Trennen. */
  onDisconnected(cb: () => void): void;
  read(service: Uuid, characteristic: Uuid): Promise<DataView>;
  /** Listener wird vor dem Aktivieren der Notifications registriert. */
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
  /** Öffnet die Geräteauswahl. */
  requestDevice(optionalServices: Uuid[]): Promise<BleDevice>;
}

// ---------- Serielle Queue ----------

/** Ein wartender Task wurde von einem dringenden Task verdrängt. */
export class DroppedError extends Error {
  constructor() { super('verworfen'); this.name = 'DroppedError'; }
}

interface Job {
  task: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

/** Führt Aufgaben strikt nacheinander aus. Ein Fehler bricht die Kette nicht ab. */
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
   * Verwirft alle noch nicht gestarteten Tasks (DroppedError) und reiht `task` als nächsten ein.
   * Ein gerade laufender Task wird abgewartet, es läuft nie etwas parallel.
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
    if (!this.dev.gatt) throw new Error('Gerät hat keinen GATT-Server');
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
      if (!this.server) return Promise.reject(new Error('nicht verbunden'));
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
      // getAvailability ist optional, im Zweifel weitermachen
    }
    return { ok: true };
  }

  async requestDevice(optionalServices: Uuid[]): Promise<BleDevice> {
    // Kein Service-Filter: unklar, ob das Band 0x1826 im Advertising hat.
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
    return new WebBluetoothDevice(dev);
  }
}

// ---------- FTMS-Client ----------

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

  /** Ablauf wie im Prototyp, inklusive Reihenfolge der GATT-Zugriffe. */
  async connect(): Promise<ConnectResult> {
    const { ev } = this;
    const device = await this.adapter.requestDevice([FTMS_SERVICE, HR_SERVICE, DEVINFO_SERVICE]);
    ev.log(`Gerät: ${device.name ?? '(ohne Namen)'}`);
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
        catch { ev.log(`(Status 0x${uuid.toString(16)} nicht abonnierbar)`); }
      }

      const infoChars: [string, Uuid][] = [
        ['Hersteller', DEVINFO_CH.manufacturer], ['Modell', DEVINFO_CH.model], ['Firmware', DEVINFO_CH.firmware],
      ];
      for (const [label, uuid] of infoChars) {
        try { ev.log(`${label}: ${new TextDecoder().decode(await device.read(DEVINFO_SERVICE, uuid))}`); }
        catch { /* optional */ }
      }

      const result: ConnectResult = { deviceName: device.name, hasHeartRate: false };

      try {
        result.features = parseFeatures(await device.read(FTMS_SERVICE, CH.feature));
        ev.log(`Features: ${result.features.machineNames.join(', ') || '–'}`);
        ev.log(`Steuerbar: ${result.features.targetNames.join(', ') || '–'}`);
      } catch { ev.log('Feature-Flags nicht lesbar'); }

      try {
        const r = parseSpeedRange(await device.read(FTMS_SERVICE, CH.speedRange));
        result.speedRange = r;
        ev.log(`Speed-Range: ${r.min} – ${r.max} km/h (Step ${r.step})`);
      } catch { ev.log('Speed-Range nicht lesbar, nehme 1–12 km/h an'); }

      try {
        const r = parseInclinationRange(await device.read(FTMS_SERVICE, CH.inclRange));
        result.inclRange = r;
        ev.log(`Inclination-Range: ${r.min} – ${r.max} % (Step ${r.step})`);
      } catch { ev.log('Inclination-Range nicht lesbar (Fallback 0–15 %)'); }

      try {
        await device.subscribe(HR_SERVICE, CH.hr, dv => ev.heartRate(parseHeartRate(dv)));
        result.hasHeartRate = true;
        ev.log('Puls-Service abonniert');
      } catch { ev.log('(kein Puls-Service)'); }

      return result;
    } catch (e) {
      try { device.disconnect(); } catch { /* egal */ }
      throw e;
    }
  }

  disconnect() {
    this.device?.disconnect();
  }

  /**
   * Schreibt auf den Control Point. Alle Writes laufen seriell durch eine Queue, mit Response.
   * `urgent` (Stop/Pause): wartende Writes werden verworfen, der laufende wird abgewartet.
   * Resolved mit false bei Fehler oder Verwerfen (wird geloggt), wirft nie.
   */
  send(bytes: Uint8Array, opts: { urgent?: boolean } = {}): Promise<boolean> {
    const task = async () => {
      this.ev.log(`→ ${hex(bytes)}`);
      const d = this.device;
      if (!d?.connected) throw new Error('nicht verbunden');
      await d.write(FTMS_SERVICE, CH.control, bytes);
    };
    return (opts.urgent ? this.queue.runUrgent(task) : this.queue.run(task)).then(
      () => true,
      (e: unknown) => {
        if (e instanceof DroppedError) this.ev.log(`verworfen: ${hex(bytes)} (Stop/Pause hat Vorrang)`);
        else this.ev.log(`❌ Schreibfehler: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      },
    );
  }
}
