// Number formatting for the locale files: decimal separator per language, no thousands grouping.

import { KM_PER_MILE, toDist, toShort, toSpeed, units } from '../units';

/** The names of the units and of hours and minutes in a language (the values are always km/h, metres and seconds) */
export interface UnitLabels { kmh: string; mph: string; km: string; mi: string; m: string; ft: string; h: string; min: string }
export const LATIN_UNITS: UnitLabels = { kmh: 'km/h', mph: 'mph', km: 'km', mi: 'mi', m: 'm', ft: 'ft', h: 'h', min: 'min' };

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

/** Three forms (1, 21 …: one; 2 to 4, 22 to 24 …: few; 0, 5 to 20 …: many), as Ukrainian and other Slavic languages count */
export function plural3(count: number, one: string, few: string, many: string, locale: string): string {
  const category = new Intl.PluralRules(locale).select(count);
  return category === 'one' ? one : category === 'few' ? few : many;
}

/** 0:45, 32:10, 1:05:30 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
}

/** 45 min, 2 h 05 min */
export function hoursMinutes(sec: number, labels: UnitLabels = LATIN_UNITS): string {
  const m = Math.round(Math.max(0, sec) / 60), h = Math.floor(m / 60);
  return h ? `${h} ${labels.h} ${String(m % 60).padStart(2, '0')} ${labels.min}` : `${m} ${labels.min}`;
}

/** Dates in the format of the language. The year is only shown when it is not the current one. */
export function dateFormat(locale: string) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o);
  const hm = { hour: '2-digit', minute: '2-digit' } as const;
  const dateTime = f({ weekday: 'short', day: 'numeric', month: 'short', ...hm });
  const dateTimeYear = f({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...hm });
  const day = f({ day: 'numeric', month: 'short' });
  /** 9.11. (de), 11/9 (en), 09/11 (fr): for chart labels */
  const numericDay = f({ day: 'numeric', month: 'numeric' });
  const dayYear = f({ day: 'numeric', month: 'short', year: 'numeric' });
  const tick = f({ day: '2-digit', month: 'short' });
  const time = f(hm);
  const weekday = f({ weekday: 'long' });
  const thisYear = (ts: number) => new Date(ts).getFullYear() === new Date().getFullYear();
  return {
    dateTime: (ts: number) => (thisYear(ts) ? dateTime : dateTimeYear).format(ts),
    day: (ts: number) => (thisYear(ts) ? day : dayYear).format(ts),
    /** Short, for chart labels */
    shortDay: (ts: number) => day.format(ts),
    /** Even shorter, only numbers */
    numericDay: (ts: number) => numericDay.format(ts),
    /**
     * A chart label in two lines: the day, then the month. 01. over Nov (de), 01 over Nov (en). The day keeps the dot the
     * language puts behind it; the month loses the one of its abbreviation, as it stands alone.
     */
    dayTick: (ts: number): [string, string] => {
      const parts = tick.formatToParts(ts);
      const i = parts.findIndex(p => p.type === 'day');
      const dot = parts[i + 1]?.type === 'literal' && parts[i + 1]!.value.trim() === '.' ? '.' : '';
      const month = (parts.find(p => p.type === 'month')?.value ?? '').replace(/\.$/, '');
      return [`${parts[i]?.value ?? ''}${dot}`, month];
    },
    weekday: (ts: number) => weekday.format(ts),
    time: (ts: number) => time.format(ts),
  };
}

/**
 * Speeds and lengths for the texts of a language, in the units chosen in the settings (src/i18n/units.ts). The numbers are
 * always metric (km/h, metres); the choice only decides what is shown.
 */
export function unitFormat(n: NumberFormat, labels: UnitLabels = LATIN_UNITS) {
  const imperial = () => units === 'imperial';
  const speedUnit = () => (imperial() ? labels.mph : labels.kmh);
  const distUnit = () => (imperial() ? labels.mi : labels.km);
  const shortUnit = () => (imperial() ? labels.ft : labels.m);
  return {
    /** The word for minutes ("min"), for lengths of time written as 5:00 min */
    minuteUnit: labels.min,
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
    length: (m: number) => (imperial()
      ? (m < 0.1 * KM_PER_MILE * 1000 ? `${n(Math.round(toShort(m)))} ${labels.ft}` : `${n(toDist(m), 2)} ${labels.mi}`)
      : (m < 1000 ? `${n(Math.round(m))} ${labels.m}` : `${n(m / 1000, 2)} ${labels.km}`)),
  };
}
