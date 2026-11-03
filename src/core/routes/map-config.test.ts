import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../platform/csp';
import { DEFAULT_MAP_STYLE_DARK, DEFAULT_MAP_STYLE_LIGHT, isDefaultMapStyle, mapOrigin, mapOrigins, resolveMapStyles } from './map-config';

describe('resolveMapStyles', () => {
  it('uses OpenFreeMap, a light and a dark style, when nothing is set', () => {
    const both = { light: DEFAULT_MAP_STYLE_LIGHT, dark: DEFAULT_MAP_STYLE_DARK };
    expect(resolveMapStyles(undefined, undefined)).toEqual(both);
    expect(resolveMapStyles('', '  ')).toEqual(both);
    for (const url of Object.values(both)) expect(new URL(url).protocol).toBe('https:');
    expect(DEFAULT_MAP_STYLE_LIGHT).not.toBe(DEFAULT_MAP_STYLE_DARK);
  });

  it('takes another https style for both themes when only one is given', () => {
    const own = 'https://maps.example.org/styles/plain.json';
    expect(resolveMapStyles(` ${own} `, undefined)).toEqual({ light: own, dark: own });
  });

  it('takes a dark style of its own on top of the default light one', () => {
    const dark = 'https://maps.example.org/styles/night.json';
    expect(resolveMapStyles(undefined, dark)).toEqual({ light: DEFAULT_MAP_STYLE_LIGHT, dark });
  });

  it('turns the map off with "off", whichever of the two says so', () => {
    expect(resolveMapStyles('off', undefined)).toBeNull();
    expect(resolveMapStyles(' OFF ', undefined)).toBeNull();
    expect(resolveMapStyles(undefined, 'off')).toBeNull();
  });

  it('refuses anything that is not a plain https URL, instead of falling back to another server', () => {
    for (const bad of ['http://maps.example.org/s.json', 'javascript:alert(1)', 'data:application/json,{}', 'file:///etc/passwd',
      'maps.example.org/s.json', 'https://user:pw@maps.example.org/s.json', 'https://', 'not a url', '//maps.example.org/s.json']) {
      expect(() => resolveMapStyles(bad, undefined), bad).toThrow();
      expect(() => resolveMapStyles(undefined, bad), bad).toThrow();
    }
  });
});

describe('mapOrigin and mapOrigins', () => {
  it('is the origin of the style, without path and query', () => {
    expect(mapOrigin('https://tiles.openfreemap.org/styles/liberty')).toBe('https://tiles.openfreemap.org');
    expect(mapOrigin('https://maps.example.org:8443/a/b.json?key=1#x')).toBe('https://maps.example.org:8443');
  });

  it('lists each server once', () => {
    expect(mapOrigins({ light: DEFAULT_MAP_STYLE_LIGHT, dark: DEFAULT_MAP_STYLE_DARK })).toEqual(['https://tiles.openfreemap.org']);
    expect(mapOrigins({ light: 'https://a.example/x', dark: 'https://b.example/y' })).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('buildCsp', () => {
  const directives = (csp: string) => Object.fromEntries(csp.split('; ').map(d => { const [k, ...v] = d.split(' '); return [k!, v]; }));

  it('stays closed to the outside without a map', () => {
    const d = directives(buildCsp({ mapOrigins: [], header: false }));
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['connect-src']).toEqual(["'self'"]);
    expect(d['img-src']).toEqual(["'self'", 'data:']);
    expect(d['script-src']).toEqual(["'self'"]);
  });

  it('lets the map servers in for tiles only, never for scripts, styles, frames or forms', () => {
    const origins = ['https://tiles.openfreemap.org', 'https://b.example'];
    const d = directives(buildCsp({ mapOrigins: origins, header: false }));
    expect(d['connect-src']).toEqual(["'self'", ...origins]);
    expect(d['img-src']).toEqual(["'self'", 'data:', ...origins]);
    for (const k of ['default-src', 'script-src', 'style-src', 'font-src', 'worker-src', 'manifest-src', 'object-src', 'form-action', 'base-uri'])
      for (const o of origins) expect(JSON.stringify(d[k]), k).not.toContain(o);
  });

  it('never allows inline code or eval', () => {
    const csp = buildCsp({ mapOrigins: ['https://tiles.openfreemap.org'], header: true });
    expect(csp).not.toMatch(/unsafe-/);
    expect(csp).not.toContain('*');
  });

  it('adds frame-ancestors only where it is a header (a meta tag ignores it)', () => {
    expect(buildCsp({ mapOrigins: [], header: true })).toContain("frame-ancestors 'none'");
    expect(buildCsp({ mapOrigins: [], header: false })).not.toContain('frame-ancestors');
  });
});

describe('isDefaultMapStyle', () => {
  it('is true only for the built-in style of that theme', () => {
    expect(isDefaultMapStyle(DEFAULT_MAP_STYLE_LIGHT, false)).toBe(true);
    expect(isDefaultMapStyle(DEFAULT_MAP_STYLE_DARK, true)).toBe(true);
    expect(isDefaultMapStyle(DEFAULT_MAP_STYLE_DARK, false)).toBe(false);
    expect(isDefaultMapStyle('https://tiles.example.org/styles/positron', false)).toBe(false);
  });
});
