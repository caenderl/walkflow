import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';
import { RELAY_URLS, sharingRelays } from './relays';

const directives = (csp: string) => Object.fromEntries(csp.split('; ').map(d => [d.split(' ')[0]!, d.split(' ').slice(1)]));

describe('buildCsp', () => {
  const csp = buildCsp({ mapOrigins: ['https://tiles.example'], relays: RELAY_URLS, header: false });
  const d = directives(csp);

  it('allows nothing from outside by default', () => {
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['form-action']).toEqual(["'none'"]);
  });

  it('lets the page connect to its own origin, the map servers and exactly the relays for sharing', () => {
    expect(d['connect-src']).toEqual(["'self'", 'https://tiles.example', ...RELAY_URLS]);
  });

  it('does not allow a connection to any other host: no wildcard, no plain ws', () => {
    for (const source of d['connect-src']!) expect(source, source).not.toMatch(/^(\*|wss?:|https?:|ws:\/\/)$|\*/);
    expect(d['connect-src']!.filter(s => s.startsWith('ws:'))).toEqual([]);
  });

  it('keeps the map servers out of the places they are not needed, and the relays out of the images', () => {
    expect(d['img-src']).toEqual(["'self'", 'data:', 'https://tiles.example']);
    expect(d['font-src']).toEqual(["'self'"]);
  });

  it('has no sharing relays when it is built without any', () => {
    expect(directives(buildCsp({ mapOrigins: [], relays: [], header: false }))['connect-src']).toEqual(["'self'"]);
  });

  it('adds frame-ancestors only as a header, where it works', () => {
    expect(directives(buildCsp({ mapOrigins: [], relays: [], header: true }))['frame-ancestors']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toBeUndefined();
  });
});

describe('RELAY_URLS', () => {
  it('has five relays, each a secure WebSocket origin without a path, and no duplicates', () => {
    expect(RELAY_URLS).toHaveLength(5);
    for (const url of RELAY_URLS) expect(url, url).toMatch(/^wss:\/\/[a-z0-9.-]+(:\d+)?$/);
    expect(new Set(RELAY_URLS).size).toBe(RELAY_URLS.length);
  });
});

describe('sharingRelays', () => {
  it('are the relays while Community is on, and none while it is off', () => {
    expect(sharingRelays(true)).toEqual(RELAY_URLS);
    expect(sharingRelays(false)).toEqual([]);
  });

  it('leave the content security policy without a relay when Community is off', () => {
    expect(directives(buildCsp({ mapOrigins: [], relays: sharingRelays(false), header: true }))['connect-src']).toEqual(["'self'"]);
  });
});

describe('the route store', () => {
  const store = 'https://raw.githubusercontent.com/walkflow-app/walkflow/main/store';

  it('lets the page connect to the store folder, with a trailing slash so nothing else on the host is allowed', () => {
    const d = directives(buildCsp({ mapOrigins: [], relays: [], store, header: false }));
    expect(d['connect-src']).toEqual(["'self'", `${store}/`]);
    expect(d['img-src']).toEqual(["'self'", 'data:']);
  });

  it('has no store address without a store', () => {
    expect(directives(buildCsp({ mapOrigins: [], relays: [], header: false }))['connect-src']).toEqual(["'self'"]);
    expect(directives(buildCsp({ mapOrigins: [], relays: [], store: null, header: false }))['connect-src']).toEqual(["'self'"]);
  });
});
