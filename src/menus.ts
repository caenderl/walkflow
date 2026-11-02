// Menus that open from a header button (the connection menu), and the language and theme choice of the settings dialog. No library: a button with
// aria-expanded and a panel below it. Closes on a click outside, Esc, Tab out of it, or when another menu
// opens. A click outside is never swallowed, so a Stop button elsewhere works on the first click.
// Esc keeps its global meaning as well: while connected it also stops the belt (main.ts).
// A menu never covers the controls: the layout keeps them apart, and if a long text or another window width
// still makes them overlap, the menu moves to the left (keepClear).

import { lang, LANGS, messagesFor, onLanguageChange, t } from './i18n';
import { chooseLanguage } from './i18n-dom';
import { chooseTheme, currentTheme, onThemeChange, type ThemeChoice } from './theme';

export interface Menu {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

const menus = new Set<Menu>();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') for (const m of menus) m.close();
});

/**
 * Moves an open panel left until it is no longer above any of the given elements, so it cannot cover them
 * at any scroll position either (if there is room; the fixed dock on narrow screens sits above the menus anyway).
 */
function keepPanelClear(panel: HTMLElement, avoid: readonly (Element | null)[]) {
  panel.style.transform = '';
  const m = panel.getBoundingClientRect();
  let shift = 0;
  for (const el of avoid) {
    const r = el?.getBoundingClientRect();
    if (!r?.width || r.left >= m.right || r.right <= m.left) continue;
    shift = Math.max(shift, m.right - r.left + 8);
  }
  if (shift > 0 && m.left - shift >= 8) panel.style.transform = `translateX(${-shift}px)`;
}

export function setupMenu(trigger: HTMLButtonElement, panel: HTMLElement, keepClear: () => readonly (Element | null)[] = () => []): Menu {
  const place = () => keepPanelClear(panel, keepClear());
  const menu: Menu = {
    get isOpen() { return !panel.hidden; },
    open() {
      for (const m of menus) if (m !== menu) m.close();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      place();
    },
    close() {
      if (panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    },
  };
  menus.add(menu);
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);
  trigger.addEventListener('click', () => (menu.isOpen ? menu.close() : menu.open()));
  document.addEventListener('pointerdown', e => {
    const target = e.target as Node;
    if (menu.isOpen && !panel.contains(target) && !trigger.contains(target)) menu.close();
  });
  panel.addEventListener('focusout', e => {
    const to = e.relatedTarget as Node | null;
    if (to && !panel.contains(to) && !trigger.contains(to)) menu.close();
  });
  // The anchor moves when the window or the header texts change
  window.addEventListener('resize', () => { if (menu.isOpen) place(); });
  onLanguageChange(() => { if (menu.isOpen) place(); });
  return menu;
}

const THEME_ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

function option(label: string, checked: boolean, onPick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(checked));
  b.textContent = label;
  b.onclick = onPick;
  return b;
}

/** Language list and theme switch (in the settings dialog); both follow changes made elsewhere (e.g. the first-run dialog). */
export function setupPrefs(langBox: HTMLElement, themeBox: HTMLElement) {
  const render = () => {
    langBox.replaceChildren(...LANGS.map(l => {
      const b = option(messagesFor(l).name, l === lang, () => {
        chooseLanguage(l);
        langBox.querySelector<HTMLElement>(`[lang="${l}"]`)?.focus();
      });
      b.lang = l;
      return b;
    }));
    const theme = currentTheme();
    themeBox.replaceChildren(...THEME_ORDER.map(c => {
      const b = option(t.theme[c], c === theme, () => {
        chooseTheme(c);
        themeBox.querySelector<HTMLElement>(`[data-theme-choice="${c}"]`)?.focus();
      });
      b.dataset.themeChoice = c;
      return b;
    }));
  };
  render();
  onLanguageChange(render);
  onThemeChange(render);
}
