import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseVersion } from './version';

describe('versions', () => {
  it('parses with and without v', () => {
    expect(parseVersion('v1.2.3')).toEqual({ parts: [1, 2, 3], pre: false });
    expect(parseVersion('0.10.0-beta.1')).toEqual({ parts: [0, 10, 0], pre: true });
    expect(parseVersion('broken')).toBeNull();
  });

  it('compares numerically', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('v1.0.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
  });

  it('pre-releases do not count as newer than the same version', () => {
    expect(isNewerVersion('1.0.0-rc.1', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true);
  });

  it('unreadable versions are never newer', () => {
    expect(isNewerVersion('latest', '0.1.0')).toBe(false);
  });
});
