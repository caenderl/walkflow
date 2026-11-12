import { describe, expect, it } from 'vitest';
import { decideLimitChange, loadLimit, parseMaxStep, serializeLimit } from './limit-settings';

describe('changing the limit', () => {
  it('values up to 6 km/h without confirmation', () => {
    expect(decideLimitChange('5.5', 6)).toEqual({ ok: true, value: 5.5, needsConfirmation: false });
    expect(decideLimitChange('6', 4)).toEqual({ ok: true, value: 6, needsConfirmation: false });
  });

  it('values above 6 km/h need a confirmation if they raise the limit', () => {
    expect(decideLimitChange('6.5', 6)).toEqual({ ok: true, value: 6.5, needsConfirmation: true });
    expect(decideLimitChange('8', 7)).toEqual({ ok: true, value: 8, needsConfirmation: true });
  });

  it('lowering never needs a confirmation', () => {
    expect(decideLimitChange('7', 8)).toEqual({ ok: true, value: 7, needsConfirmation: false });
  });

  it('invalid or nonsensical values are rejected', () => {
    expect(decideLimitChange('', 6).ok).toBe(false);
    expect(decideLimitChange('abc', 6).ok).toBe(false);
    expect(decideLimitChange('0.5', 6).ok).toBe(false);
    expect(decideLimitChange('25', 6).ok).toBe(false);
    expect(decideLimitChange('abc', 6)).toEqual({ ok: false, reason: { code: 'limit-not-a-number' } });
    expect(decideLimitChange('25', 6)).toEqual({ ok: false, reason: { code: 'limit-out-of-range', min: 1, max: 20 } });
  });

  it('rounds to 0.1 km/h', () => {
    expect(decideLimitChange('4.56', 6)).toMatchObject({ value: 4.6 });
  });
});

describe('stored limit', () => {
  it('no stored value: 6 km/h', () => {
    expect(loadLimit(null, null)).toEqual({ value: 6 });
  });

  it('confirmed values above 6 are kept', () => {
    expect(loadLimit(serializeLimit(8, true), null)).toEqual({ value: 8, confirmed: true });
    expect(loadLimit(serializeLimit(5, false), null)).toEqual({ value: 5 });
  });

  it('unconfirmed values above 6 are not adopted', () => {
    expect(loadLimit(serializeLimit(8, false), null)).toEqual({ value: 6, note: { code: 'limit-stored-unconfirmed', value: 8, applied: 6 } });
    expect(loadLimit('{"value":9}', null).value).toBe(6);
  });

  it('the prototype value "cap" is adopted up to 6 km/h, not above', () => {
    expect(loadLimit(null, '5')).toEqual({ value: 5 });
    const r = loadLimit(null, '9');
    expect(r.value).toBe(6);
    expect(r.note).toEqual({ code: 'limit-legacy-not-adopted', value: 9, above: 6 });
  });

  it('broken or nonsensical values → 6 km/h', () => {
    expect(loadLimit('{broken', null).value).toBe(6);
    expect(loadLimit(serializeLimit(50, true), null).value).toBe(6);
    expect(loadLimit(null, 'abc').value).toBe(6);
  });
});

describe('maximum change per command', () => {
  it('default 0.5 km/h, allowed 0.1 to 1.0', () => {
    expect(parseMaxStep('0.3')).toBe(0.3);
    expect(parseMaxStep('0,2')).toBe(0.2);
    expect(parseMaxStep('0.05')).toBeNull();
    expect(parseMaxStep('1.5')).toBeNull();
    expect(parseMaxStep('x')).toBeNull();
  });
});
