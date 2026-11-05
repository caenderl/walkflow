import { afterEach, describe, expect, it } from 'vitest';
import { setUnits } from '../units';
import { hoursMinutes, numberFormat, plural3, unitFormat, type UnitLabels } from './format';

afterEach(() => setUnits('metric'));

describe('plural3 (one, few, many: Ukrainian and other Slavic languages)', () => {
  const word = (n: number) => plural3(n, 'крок', 'кроки', 'кроків', 'uk');

  it('uses the singular for 1, 21, 101 and the few form for 2 to 4, 22 to 24', () => {
    expect([1, 21, 101].map(word)).toEqual(['крок', 'крок', 'крок']);
    expect([2, 3, 4, 22, 24, 102].map(word)).toEqual(Array(6).fill('кроки'));
  });

  it('uses the many form for 0, 5 to 20, 25 and the teens of every hundred', () => {
    expect([0, 5, 11, 12, 14, 20, 25, 100, 111, 112].map(word)).toEqual(Array(10).fill('кроків'));
  });
});

describe('unit labels of a language', () => {
  const uk: UnitLabels = { kmh: 'км/год', mph: 'миль/год', km: 'км', mi: 'миль', m: 'м', ft: 'фут', h: 'год', min: 'хв' };
  const n = numberFormat('uk');

  it('default to the Latin names', () => {
    const u = unitFormat(numberFormat('en'));
    expect(u.speed(4.5, 1)).toBe('4.5 km/h');
    expect(u.dist(2500)).toBe('2.50 km');
    expect(u.length(400)).toBe('400 m');
    expect(hoursMinutes(7500)).toBe('2 h 05 min');
  });

  it('name the speed, the distance and the length in the language, metric and imperial', () => {
    const u = unitFormat(n, uk);
    expect(u.speed(4.5, 1)).toBe('4,5 км/год');
    expect(u.dist(2500)).toBe('2,50 км');
    expect(u.short(1234)).toBe('1234 м');
    expect(u.length(400)).toBe('400 м');
    expect(u.length(2500)).toBe('2,50 км');
    expect(u.speedUnit()).toBe('км/год');
    setUnits('imperial');
    expect(u.speed(8.04672, 1)).toBe('5,0 миль/год');
    expect(u.dist(1609.344)).toBe('1,00 миль');
    expect(u.short(100)).toBe('328 фут');
    expect(u.length(50)).toBe('164 фут');
    expect(u.distUnit()).toBe('миль');
  });

  it('write hours and minutes with the names of the language', () => {
    expect(hoursMinutes(7500, uk)).toBe('2 год 05 хв');
    expect(hoursMinutes(2700, uk)).toBe('45 хв');
  });
});
