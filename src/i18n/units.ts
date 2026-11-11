// Units of measurement. Everything the app stores, sends and checks is metric: speeds in km/h, distances in metres, the
// limit of 6 km/h, the step of 0.5 km/h. This module only turns those values into what is shown (km, km/h, m or
// mi, mph, ft) and what is typed into fields back into km/h. No DOM access, so the pure modules can use it.

export type UnitSystem = 'metric' | 'imperial';
export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];
export const UNITS_STORAGE_KEY = 'walkflow.units';

export const KM_PER_MILE = 1.609344;
export const M_PER_FOOT = 0.3048;

/** Live binding: importers always see the current system. */
export let units: UnitSystem = 'metric';

const listeners = new Set<(u: UnitSystem) => void>();

/** Anything but "imperial" is metric */
export function parseUnits(raw: string | null | undefined): UnitSystem {
  return raw === 'imperial' ? 'imperial' : 'metric';
}

export function setUnits(u: UnitSystem) {
  if (u === units) return;
  units = u;
  for (const cb of [...listeners]) cb(u);
}

/** Returns the unsubscribe function. */
export function onUnitsChange(cb: (u: UnitSystem) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const imperial = () => units === 'imperial';

export const speedUnit = (): string => (imperial() ? 'mph' : 'km/h');
export const toSpeed = (kmh: number): number => (imperial() ? kmh / KM_PER_MILE : kmh);
export const fromSpeed = (v: number): number => (imperial() ? v * KM_PER_MILE : v);

/** Long distances: km or miles */
export const distUnit = (): string => (imperial() ? 'mi' : 'km');
export const toDist = (m: number): number => (imperial() ? m / (KM_PER_MILE * 1000) : m / 1000);
export const fromDist = (v: number): number => (imperial() ? v * KM_PER_MILE * 1000 : v * 1000);

/** Short distances and heights: metres or feet */
export const shortUnit = (): string => (imperial() ? 'ft' : 'm');
export const toShort = (m: number): number => (imperial() ? m / M_PER_FOOT : m);
export const fromShort = (v: number): number => (imperial() ? v * M_PER_FOOT : v);

/** One press of the + and - buttons, in km/h: half a km/h, or half a mile per hour */
export const speedStep = (): number => (imperial() ? 0.5 * KM_PER_MILE : 0.5);

/**
 * A speed typed into a field, as km/h text for the checks in safety.ts (which take km/h and round it themselves).
 * Decimal point or comma. Text that is not a number is returned as it is, so the check can refuse it.
 */
export function speedFromInput(raw: string): string {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return raw;
  return imperial() ? String(Math.round(fromSpeed(v) * 100) / 100) : String(v);
}

/**
 * A speed for a text field: in the shown unit, up to 2 decimals, with the decimal separator of the language (`n` is
 * t.number). speedFromInput reads it back. Text fields, not type="number": those drop "4,5" when the browser's locale
 * uses a decimal point.
 */
export const speedFieldText = (kmh: number, n: (v: number) => string): string => n(Math.round(toSpeed(kmh) * 100) / 100);

/** The quick-select speeds, in the shown unit: 2 to 5 km/h, or 1.5 to 3 mph */
export const speedPresets = (): readonly number[] => (imperial() ? [1.5, 2, 2.5, 3] : [2, 3, 4, 5]);
