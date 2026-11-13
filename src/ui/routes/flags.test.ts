import { describe, expect, it } from 'vitest';
import data from '../../core/routes/data/countries.json';
import { flagUrl, hasFlag } from './flags';

const files = Object.keys(import.meta.glob('./flags/*.svg'));
const codes = Object.keys((data as { countries: Record<string, unknown> }).countries);

describe('flags', () => {
  it('has a flag file for every country in the data, and no file without a country', () => {
    expect(files.map(f => f.replace(/^.*\/(\w+)\.svg$/, '$1').toUpperCase()).sort()).toEqual([...codes].sort());
  });

  it('hasFlag says yes for a known code and no for anything else', () => {
    expect(hasFlag('DE')).toBe(true);
    expect(hasFlag('XK')).toBe(true);
    for (const bad of ['ZZ', 'de', '', '../x', 'DEU']) expect(hasFlag(bad), bad).toBe(false);
  });

  it('gives the address of the flag, or null', () => {
    expect(flagUrl('DE')).toMatch(/^data:image\/svg|\.svg/);
    expect(flagUrl('ZZ')).toBeNull();
    expect(flagUrl('../x')).toBeNull();
  });

  it('every flag is a plain SVG: no script, no event handlers, no outside references', () => {
    const raw = import.meta.glob<string>('./flags/*.svg', { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(raw).length).toBe(codes.length);
    for (const [file, svg] of Object.entries(raw)) {
      expect(svg, file).toMatch(/<svg[\s>]/);
      expect(svg, file).not.toMatch(/<script|\son\w+\s*=|javascript:|<foreignObject|href\s*=\s*["'](?!#|data:image)/i);
    }
  });
});
