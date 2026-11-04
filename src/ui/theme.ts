// Colour theme: follow the system, or fixed dark/light. On top of that a palette (Standard, Lagoon, Candy) that works in light
// and dark. The colours themselves are tokens in style.css; this module only sets data-theme and data-palette on <html> and
// resolves tokens for places CSS cannot reach (canvas, meta).

import { store } from './store';

export type ThemeChoice = 'system' | 'dark' | 'light';
export const THEMES: readonly ThemeChoice[] = ['system', 'dark', 'light'];
export const THEME_STORAGE_KEY = 'walkflow.theme';

export type Palette = 'standard' | 'lagoon' | 'candy';
export const PALETTES: readonly Palette[] = ['standard', 'lagoon', 'candy'];
export const PALETTE_STORAGE_KEY = 'walkflow.palette';

export function parsePalette(v: string | null | undefined): Palette {
  return v === 'lagoon' || v === 'candy' ? v : 'standard';
}

export function parseTheme(v: string | null | undefined): ThemeChoice {
  return v === 'dark' || v === 'light' ? v : 'system';
}

export function effectiveTheme(choice: ThemeChoice, systemDark: boolean): 'dark' | 'light' {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

let choice: ThemeChoice = 'system';
let palette: Palette = 'standard';
const listeners = new Set<(c: ThemeChoice) => void>();
const paletteListeners = new Set<(p: Palette) => void>();
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function currentTheme(): ThemeChoice {
  return choice;
}

export function currentPalette(): Palette {
  return palette;
}

/** Whether the page is dark right now: the chosen theme, or the system's */
export function isDark(): boolean {
  return effectiveTheme(choice, !!systemDark()?.matches) === 'dark';
}

/** Also called when the system switches between light and dark. */
export function onThemeChange(cb: (c: ThemeChoice) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Also called when the palette changes: the colours behind a theme are different then, too */
export function onPaletteChange(cb: (p: Palette) => void): () => void {
  paletteListeners.add(cb);
  return () => { paletteListeners.delete(cb); };
}

function apply(c: ThemeChoice) {
  choice = c;
  const root = document.documentElement;
  if (c === 'system') delete root.dataset.theme;
  else root.dataset.theme = c;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cssColor('--bg'));
  for (const cb of [...listeners]) cb(c);
}

function applyPalette(p: Palette) {
  palette = p;
  const root = document.documentElement;
  if (p === 'standard') delete root.dataset.palette;
  else root.dataset.palette = p;
  apply(choice);
  for (const cb of [...paletteListeners]) cb(p);
}

export function initTheme() {
  palette = parsePalette(store.get(PALETTE_STORAGE_KEY));
  if (palette !== 'standard') document.documentElement.dataset.palette = palette;
  apply(parseTheme(store.get(THEME_STORAGE_KEY)));
  systemDark()?.addEventListener('change', () => { if (choice === 'system') apply('system'); });
}

export function chooseTheme(c: ThemeChoice) {
  store.set(THEME_STORAGE_KEY, c);
  apply(c);
}

export function choosePalette(p: Palette) {
  store.set(PALETTE_STORAGE_KEY, p);
  applyPalette(p);
}

let probe: HTMLElement | null = null;

/** Resolves a colour token for the current theme, e.g. cssColor('--line') → "rgb(42, 47, 60)". */
export function cssColor(token: string): string {
  if (!probe) {
    probe = document.createElement('span');
    probe.className = 'color-probe';
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
  }
  probe.style.color = `var(${token})`;
  return getComputedStyle(probe).color;
}
