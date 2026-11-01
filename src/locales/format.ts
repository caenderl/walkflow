// Number formatting for the locale files: decimal separator per language, no thousands grouping.

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
