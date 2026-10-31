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
