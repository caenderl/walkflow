// Sicherheitslogik: Limits, Rampen, Prüfung von Konsolenbefehlen, Zustandsabschätzung.
// Reine Logik ohne DOM/BLE, vollständig getestet (safety.test.ts). Nicht aufweichen.

import { decodeSetSpeed, OP } from './ftms';

const EPS = 1e-9;

// ---------- Limit ----------

export const DEFAULT_SPEED_LIMIT = 6;
export const LIMIT_MIN = 1;
export const LIMIT_MAX = 20;
/** Limits über diesem Wert nur mit zusätzlicher Bestätigung. */
export const LIMIT_CONFIRM_ABOVE = 6;

export const LIMIT_STORAGE_KEY = 'walkflow.speedLimit';
/** Schlüssel aus dem Prototyp */
export const LEGACY_LIMIT_KEY = 'cap';

export interface SpeedRange {
  min: number;
  max: number;
}

export function effectiveMax(deviceMax: number, userLimit: number): number {
  return Math.min(deviceMax, userLimit);
}

/** Eingabe aus dem Limit-Feld. Ungültig oder ≤ 0 → Standard-Limit. */
export function parseLimit(raw: string): number {
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_SPEED_LIMIT;
}

export type LimitDecision =
  | { ok: true; value: number; needsConfirmation: boolean }
  | { ok: false; reason: string };

export function decideLimitChange(raw: string, current: number): LimitDecision {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return { ok: false, reason: 'Keine Zahl' };
  const value = Math.round(v * 10) / 10;
  if (value < LIMIT_MIN || value > LIMIT_MAX) {
    return { ok: false, reason: `Limit muss zwischen ${LIMIT_MIN} und ${LIMIT_MAX} km/h liegen` };
  }
  return { ok: true, value, needsConfirmation: value > LIMIT_CONFIRM_ABOVE && value > current };
}

export function serializeLimit(value: number, confirmedAbove6: boolean): string {
  return JSON.stringify({ value, confirmedAbove6 });
}

function validStoredLimit(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= LIMIT_MIN && v <= LIMIT_MAX;
}

/**
 * Lädt das gespeicherte Limit. Werte über 6 km/h gelten nur, wenn sie bestätigt gespeichert wurden.
 * Der Prototyp-Wert ("cap") wurde nie bestätigt und wird deshalb nur bis 6 km/h übernommen.
 */
export function loadLimit(stored: string | null, legacyCap: string | null): { value: number; note?: string } {
  if (stored !== null) {
    try {
      const o = JSON.parse(stored) as { value?: unknown; confirmedAbove6?: unknown };
      if (validStoredLimit(o.value)) {
        if (o.value <= LIMIT_CONFIRM_ABOVE || o.confirmedAbove6 === true) return { value: o.value };
        return { value: DEFAULT_SPEED_LIMIT, note: `Gespeichertes Limit ${o.value} km/h ohne Bestätigung, zurück auf ${DEFAULT_SPEED_LIMIT}` };
      }
    } catch { /* kaputt → weiter unten */ }
  } else if (legacyCap !== null) {
    const v = parseFloat(legacyCap);
    if (validStoredLimit(v)) {
      if (v <= LIMIT_CONFIRM_ABOVE) return { value: v };
      return { value: DEFAULT_SPEED_LIMIT, note: `Limit ${v} km/h aus dem Prototyp nicht übernommen (über ${LIMIT_CONFIRM_ABOVE} km/h braucht eine Bestätigung)` };
    }
  }
  return { value: DEFAULT_SPEED_LIMIT };
}

// ---------- Clamping ----------

const floor01 = (x: number) => Math.floor(x * 10 + EPS) / 10;
const ceil01 = (x: number) => Math.ceil(x * 10 - EPS) / 10;

/**
 * Kappt auf [min, max] und rundet auf 0,1 km/h, ohne dabei die Grenzen zu verlassen.
 * Gibt es keinen erlaubten Wert (z. B. Limit unter Geräte-Minimum), kommt null zurück,
 * statt still das Minimum zu senden.
 */
export function clampSpeed(kmh: number, range: SpeedRange): number | null {
  if (!Number.isFinite(kmh) || range.max < range.min) return null;
  let v = Math.round(Math.max(range.min, Math.min(range.max, kmh)) * 10) / 10;
  if (v > range.max) v = floor01(range.max);
  if (v < range.min) v = ceil01(range.min);
  return v > range.max + EPS || v < range.min - EPS ? null : v;
}

// ---------- Rampe ----------

export const DEFAULT_MAX_STEP = 0.5;
export const MAX_STEP_MIN = 0.1;
export const MAX_STEP_MAX = 1;
/** Mindestabstand zwischen zwei Speed-Befehlen */
export const RAMP_INTERVAL_MS = 1500;
export const MAX_STEP_STORAGE_KEY = 'walkflow.maxStep';

export function parseMaxStep(raw: string): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v < MAX_STEP_MIN - EPS || v > MAX_STEP_MAX + EPS) return null;
  return Math.round(v * 10) / 10;
}

/**
 * Zwischenziele von `from` nach `to`. Jede Stufe ändert höchstens `maxStep`, alle Werte liegen in der Range.
 * Einzige Ausnahme vom maxStep: Liegt `from` außerhalb der Range (z. B. 0 = Band steht, oder über einem
 * gerade gesenkten Limit), geht die erste Stufe direkt an die Range-Grenze. Über dem Limit wird nie kommandiert.
 */
export function planRamp(from: number, to: number, maxStep: number, range: SpeedRange): number[] {
  const target = clampSpeed(to, range);
  if (target === null || !Number.isFinite(from) || !(maxStep > 0)) return [];
  const steps: number[] = [];
  let prev = from;
  for (let guard = 0; guard < 2000; guard++) {
    const diff = target - prev;
    if (Math.abs(diff) < EPS) break;
    let next = Math.abs(diff) <= maxStep + EPS ? target : diff > 0 ? floor01(prev + maxStep) : ceil01(prev - maxStep);
    next = Math.min(range.max, Math.max(range.min, next));
    if (diff > 0 && next > target) next = target;
    if (diff < 0 && next < target) next = target;
    if (Math.abs(next - prev) < EPS) break;
    steps.push(next);
    prev = next;
  }
  return steps;
}

export interface GovernorDeps {
  /** Sendet Set Speed. false = Schreibfehler. */
  send(kmh: number): Promise<boolean>;
  now(): number;
  log?(msg: string): void;
  /** Ziel, letzter Befehl oder Rampenstatus haben sich geändert. */
  onChange?(): void;
}

export interface GovernorOptions {
  intervalMs: number;
  /** So lange nach einem Befehl gilt der Befehl als Basis, nicht der Messwert. */
  settleMs: number;
  /** So lange gilt ein Messwert als aktuell. */
  freshMs: number;
}

/**
 * Einzige Stelle, die Speed-Befehle erzeugt. Fährt jedes Ziel in Stufen von höchstens maxStep an,
 * mit mindestens intervalMs zwischen zwei Befehlen, und nie über die Range.
 */
export class SpeedGovernor {
  maxStep = DEFAULT_MAX_STEP;
  private range: SpeedRange = { min: 1, max: DEFAULT_SPEED_LIMIT };
  private _target: number | null = null;
  private last: { kmh: number; at: number } | null = null;
  private measured: { kmh: number; at: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;
  private gen = 0;
  private readonly opts: GovernorOptions;

  constructor(private readonly deps: GovernorDeps, opts: Partial<GovernorOptions> = {}) {
    this.opts = { intervalMs: RAMP_INTERVAL_MS, settleMs: 5000, freshMs: 3000, ...opts };
  }

  /** Gewünschtes Ziel (nach Kappung), null = keins */
  get target() { return this._target; }
  get lastCommand() { return this.last ? { ...this.last } : null; }
  get ramping() { return this.timer !== null || this.sending; }
  get currentRange(): SpeedRange { return { ...this.range }; }

  msSinceLastCommand(): number {
    return this.last ? this.deps.now() - this.last.at : Number.POSITIVE_INFINITY;
  }

  noteMeasured(kmh: number, at = this.deps.now()) {
    this.measured = { kmh, at };
  }

  /** Von außen gesendeter Speed-Befehl (Konsole): beendet die Rampe und zählt für den Mindestabstand. */
  noteExternalCommand(kmh: number) {
    this.cancel();
    this.last = { kmh, at: this.deps.now() };
  }

  /** Von hier aus wird geplant: letzter Befehl, solange das Band nachregelt, sonst der Messwert. */
  base(): number {
    const now = this.deps.now();
    const m = this.measured && now - this.measured.at < this.opts.freshMs ? this.measured.kmh : undefined;
    const l = this.last;
    if (!l) return m ?? this.range.min;
    if (now - l.at < this.opts.settleMs) return l.kmh;
    if (m !== undefined && Math.abs(m - l.kmh) > this.maxStep + EPS) return m;
    return l.kmh;
  }

  setRange(range: SpeedRange) {
    this.range = { ...range };
    if (this._target !== null) {
      this._target = clampSpeed(this._target, range);
      if (this._target === null) { this.cancel(); return; }
    }
    // Läuft das Band über einem gerade gesenkten Limit, aktiv auf das Limit regeln
    if ((this.last || this.measured) && this.base() > range.max + EPS) this.request(range.max);
    else this.pump();
  }

  request(kmh: number): number | null {
    const t = clampSpeed(kmh, this.range);
    if (t === null) {
      this.deps.log?.(`❌ Kein erlaubter Speed: Limit ${this.range.max} liegt unter dem Geräte-Minimum ${this.range.min}`);
      return null;
    }
    this._target = t;
    this.pump();
    this.deps.onChange?.();
    return t;
  }

  /** Rampe sofort beenden (Stop, Pause, Disconnect). */
  cancel() {
    this.gen++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this._target = null;
    this.deps.onChange?.();
  }

  /** Zusätzlich letzten Befehl und Messwert vergessen (nach Stop, Start, Disconnect). */
  reset() {
    this.cancel();
    this.last = null;
    this.measured = null;
  }

  private pump() {
    if (this.sending || this.timer !== null || this._target === null) return;
    const now = this.deps.now();
    const wait = this.last ? this.last.at + this.opts.intervalMs - now : 0;
    if (wait > 0) {
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, wait);
      return;
    }
    const target = this._target;
    let plan = planRamp(this.base(), target, this.maxStep, this.range);
    if (!plan.length) {
      if (this.last?.kmh === target) { this.deps.onChange?.(); return; }
      plan = [target]; // Basis ist schon das Ziel, Gerät bekommt es trotzdem explizit
    }
    const next = plan[0]!;
    const gen = this.gen;
    this.sending = true;
    this.last = { kmh: next, at: now };
    this.deps.onChange?.();
    void this.deps.send(next).catch(() => false).then(ok => {
      this.sending = false;
      if (gen === this.gen && !ok) {
        this._target = null;
        this.deps.log?.('❌ Rampe abgebrochen (Schreibfehler)');
        this.deps.onChange?.();
        return;
      }
      this.pump();
      this.deps.onChange?.();
    });
  }
}

// ---------- Konsole ----------

/** Hex-Bytes strikt: 1–2 Hex-Ziffern pro Byte, getrennt durch Leerzeichen oder Kommas. */
export function parseHexBytes(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.some(p => !/^[0-9a-f]{1,2}$/i.test(p))) return null;
  return parts.map(p => parseInt(p, 16));
}

export interface ConsoleContext {
  maxKmh: number;
  maxStep: number;
  /** Basis der Rampe (letzter Befehl oder Messwert) */
  baseKmh: number;
  msSinceLastSpeedCommand: number;
}

export type ConsoleCheck =
  | { action: 'send'; setSpeed?: number }
  | { action: 'block'; reason: string }
  | { action: 'confirm-start' };

const OP_SET_TARGET_HEART_RATE = 0x06;

export function checkConsoleCommand(bytes: number[], ctx: ConsoleContext): ConsoleCheck {
  const op = bytes[0];
  if (op === OP.SET_SPEED) {
    const kmh = decodeSetSpeed(bytes);
    if (kmh === null || bytes.length !== 3) return { action: 'block', reason: 'Set Speed braucht genau 3 Bytes (02 LSB MSB), blockiert' };
    if (kmh > ctx.maxKmh + EPS) return { action: 'block', reason: `${kmh} km/h liegt über dem Limit (${ctx.maxKmh}), blockiert` };
    if (Math.abs(kmh - ctx.baseKmh) > ctx.maxStep + EPS) {
      return { action: 'block', reason: `Sprung von ${ctx.baseKmh} auf ${kmh} km/h ist größer als ${ctx.maxStep} km/h, blockiert (Slider/Presets fahren Rampen)` };
    }
    if (ctx.msSinceLastSpeedCommand < RAMP_INTERVAL_MS) {
      return { action: 'block', reason: `Letzter Speed-Befehl vor weniger als ${RAMP_INTERVAL_MS / 1000} s, blockiert` };
    }
    return { action: 'send', setSpeed: kmh };
  }
  if (op === OP.START) return { action: 'confirm-start' };
  if (op === OP_SET_TARGET_HEART_RATE) {
    return { action: 'block', reason: 'Set Target Heart Rate blockiert: das Band würde den Speed selbst regeln, am Limit vorbei' };
  }
  return { action: 'send' };
}

// ---------- Zustand ----------

/** Im Zweifel läuft das Band. */
export function beltMaybeRunning(s: { startedByApp: boolean; lastMeasuredKmh: number | undefined }): boolean {
  return s.startedByApp || (s.lastMeasuredKmh ?? 0) > 0;
}

/**
 * Erkennt, dass das Band während eines Programms steht (z. B. per Fernbedienung oder Sicherheitsschlüssel
 * gestoppt), damit das Programm keine weiteren Befehle schickt.
 */
export class StandstillDetector {
  private armed = false;
  private zeroSince: number | null = null;

  constructor(private readonly thresholdMs = 8000) {}

  /** Scharf schalten. Mehrfaches arm() setzt einen laufenden Stillstand nicht zurück. */
  arm() {
    if (this.armed) return;
    this.armed = true;
    this.zeroSince = null;
  }
  disarm() { this.armed = false; this.zeroSince = null; }

  /** true genau einmal, wenn seit thresholdMs nur 0 km/h gemeldet wurde. */
  feed(kmh: number, now: number): boolean {
    if (!this.armed) return false;
    if (kmh > 0) { this.zeroSince = null; return false; }
    this.zeroSince ??= now;
    if (now - this.zeroSince >= this.thresholdMs) { this.disarm(); return true; }
    return false;
  }
}

// ---------- Erststart ----------

export const DISCLAIMER_VERSION = 1;
export const DISCLAIMER_STORAGE_KEY = 'walkflow.disclaimerAccepted';

export function isDisclaimerAccepted(stored: string | null): boolean {
  return stored === String(DISCLAIMER_VERSION);
}
