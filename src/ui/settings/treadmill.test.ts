import { describe, expect, it } from 'vitest';
import { parseDecimal } from './treadmill';

describe('parseDecimal', () => {
  it('reads a decimal point or comma, as typed in any language', () => {
    expect(parseDecimal('3,5')).toBe(3.5);
    expect(parseDecimal('3.5')).toBe(3.5);
    expect(parseDecimal(' 4 ')).toBe(4);
    expect(parseDecimal('2,')).toBe(2);
    expect(parseDecimal(',5')).toBe(0.5);
  });

  it('refuses anything that is not plainly a number, instead of reading the start of it', () => {
    for (const raw of ['', ' ', 'abc', '3,5x', '3.5.1', '3,5,1', '1e3', '-3', '+3', '3 5', 'Infinity']) {
      expect(parseDecimal(raw)).toBeNaN();
    }
  });
});
