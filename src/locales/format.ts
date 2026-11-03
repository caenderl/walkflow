// Number formatting for the locale files: decimal separator per language, no thousands grouping.

import { distUnit, KM_PER_MILE, shortUnit, speedUnit, toDist, toShort, toSpeed, units } from '../units';

export type NumberFormat = (value: number, digits?: number) => string;

/** `digits` = fixed number of decimals; omitted = up to 2 decimals, as needed. */
export function numberFormat(locale: string): NumberFormat {
  const cache = new Map<number, Intl.NumberFormat>();
  return (value, digits) => {
    const key = digits ?? -1;
    let f = cache.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, digits === undefined
        ? { maximumFractionDigits: 2, useGrouping: false }
        : { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
      cache.set(key, f);
    }
    return f.format(value);
  };
}

export const plural = (count: number, one: string, other: string) => (count === 1 ? one : other);

/** 0:45, 32:10, 1:05:30 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
}

/** 45 min, 2 h 05 min */
export function hoursMinutes(sec: number): string {
  const m = Math.round(Math.max(0, sec) / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** Dates in the format of the language. The year is only shown when it is not the current one. */
export function dateFormat(locale: string) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o);
  const hm = { hour: '2-digit', minute: '2-digit' } as const;
  const dateTime = f({ weekday: 'short', day: 'numeric', month: 'short', ...hm });
  const dateTimeYear = f({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...hm });
  const day = f({ day: 'numeric', month: 'short' });
  const dayYear = f({ day: 'numeric', month: 'short', year: 'numeric' });
  const time = f(hm);
  const weekday = f({ weekday: 'long' });
  const thisYear = (ts: number) => new Date(ts).getFullYear() === new Date().getFullYear();
  return {
    dateTime: (ts: number) => (thisYear(ts) ? dateTime : dateTimeYear).format(ts),
    day: (ts: number) => (thisYear(ts) ? day : dayYear).format(ts),
    /** Short, for chart labels */
    shortDay: (ts: number) => day.format(ts),
    weekday: (ts: number) => weekday.format(ts),
    time: (ts: number) => time.format(ts),
  };
}

/**
 * Speeds and lengths for the texts of a language, in the units chosen in the settings (src/units.ts). The numbers are
 * always metric (km/h, metres); the choice only decides what is shown.
 */
export function unitFormat(n: NumberFormat) {
  return {
    /** "5.5 km/h" or "3.4 mph" */
    speed: (kmh: number, digits?: number) => `${n(toSpeed(kmh), digits)} ${speedUnit()}`,
    /** The number alone, for ranges: "1 – 6 km/h" */
    speedValue: (kmh: number, digits?: number) => n(toSpeed(kmh), digits),
    speedUnit,
    /** "2.54 km" or "1.58 mi" */
    dist: (m: number, digits = 2) => `${n(toDist(m), digits)} ${distUnit()}`,
    distValue: (m: number, digits = 2) => n(toDist(m), digits),
    distUnit,
    /** Whole metres or feet: heights, climbs, short distances */
    short: (m: number) => `${n(Math.round(toShort(m)))} ${shortUnit()}`,
    shortUnit,
    /** The length of a step or a route: metres (feet) when short, otherwise km (miles) */
    length: (m: number) => (units === 'imperial'
      ? (m < 0.1 * KM_PER_MILE * 1000 ? `${n(Math.round(toShort(m)))} ft` : `${n(toDist(m), 2)} mi`)
      : (m < 1000 ? `${n(Math.round(m))} m` : `${n(m / 1000, 2)} km`)),
  };
}
