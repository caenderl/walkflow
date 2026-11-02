import { describe, expect, it } from 'vitest';
import { applyTint, mapTint } from './map-tint';

const HEX = /^#[0-9a-f]{6}$/;

describe('mapTint', () => {
  it('has rules with plain hex colours for both themes', () => {
    for (const dark of [false, true]) {
      const rules = mapTint(dark);
      expect(rules.length).toBeGreaterThan(5);
      for (const r of rules) {
        expect(r.layers.length).toBeGreaterThan(0);
        expect(r.color).toMatch(HEX);
        expect(['background-color', 'fill-color', 'fill-outline-color', 'line-color', 'text-color']).toContain(r.prop);
      }
    }
  });

  it('gives water and parks their own colours, and different ones in the dark theme', () => {
    const colour = (dark: boolean, layer: string) => mapTint(dark).find(r => r.layers.includes(layer) && r.prop !== 'text-color')?.color;
    for (const layer of ['water', 'park', 'background']) {
      expect(colour(false, layer)).toMatch(HEX);
      expect(colour(true, layer)).toMatch(HEX);
      expect(colour(false, layer)).not.toBe(colour(true, layer));
    }
    expect(colour(false, 'water')).not.toBe(colour(false, 'park'));
    expect(colour(true, 'water')).not.toBe(colour(true, 'park'));
  });

  it('uses a layer in a theme at most once per property', () => {
    for (const dark of [false, true]) {
      const seen = new Set<string>();
      for (const r of mapTint(dark)) for (const l of r.layers) {
        const k = `${l}/${r.prop}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('applyTint', () => {
  it('sets the colours of the layers the style has and skips the others', () => {
    const calls: string[][] = [];
    const style = { getLayer: (id: string) => (id === 'water' || id === 'park' ? {} : undefined), setPaintProperty: (id: string, p: string, c: string) => { calls.push([id, p, c]); }, addLayer: () => undefined };
    applyTint(style, mapTint(false));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(c => c[0] === 'water' || c[0] === 'park')).toBe(true);
  });

  it('never throws on a layer that refuses the property', () => {
    const style = { getLayer: () => ({}), setPaintProperty: () => { throw new Error('nope'); }, addLayer: () => { throw new Error('nope'); } };
    expect(() => applyTint(style, mapTint(true))).not.toThrow();
  });
});

describe('parks in a style without a park layer', () => {
  const fake = (ids: string[]) => {
    const added: Record<string, unknown>[] = [];
    return { added, map: { getLayer: (id: string) => (ids.includes(id) ? { source: 'openmaptiles' } : undefined), setPaintProperty: () => undefined, addLayer: (l: Record<string, unknown>, before?: string) => { added.push({ ...l, before }); } } };
  };

  it('adds one below the water, in the park colour of the theme', () => {
    const { added, map } = fake(['landuse_park', 'water']);
    applyTint(map, mapTint(true));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'fill', source: 'openmaptiles', 'source-layer': 'park', before: 'water' });
    expect((added[0]!.paint as { 'fill-color': string })['fill-color']).toMatch(HEX);
  });

  it('adds nothing when the style has a park layer', () => {
    const { added, map } = fake(['park', 'landuse_park', 'water']);
    applyTint(map, mapTint(false));
    expect(added).toHaveLength(0);
  });
});
