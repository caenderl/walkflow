import { describe, expect, it } from 'vitest';
import css from '../style.css?raw';
import { effectiveTheme, parseTheme, THEMES } from './theme';

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

function tokens(): Map<string, { light: string; dark: string }> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)![1]!;
  const map = new Map<string, { light: string; dark: string }>();
  for (const m of root.matchAll(/--([\w-]+):\s*light-dark\((.*)\);/g)) {
    const [light, dark] = splitTopLevel(m[2]!);
    map.set(m[1]!, { light: light!, dark: dark! });
  }
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
  const tk = tokens();

  it('every token is defined for light and dark, and every var() used is defined', () => {
    expect(tk.size).toBeGreaterThan(15);
    for (const [name, v] of tk) {
      expect(v.light, name).toBeTruthy();
      expect(v.dark, name).toBeTruthy();
    }
    const used = new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map(m => m[1]!));
    for (const name of used) expect(tk.has(name), `--${name}`).toBe(true);
  });

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

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: text pairs reach 4.5:1`, () => {
      for (const [f, b] of text) expect(contrast(tk.get(f)![theme], tk.get(b)![theme]), `${f} on ${b}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: controls reach 3:1 against their surface`, () => {
      for (const [f, b] of ui) expect(contrast(tk.get(f)![theme], tk.get(b)![theme]), `${f} on ${b}`).toBeGreaterThanOrEqual(3);
    });
  }

  it('the dark theme keeps the previous colours', () => {
    expect(tk.get('bg')!.dark).toBe('#12141a');
    expect(tk.get('card')!.dark).toBe('#1c1f28');
    expect(tk.get('primary')!.dark).toBe('#4ade80');
    expect(tk.get('stop')!.dark).toBe('#f87171');
  });
});
