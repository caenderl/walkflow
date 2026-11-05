// Active language and messages. No DOM access here, so the pure modules (ftms, safety, ble, program) and the
// Electron main process can use it too. The binding to the HTML lives in i18n-dom.ts.

import { de } from './locales/de';
import { en, type Messages } from './locales/en';
import { fr } from './locales/fr';
import { uk } from './locales/uk';

export type { Messages };
export type Lang = 'en' | 'de' | 'fr' | 'uk';
/** Text that is computed when shown, so it can be re-rendered after a language change. */
export type Text = () => string;

export const LANGS: readonly Lang[] = ['en', 'de', 'fr', 'uk'];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_STORAGE_KEY = 'walkflow.lang';

const MESSAGES: Record<Lang, Messages> = { en, de, fr, uk };

/** Live binding: importers always see the current language. */
export let lang: Lang = DEFAULT_LANG;
/** Messages of the current language. Live binding like `lang`. */
export let t: Messages = en;

const listeners = new Set<(l: Lang) => void>();

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

export function messagesFor(l: Lang): Messages {
  return MESSAGES[l];
}

export function setLanguage(l: Lang) {
  if (l === lang) return;
  lang = l;
  t = MESSAGES[l];
  for (const cb of [...listeners]) cb(l);
}

/** The texts depend on more than the language (the units): run everything that redraws texts again. */
export function retranslate() {
  for (const cb of [...listeners]) cb(lang);
}

/** Returns the unsubscribe function. */
export function onLanguageChange(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * An explicit choice wins (URL parameter, then the stored setting). Otherwise the first preferred language
 * we support, matched by its primary subtag ("fr-CH" → fr). Otherwise English.
 */
export function detectLanguage(o: { param?: string | null; stored?: string | null; preferred?: readonly string[] }): Lang {
  for (const v of [o.param, o.stored]) {
    const l = v?.trim().toLowerCase();
    if (isLang(l)) return l;
  }
  for (const p of o.preferred ?? []) {
    const l = p.trim().toLowerCase().split(/[-_]/)[0];
    if (isLang(l)) return l;
  }
  return DEFAULT_LANG;
}
