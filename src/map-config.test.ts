import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';
import { DEFAULT_MAP_STYLE, mapOrigin, resolveMapStyle } from './map-config';

describe('resolveMapStyle', () => {
  it('uses OpenFreeMap when nothing is set', () => {
    expect(resolveMapStyle(undefined)).toBe(DEFAULT_MAP_STYLE);
    expect(resolveMapStyle('')).toBe(DEFAULT_MAP_STYLE);
    expect(resolveMapStyle('   ')).toBe(DEFAULT_MAP_STYLE);
    expect(new URL(DEFAULT_MAP_STYLE).protocol).toBe('https:');
  });

  it('takes another https style', () => {
    expect(resolveMapStyle(' https://maps.example.org/styles/plain.json ')).toBe('https://maps.example.org/styles/plain.json');
  });

  it('turns the map off with "off"', () => {
    expect(resolveMapStyle('off')).toBeNull();
    expect(resolveMapStyle(' OFF ')).toBeNull();
  });

  it('refuses anything that is not a plain https URL, instead of falling back to another server', () => {
    for (const bad of ['http://maps.example.org/s.json', 'javascript:alert(1)', 'data:application/json,{}', 'file:///etc/passwd',
      'maps.example.org/s.json', 'https://user:pw@maps.example.org/s.json', 'https://', 'not a url', '//maps.example.org/s.json']) {
      expect(() => resolveMapStyle(bad), bad).toThrow();
    }
  });
});

describe('mapOrigin', () => {
  it('is the origin of the style, without path and query', () => {
    expect(mapOrigin('https://tiles.openfreemap.org/styles/liberty')).toBe('https://tiles.openfreemap.org');
    expect(mapOrigin('https://maps.example.org:8443/a/b.json?key=1#x')).toBe('https://maps.example.org:8443');
  });
});

describe('buildCsp', () => {
  const directives = (csp: string) => Object.fromEntries(csp.split('; ').map(d => { const [k, ...v] = d.split(' '); return [k!, v]; }));

  it('stays closed to the outside without a map', () => {
    const d = directives(buildCsp({ mapOrigin: null, header: false }));
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['connect-src']).toEqual(["'self'"]);
    expect(d['img-src']).toEqual(["'self'", 'data:']);
    expect(d['script-src']).toEqual(["'self'"]);
  });

  it('lets the map origin in for tiles only, never for scripts, styles, frames or forms', () => {
    const origin = 'https://tiles.openfreemap.org';
    const d = directives(buildCsp({ mapOrigin: origin, header: false }));
    expect(d['connect-src']).toEqual(["'self'", origin]);
    expect(d['img-src']).toEqual(["'self'", 'data:', origin]);
    for (const k of ['default-src', 'script-src', 'style-src', 'font-src', 'worker-src', 'manifest-src', 'object-src', 'form-action', 'base-uri'])
      expect(JSON.stringify(d[k]), k).not.toContain(origin);
  });

  it('never allows inline code or eval', () => {
    const csp = buildCsp({ mapOrigin: 'https://tiles.openfreemap.org', header: true });
    expect(csp).not.toMatch(/unsafe-/);
    expect(csp).not.toContain('*');
  });

  it('adds frame-ancestors only where it is a header (a meta tag ignores it)', () => {
    expect(buildCsp({ mapOrigin: null, header: true })).toContain("frame-ancestors 'none'");
    expect(buildCsp({ mapOrigin: null, header: false })).not.toContain('frame-ancestors');
  });
});
