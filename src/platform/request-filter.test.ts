import { describe, expect, it } from 'vitest';
import { isAllowedRequest } from './request-filter';
import { RELAY_URLS } from './relays';

const base = { origin: 'walkflow://app', devOrigin: null, mapOrigins: [], relays: RELAY_URLS };
const allowed = (url: string, over: Partial<Parameters<typeof isAllowedRequest>[1]> = {}) => isAllowedRequest(url, { ...base, ...over });

describe('isAllowedRequest (the desktop app blocks every other request)', () => {
  it('allows the app itself and local data', () => {
    expect(allowed('walkflow://app/index.html')).toBe(true);
    expect(allowed('devtools://devtools/bundled/x.js')).toBe(true);
    expect(allowed('data:text/plain,x')).toBe(true);
    expect(allowed('blob:walkflow://app/1234')).toBe(true);
  });

  it('allows a connection to each relay the content security policy lists', () => {
    for (const relay of RELAY_URLS) {
      expect(allowed(relay)).toBe(true);
      expect(allowed(`${relay}/`)).toBe(true);
    }
  });

  it('does not allow a relay that is not listed, or one that only starts with the same name', () => {
    expect(allowed('wss://evil.example')).toBe(false);
    expect(allowed('wss://nos.lol.evil.example/')).toBe(false);
    expect(allowed('ws://nos.lol/')).toBe(false);
    expect(allowed('https://nos.lol/')).toBe(false);
  });

  it('allows the map servers only if the build has them', () => {
    expect(allowed('https://tiles.example/a.png')).toBe(false);
    expect(allowed('https://tiles.example/a.png', { mapOrigins: ['https://tiles.example'] })).toBe(true);
    expect(allowed('https://tiles.example.evil/a.png', { mapOrigins: ['https://tiles.example'] })).toBe(false);
  });

  it('allows the dev server and its socket only when there is one', () => {
    expect(allowed('http://localhost:5173/x')).toBe(false);
    const dev = { devOrigin: 'http://localhost:5173' };
    expect(allowed('http://localhost:5173/x', dev)).toBe(true);
    expect(allowed('ws://localhost:5173/', dev)).toBe(true);
    expect(allowed('http://localhost:5174/x', dev)).toBe(false);
  });
});
