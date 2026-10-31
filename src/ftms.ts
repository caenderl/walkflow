// FTMS-Protokoll (Fitness Machine Service, 0x1826) als reine Funktionen.
// Keine DOM- und keine BLE-Abhängigkeit, damit alles ohne Hardware testbar ist.

export const FTMS_SERVICE = 0x1826;
export const HR_SERVICE = 0x180d;
export const DEVINFO_SERVICE = 0x180a;

export const CH = {
  feature: 0x2acc,
  treadmillData: 0x2acd,
  trainingStatus: 0x2ad3,
  speedRange: 0x2ad4,
  inclRange: 0x2ad5,
  control: 0x2ad9,
  machineStatus: 0x2ada,
  hr: 0x2a37,
} as const;

export const DEVINFO_CH = {
  manufacturer: 0x2a29,
  model: 0x2a24,
  firmware: 0x2a26,
} as const;

export const OP = {
  REQUEST_CONTROL: 0x00,
  SET_SPEED: 0x02,
  SET_INCL: 0x03,
  START: 0x07,
  STOP_PAUSE: 0x08,
  RESPONSE: 0x80,
} as const;

export const OP_NAMES: Record<number, string> = {
  0x00: 'Request Control',
  0x02: 'Set Speed',
  0x03: 'Set Inclination',
  0x07: 'Start/Resume',
  0x08: 'Stop/Pause',
};

export const RESULTS: Record<number, string> = {
  1: 'OK',
  2: 'nicht unterstützt',
  3: 'ungültiger Parameter',
  4: 'fehlgeschlagen',
  5: 'keine Berechtigung',
};

export const FEAT_MACHINE = ['Avg Speed', 'Cadence', 'Total Distance', 'Inclination', 'Elevation Gain', 'Pace', 'Step Count', 'Resistance', 'Stride Count', 'Expended Energy', 'Heart Rate', 'MET', 'Elapsed Time', 'Remaining Time', 'Power', 'Force on Belt', 'User Data'];
export const FEAT_TARGET = ['Speed', 'Inclination', 'Resistance', 'Power', 'Heart Rate', 'Energy', 'Steps', 'Strides', 'Distance', 'Training Time', 'Time 2 HR zones', 'Time 3 HR zones', 'Time 5 HR zones', 'Bike Sim', 'Wheel Circ.', 'Spin Down', 'Cadence'];

// ---------- Hilfsfunktionen ----------

export function toBytes(data: DataView | Uint8Array | ArrayLike<number>): number[] {
  if (data instanceof DataView) return [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)];
  return Array.from(data);
}

export function hex(data: DataView | Uint8Array | ArrayLike<number>): string {
  return toBytes(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

export function bitNames(value: number, names: readonly string[]): string[] {
  return names.filter((_, i) => value & (1 << i));
}

export function dataView(bytes: ArrayLike<number>): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

// ---------- Treadmill Data (0x2ACD) ----------

export interface TreadmillData {
  /** km/h */
  speed?: number;
  /** km/h */
  avgSpeed?: number;
  /** Meter */
  dist?: number;
  /** % */
  incl?: number;
  /** Grad */
  rampAngle?: number;
  /** Meter */
  elevationGainPos?: number;
  /** Meter */
  elevationGainNeg?: number;
  /** km/min (FTMS-Einheit, 0,1) */
  pace?: number;
  avgPace?: number;
  /** kcal gesamt */
  kcal?: number;
  kcalPerHour?: number;
  kcalPerMin?: number;
  /** bpm, 0 = kein Wert */
  hr?: number;
  met?: number;
  /** Sekunden */
  time?: number;
}

/**
 * Parst ein Treadmill-Data-Paket. Felder stehen nur drin, wenn ihr Flag-Bit gesetzt ist.
 * Bit 0 ist invertiert (0 = Instantaneous Speed vorhanden).
 * Bei abgeschnittenen Paketen bleiben die bis dahin gelesenen Felder erhalten.
 */
export function parseTreadmillData(dv: DataView): TreadmillData {
  const r: TreadmillData = {};
  try {
    let o = 0;
    const flags = dv.getUint16(o, true); o += 2;
    if (!(flags & 0x0001)) { r.speed = dv.getUint16(o, true) / 100; o += 2; }
    if (flags & 0x0002) { r.avgSpeed = dv.getUint16(o, true) / 100; o += 2; }
    if (flags & 0x0004) { r.dist = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); o += 3; }
    if (flags & 0x0008) {
      r.incl = dv.getInt16(o, true) / 10;
      r.rampAngle = dv.getInt16(o + 2, true) / 10;
      o += 4;
    }
    if (flags & 0x0010) {
      r.elevationGainPos = dv.getUint16(o, true) / 10;
      r.elevationGainNeg = dv.getUint16(o + 2, true) / 10;
      o += 4;
    }
    if (flags & 0x0020) { r.pace = dv.getUint8(o) / 10; o += 1; }
    if (flags & 0x0040) { r.avgPace = dv.getUint8(o) / 10; o += 1; }
    if (flags & 0x0080) {
      const k = dv.getUint16(o, true);
      if (k !== 0xffff) r.kcal = k;
      const kh = dv.getUint16(o + 2, true);
      if (kh !== 0xffff) r.kcalPerHour = kh;
      const km = dv.getUint8(o + 4);
      if (km !== 0xff) r.kcalPerMin = km;
      o += 5;
    }
    if (flags & 0x0100) { r.hr = dv.getUint8(o); o += 1; }
    if (flags & 0x0200) { r.met = dv.getUint8(o) / 10; o += 1; }
    if (flags & 0x0400) { r.time = dv.getUint16(o, true); o += 2; }
  } catch {
    // unvollständiges Paket: bisher gelesene Felder behalten
  }
  return r;
}

// ---------- Heart Rate Measurement (0x2A37) ----------

export function parseHeartRate(dv: DataView): number {
  return (dv.getUint8(0) & 1) ? dv.getUint16(1, true) : dv.getUint8(1);
}

// ---------- Feature / Ranges ----------

export interface Features {
  machine: number;
  target: number;
  machineNames: string[];
  targetNames: string[];
}

export function parseFeatures(dv: DataView): Features {
  const machine = dv.getUint32(0, true);
  const target = dv.getUint32(4, true);
  return { machine, target, machineNames: bitNames(machine, FEAT_MACHINE), targetNames: bitNames(target, FEAT_TARGET) };
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

/** Supported Speed Range (0x2AD4): uint16 min, max, step in 0,01 km/h */
export function parseSpeedRange(dv: DataView): Range {
  return { min: dv.getUint16(0, true) / 100, max: dv.getUint16(2, true) / 100, step: dv.getUint16(4, true) / 100 };
}

/** Supported Inclination Range (0x2AD5): sint16 min, sint16 max, uint16 step in 0,1 % */
export function parseInclinationRange(dv: DataView): Range {
  return { min: dv.getInt16(0, true) / 10, max: dv.getInt16(2, true) / 10, step: dv.getUint16(4, true) / 10 };
}

// ---------- Control Point (0x2AD9): Befehle ----------

export function cmdRequestControl(): Uint8Array {
  return new Uint8Array([OP.REQUEST_CONTROL]);
}

export function cmdStart(): Uint8Array {
  return new Uint8Array([OP.START]);
}

export function cmdStop(): Uint8Array {
  return new Uint8Array([OP.STOP_PAUSE, 0x01]);
}

export function cmdPause(): Uint8Array {
  return new Uint8Array([OP.STOP_PAUSE, 0x02]);
}

/** Zielgeschwindigkeit, uint16 LE in 0,01 km/h */
export function cmdSetSpeed(kmh: number): Uint8Array {
  const v = Math.round(kmh * 100);
  if (!Number.isFinite(v) || v < 0 || v > 0xffff) throw new RangeError(`Speed außerhalb uint16: ${kmh}`);
  return new Uint8Array([OP.SET_SPEED, v & 0xff, (v >> 8) & 0xff]);
}

/** Zielsteigung, sint16 LE in 0,1 % */
export function cmdSetInclination(pct: number): Uint8Array {
  const v = Math.round(pct * 10);
  if (!Number.isFinite(v) || v < -0x8000 || v > 0x7fff) throw new RangeError(`Steigung außerhalb sint16: ${pct}`);
  const dv = new DataView(new ArrayBuffer(3));
  dv.setUint8(0, OP.SET_INCL);
  dv.setInt16(1, v, true);
  return new Uint8Array(dv.buffer);
}

/** Liest die Zielgeschwindigkeit aus einem rohen Set-Speed-Befehl, sonst null. */
export function decodeSetSpeed(bytes: ArrayLike<number>): number | null {
  if (bytes.length < 3 || bytes[0] !== OP.SET_SPEED) return null;
  return ((bytes[1] ?? 0) | ((bytes[2] ?? 0) << 8)) / 100;
}

// ---------- Control Point: Antworten ----------

export interface ControlPointResponse {
  requestOp: number;
  result: number;
}

export function parseControlPointResponse(dv: DataView): ControlPointResponse | null {
  if (dv.byteLength < 3 || dv.getUint8(0) !== OP.RESPONSE) return null;
  return { requestOp: dv.getUint8(1), result: dv.getUint8(2) };
}

export function describeControlPointResponse(r: ControlPointResponse): string {
  return `${OP_NAMES[r.requestOp] ?? '0x' + r.requestOp.toString(16)}: ${RESULTS[r.result] ?? r.result}`;
}
