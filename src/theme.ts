// Colour theme: follow the system, or fixed dark/light. The colours themselves are tokens in style.css;
// this module only sets data-theme on <html> and resolves tokens for places CSS cannot reach (canvas, meta).

import { store } from './ui';

export type ThemeChoice = 'system' | 'dark' | 'light';
export const THEMES: readonly ThemeChoice[] = ['system', 'dark', 'light'];
export const THEME_STORAGE_KEY = 'walkflow.theme';

export function parseTheme(v: string | null | undefined): ThemeChoice {
  return v === 'dark' || v === 'light' ? v : 'system';
}

export function effectiveTheme(choice: ThemeChoice, systemDark: boolean): 'dark' | 'light' {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

let choice: ThemeChoice = 'system';
const listeners = new Set<(c: ThemeChoice) => void>();
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function currentTheme(): ThemeChoice {
  return choice;
}

/** Also called when the system switches between light and dark. */
export function onThemeChange(cb: (c: ThemeChoice) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function apply(c: ThemeChoice) {
  choice = c;
  const root = document.documentElement;
  if (c === 'system') delete root.dataset.theme;
  else root.dataset.theme = c;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cssColor('--bg'));
  for (const cb of [...listeners]) cb(c);
}

export function initTheme() {
  apply(parseTheme(store.get(THEME_STORAGE_KEY)));
  systemDark()?.addEventListener('change', () => { if (choice === 'system') apply('system'); });
}

export function chooseTheme(c: ThemeChoice) {
  store.set(THEME_STORAGE_KEY, c);
  apply(c);
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
