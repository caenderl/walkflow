import { describe, expect, it } from 'vitest';
import { checkConsoleCommand, clampSpeed, DEFAULT_SPEED_LIMIT, effectiveMax, parseHexBytes, parseLimit } from './safety';

describe('Speed-Limit (Bestand)', () => {
  it('Standard-Limit ist 6 km/h', () => {
    expect(DEFAULT_SPEED_LIMIT).toBe(6);
  });

  it('effektives Maximum ist das kleinere aus Geräte-Max und eigenem Limit', () => {
    expect(effectiveMax(12, 6)).toBe(6);
    expect(effectiveMax(5, 6)).toBe(5);
  });

  it('parseLimit fällt bei ungültiger Eingabe auf 6 zurück', () => {
    expect(parseLimit('4.5')).toBe(4.5);
    expect(parseLimit('')).toBe(6);
    expect(parseLimit('abc')).toBe(6);
    expect(parseLimit('0')).toBe(6);
  });
});

describe('clampSpeed', () => {
  const range = { min: 1, max: 6 };

  it('kappt nach oben und unten', () => {
    expect(clampSpeed(9, range)).toBe(6);
    expect(clampSpeed(0.2, range)).toBe(1);
  });

  it('rundet auf 0,1 km/h', () => {
    expect(clampSpeed(3.04, range)).toBe(3);
    expect(clampSpeed(3.06, range)).toBe(3.1);
  });

  it('liefert nie einen Wert über dem Maximum, auch wenn das Limit unter dem Geräte-Minimum liegt', () => {
    expect(clampSpeed(3, { min: 1.5, max: 1 })).toBeNull();
  });

  it('NaN und Unendlich → null', () => {
    expect(clampSpeed(Number.NaN, range)).toBeNull();
    expect(clampSpeed(Number.POSITIVE_INFINITY, range)).toBeNull();
  });
});

describe('Experimentier-Konsole', () => {
  it('parst Hex-Bytes mit Leerzeichen oder Kommas', () => {
    expect(parseHexBytes('02 2C 01')).toEqual([0x02, 0x2c, 0x01]);
    expect(parseHexBytes(' 08,01 ')).toEqual([0x08, 0x01]);
  });

  it('lehnt alles ab, was kein sauberes Hex-Byte ist', () => {
    expect(parseHexBytes('')).toBeNull();
    expect(parseHexBytes('zz')).toBeNull();
    expect(parseHexBytes('100')).toBeNull();
    expect(parseHexBytes('2z')).toBeNull(); // parseInt würde hier 2 liefern
  });

  it('blockt Set-Speed über dem Limit', () => {
    const r = checkConsoleCommand([0x02, 0x58, 0x02], 6); // 6,00 km/h
    expect(r.ok).toBe(true);
    const r2 = checkConsoleCommand([0x02, 0x59, 0x02], 6); // 6,01 km/h
    expect(r2.ok).toBe(false);
  });

  it('lässt andere Befehle roh durch', () => {
    expect(checkConsoleCommand([0x08, 0x01], 6).ok).toBe(true);
  });
});
