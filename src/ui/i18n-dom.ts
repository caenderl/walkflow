// Binds the static HTML and state-dependent texts to the active language. Never uses innerHTML.
//   data-i18n="path"              → textContent
//   data-i18n-rich="path"         → text with **bold** and `code`
//   data-i18n-aria="path"         → aria-label
//   data-i18n-placeholder="path"  → placeholder

import {
  detectLanguage, isLang, lang, LANG_STORAGE_KEY, LANGS, messagesFor, onLanguageChange, setLanguage, t,
  type Lang, type Messages, type Text,
} from '../i18n/i18n';
import { store } from './store';

/** Resolves "a.b.c" to a string in a message set, undefined if missing or not a string. */
export function lookup(m: Messages, path: string): string | undefined {
  let v: unknown = m;
  for (const k of path.split('.')) v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return typeof v === 'string' ? v : undefined;
}

export interface RichSegment {
  text: string;
  tag?: 'b' | 'code';
}

export function parseRich(s: string): RichSegment[] {
  const out: RichSegment[] = [];
  let last = 0;
  for (const m of s.matchAll(/\*\*(.+?)\*\*|`(.+?)`/g)) {
    const at = m.index;
    if (at > last) out.push({ text: s.slice(last, at) });
    out.push(m[1] !== undefined ? { text: m[1], tag: 'b' } : { text: m[2] ?? '', tag: 'code' });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

function setRich(el: Element, s: string) {
  el.replaceChildren(...parseRich(s).map(seg => {
    if (!seg.tag) return document.createTextNode(seg.text);
    const e = document.createElement(seg.tag);
    e.textContent = seg.text;
    return e;
  }));
}

const bound = new Map<HTMLElement, Text>();

/** Sets a state-dependent text and re-renders it after a language change. */
export function bindText(el: HTMLElement, text: Text) {
  bound.set(el, text);
  el.textContent = text();
}

/** Empties an element that was set with bindText */
export function clearText(el: HTMLElement) {
  bound.delete(el);
  el.textContent = '';
}

function apply(attr: string, set: (el: HTMLElement, v: string) => void) {
  for (const el of document.querySelectorAll<HTMLElement>(`[${attr}]`)) {
    const path = el.getAttribute(attr) ?? '';
    const v = lookup(t, path);
    // oxlint-disable-next-line no-console -- a missing text is a bug in the locale files; the console is where a developer sees it
    if (v === undefined) console.warn(`i18n: no text for "${path}"`);
    else set(el, v);
  }
}

function applyTranslations() {
  document.documentElement.lang = lang;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
  apply('data-i18n', (el, v) => { el.textContent = v; });
  apply('data-i18n-rich', setRich);
  apply('data-i18n-aria', (el, v) => el.setAttribute('aria-label', v));
  apply('data-i18n-placeholder', (el, v) => el.setAttribute('placeholder', v));
  for (const [el, text] of bound) el.textContent = text();
}

/** Picks the language (?lang=, stored choice, browser languages) and keeps the page in sync from then on. */
export function initLanguage() {
  let param: string | null = null;
  try { param = new URLSearchParams(location.search).get('lang'); } catch { /* no location */ }
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- navigator.languages is missing in older WebViews
  const l = detectLanguage({ param, stored: store.get(LANG_STORAGE_KEY), preferred: navigator.languages ?? [navigator.language] });
  // A link with ?lang= is an explicit choice
  if (isLang(param?.trim().toLowerCase())) store.set(LANG_STORAGE_KEY, l);
  setLanguage(l);
  applyTranslations();
  onLanguageChange(applyTranslations);
  document.documentElement.classList.add('i18n-ready');
}

export function chooseLanguage(l: Lang) {
  store.set(LANG_STORAGE_KEY, l);
  setLanguage(l);
}

/** Language picker; follows changes made elsewhere (header vs. first-run dialog). */
export function languageSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'lang';
  for (const l of LANGS) {
    const o = document.createElement('option');
    o.value = l;
    o.lang = l;
    o.textContent = messagesFor(l).name;
    sel.append(o);
  }
  const sync = () => {
    sel.value = lang;
    sel.setAttribute('aria-label', t.languageLabel);
    sel.title = t.languageLabel;
  };
  sync();
  onLanguageChange(sync);
  sel.onchange = () => { if (isLang(sel.value)) chooseLanguage(sel.value); };
  return sel;
}
