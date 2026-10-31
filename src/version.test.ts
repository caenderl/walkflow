import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseVersion } from './version';

describe('Versionen', () => {
  it('parst mit und ohne v', () => {
    expect(parseVersion('v1.2.3')).toEqual({ parts: [1, 2, 3], pre: false });
    expect(parseVersion('0.10.0-beta.1')).toEqual({ parts: [0, 10, 0], pre: true });
    expect(parseVersion('kaputt')).toBeNull();
  });

  it('vergleicht numerisch', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('v1.0.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
  });

  it('Vorabversionen zählen nicht als neuer als dieselbe Version', () => {
    expect(isNewerVersion('1.0.0-rc.1', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true);
  });

  it('Unlesbares ist nie neuer', () => {
    expect(isNewerVersion('latest', '0.1.0')).toBe(false);
  });
});
