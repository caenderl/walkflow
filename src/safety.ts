// Sicherheitslogik: Limits, Clamping, Prüfung von Konsolenbefehlen.
// Reine Funktionen, vollständig getestet (safety.test.ts). Nicht aufweichen.

import { decodeSetSpeed } from './ftms';

export const DEFAULT_SPEED_LIMIT = 6;

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

/**
 * Kappt auf [min, max] und rundet auf 0,1 km/h.
 * Liegt das Maximum unter dem Minimum (Limit kleiner als Geräte-Minimum), gibt es keinen
 * erlaubten Wert: null statt still das Minimum zu senden.
 */
export function clampSpeed(kmh: number, range: SpeedRange): number | null {
  if (!Number.isFinite(kmh) || range.max < range.min) return null;
  const v = Math.round(Math.max(range.min, Math.min(range.max, kmh)) * 10) / 10;
  // Runden darf nicht über das Maximum führen
  return v > range.max ? Math.floor(range.max * 10) / 10 : v;
}

/** Strikt: nur 1–2 Hex-Ziffern pro Byte, getrennt durch Leerzeichen oder Kommas. */
export function parseHexBytes(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.some(p => !/^[0-9a-f]{1,2}$/i.test(p))) return null;
  return parts.map(p => parseInt(p, 16));
}

export type ConsoleCheck = { ok: true } | { ok: false; reason: string };

export function checkConsoleCommand(bytes: number[], maxKmh: number): ConsoleCheck {
  const kmh = decodeSetSpeed(bytes);
  if (kmh !== null && kmh > maxKmh) {
    return { ok: false, reason: `${kmh} km/h liegt über dem Limit (${maxKmh}), blockiert` };
  }
  return { ok: true };
}
