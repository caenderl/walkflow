import { describe, expect, it } from 'vitest';
import css from '../style.css?raw';
import { effectiveTheme, PALETTE_STORAGE_KEY, PALETTES, parsePalette, parseTheme, THEMES } from './theme';

describe('theme choice', () => {
  it('follows the system unless dark or light was chosen', () => {
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('garbage')).toBe('system');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(THEMES).toEqual(['system', 'dark', 'light']);
  });

  it('resolves to dark or light', () => {
    expect(effectiveTheme('system', true)).toBe('dark');
    expect(effectiveTheme('system', false)).toBe('light');
    expect(effectiveTheme('dark', false)).toBe('dark');
    expect(effectiveTheme('light', true)).toBe('light');
  });
});

describe('palette choice', () => {
  it('is the standard colours unless a known palette was chosen', () => {
    expect(PALETTES).toEqual(['standard', 'lagoon', 'candy']);
    expect(parsePalette(null)).toBe('standard');
    expect(parsePalette('garbage')).toBe('standard');
    expect(parsePalette('lagoon')).toBe('lagoon');
    expect(parsePalette('candy')).toBe('candy');
    expect(PALETTE_STORAGE_KEY).toBe('walkflow.palette');
  });
});

// ---------- Colour tokens in style.css ----------

/** Splits at commas that are not inside parentheses. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  out.push(s.slice(start).trim());
  return out;
}

type Tokens = Map<string, { light: string; dark: string }>;

function tokensOf(block: string): Tokens {
  const map: Tokens = new Map();
  for (const m of block.matchAll(/--([\w-]+):\s*light-dark\((.*)\);/g)) {
    const [light, dark] = splitTopLevel(m[2]!);
    map.set(m[1]!, { light: light!, dark: dark! });
  }
  return map;
}

const rootTokens = (): Tokens => tokensOf(/:root\s*\{([^}]*)\}/.exec(css)![1]!);

/** What a palette sets on <html>: its own block `:root[data-palette="x"] { … }` (descendant rules are not in it) */
function paletteBlock(name: string): string | undefined {
  return new RegExp(`:root\\[data-palette="${name}"\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1];
}

/** The tokens in effect with a palette chosen: the root ones, with the palette's own on top */
function resolved(name: string): Tokens {
  const map = rootTokens();
  const block = paletteBlock(name);
  if (block) for (const [k, v] of tokensOf(block)) map.set(k, v);
  return map;
}

function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe('colour tokens', () => {
  const tk = rootTokens();

  it('every token is defined for light and dark, and every var() used is defined', () => {
    expect(tk.size).toBeGreaterThan(15);
    for (const [name, v] of tk) {
      expect(v.light, name).toBeTruthy();
      expect(v.dark, name).toBeTruthy();
    }
    // tokens that only a palette defines (the section colours of Candy) count as defined, too
    const defined = new Set([...tk.keys(), ...PALETTES.flatMap(p => [...resolved(p).keys()])]);
    const used = new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map(m => m[1]!));
    for (const name of used) expect(defined.has(name), `--${name}`).toBe(true);
  });

  it('the dark theme keeps the previous colours', () => {
    expect(tk.get('bg')!.dark).toBe('#12141a');
    expect(tk.get('card')!.dark).toBe('#1c1f28');
    expect(tk.get('primary')!.dark).toBe('#4ade80');
    expect(tk.get('stop')!.dark).toBe('#f87171');
  });
});

describe('palettes', () => {
  // Text on background: WCAG AA (4.5:1)
  const text: [fg: string, bg: string][] = [
    ['fg', 'bg'], ['fg', 'card'], ['mute', 'bg'], ['mute', 'card'], ['fg', 'btn'], ['fg', 'input-bg'],
    ['link', 'card'], ['link', 'bg'], ['primary-fg', 'primary'], ['stop-fg', 'stop'], ['alarm-fg', 'alarm-bg'],
    ['fg', 'warn-bg'], ['fg', 'info-bg'], ['fg', 'demo-bg'], ['fg', 'notice-bg'], ['fg', 'ok-bg'],
  ];
  // Controls, chart line, keyboard focus ring and the alarm banner's outline against their surface: 3:1
  const ui: [fg: string, bg: string][] = [
    ['primary', 'card'], ['stop', 'card'], ['accent', 'card'], ['alarm-border', 'bg'], ['focus', 'bg'], ['focus', 'card'],
  ];
  const SECTIONS = ['train', 'route', 'work', 'comm', 'hist'];

  for (const palette of PALETTES) {
    const tk = resolved(palette);
    for (const theme of ['light', 'dark'] as const) {
      it(`${palette}, ${theme}: text pairs reach 4.5:1`, () => {
        for (const [f, b] of text) expect(contrast(tk.get(f)![theme], tk.get(b)![theme]), `${f} on ${b}`).toBeGreaterThanOrEqual(4.5);
      });

      it(`${palette}, ${theme}: controls reach 3:1 against their surface`, () => {
        for (const [f, b] of ui) expect(contrast(tk.get(f)![theme], tk.get(b)![theme]), `${f} on ${b}`).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('a palette never changes the reds of Stop and the alarm', () => {
    for (const palette of PALETTES) {
      const block = paletteBlock(palette) ?? '';
      for (const name of ['stop', 'stop-fg', 'alarm-bg', 'alarm-fg', 'alarm-border']) expect(block, `${palette}: --${name}`).not.toContain(`--${name}:`);
    }
  });

  it('the standard palette sets nothing of its own', () => {
    expect(paletteBlock('standard')).toBeUndefined();
  });

  it('Lagoon and Candy set their own page and card colours', () => {
    for (const palette of ['lagoon', 'candy']) {
      const own = tokensOf(paletteBlock(palette)!);
      for (const name of ['bg', 'card', 'fg', 'mute', 'line']) expect(own.has(name), `${palette}: --${name}`).toBe(true);
    }
  });

  describe('Candy gives every part of the app its own colour', () => {
    const own = tokensOf(paletteBlock('candy')!);

    it('has a colour and a tinted card for each of the five parts', () => {
      for (const n of SECTIONS) {
        expect(own.has(`sec-${n}`), `--sec-${n}`).toBe(true);
        expect(own.has(`tint-${n}`), `--tint-${n}`).toBe(true);
      }
    });

    it('applies them to the cards of the training, workouts, routes, community and history parts', () => {
      const rules = [...css.matchAll(/:root\[data-palette="candy"\]\s+([^{]+)\{([^}]*)\}/g)].map(m => ({ sel: m[1]!, body: m[2]! }));
      const part = (cls: string) => rules.find(r => r.sel.includes(cls));
      const expected: [cls: string, part: string][] = [
        ['.live', 'train'], ['.stage', 'train'], ['.control', 'train'], ['.incline', 'train'],
        ['.workouts-part', 'work'], ['.routes-part', 'route'], ['.community-part', 'comm'], ['.history-part', 'hist'],
      ];
      for (const [cls, n] of expected) {
        const rule = part(cls);
        expect(rule, cls).toBeDefined();
        expect(rule!.body, cls).toContain(`--card: var(--tint-${n})`);
        expect(rule!.body, cls).toContain(`--sec: var(--sec-${n})`);
      }
    });

    for (const theme of ['light', 'dark'] as const) {
      it(`${theme}: text on every tinted card reaches 4.5:1, the controls 3:1`, () => {
        const tk = resolved('candy');
        const v = (name: string) => tk.get(name)![theme];
        for (const n of SECTIONS) {
          const tint = v(`tint-${n}`);
          for (const f of ['fg', 'mute', 'link', `sec-${n}`]) expect(contrast(v(f), tint), `${f} on tint-${n}`).toBeGreaterThanOrEqual(4.5);
          for (const f of ['primary', 'focus', 'stop']) expect(contrast(v(f), tint), `${f} on tint-${n}`).toBeGreaterThanOrEqual(3);
        }
      });
    }
  });
});
