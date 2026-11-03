import { describe, expect, it } from 'vitest';
import { devOrigin } from './dev-url';

describe('devOrigin', () => {
  it('takes a local http address of the dev server, reduced to its origin', () => {
    expect(devOrigin('http://localhost:5175', false)).toBe('http://localhost:5175');
    expect(devOrigin('http://127.0.0.1:5175/index.html?x=1', false)).toBe('http://127.0.0.1:5175');
  });

  it('is never used by an installed app, whatever the environment says', () => {
    expect(devOrigin('http://localhost:5175', true)).toBeNull();
  });

  it('refuses everything that is not a local http address', () => {
    for (const url of ['https://localhost:5175', 'http://example.com', 'http://localhost.evil.com', 'http://evil.com@localhost:5175', 'file:///etc/passwd', 'app://walkflow/', 'javascript:alert(1)', 'localhost:5175', '']) {
      expect(devOrigin(url, false), url).toBeNull();
    }
  });

  it('has nothing without an address', () => {
    expect(devOrigin(undefined, false)).toBeNull();
  });
});
