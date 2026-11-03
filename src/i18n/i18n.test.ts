import { afterEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import { detectLanguage, LANGS, lang, messagesFor, onLanguageChange, setLanguage, t } from './i18n';
import { lookup, parseRich } from '../ui/i18n-dom';
import { numberFormat } from './locales/format';

const legalPages = Object.keys(import.meta.glob('../../public/legal/*/*.html'));

/** Shape of a message set: key → 'string' | 'function' | array length, recursively. */
function shape(v: unknown): unknown {
  if (typeof v === 'string') return 'string';
  if (typeof v === 'function') return `function/${v.length}`;
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

function strings(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

afterEach(() => setLanguage('en'));

describe('detectLanguage', () => {
  it('falls back to English', () => {
    expect(detectLanguage({})).toBe('en');
    expect(detectLanguage({ preferred: ['es-ES', 'it'] })).toBe('en');
  });

  it('takes the first supported browser language by primary subtag', () => {
    expect(detectLanguage({ preferred: ['fr-CH', 'de-DE'] })).toBe('fr');
    expect(detectLanguage({ preferred: ['es', 'de-AT', 'en'] })).toBe('de');
    expect(detectLanguage({ preferred: ['EN-us'] })).toBe('en');
  });

  it('prefers the URL parameter, then the stored choice', () => {
    expect(detectLanguage({ param: 'fr', stored: 'de', preferred: ['en'] })).toBe('fr');
    expect(detectLanguage({ param: null, stored: 'de', preferred: ['fr'] })).toBe('de');
    expect(detectLanguage({ param: 'xx', stored: 'garbage', preferred: ['fr'] })).toBe('fr');
  });
});

describe('setLanguage', () => {
  it('switches the live binding and notifies listeners once per change', () => {
    const cb = vi.fn();
    const off = onLanguageChange(cb);
    setLanguage('de');
    setLanguage('de');
    expect(lang).toBe('de');
    expect(t.connection.connect).toBe('Verbinden');
    setLanguage('fr');
    expect(t.connection.connect).toBe('Connecter');
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    setLanguage('en');
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('locale files', () => {
  const en = messagesFor('en');

  it.each(LANGS)('%s has exactly the shape of en (same keys, arity, list lengths)', l => {
    expect(shape(messagesFor(l))).toEqual(shape(en));
  });

  it.each(LANGS)('%s has no empty texts', l => {
    for (const [path, s] of strings(messagesFor(l))) expect(s.trim(), path).not.toBe('');
  });

  it.each(LANGS)('%s: every key used in index.html resolves to a text', l => {
    const keys = [...indexHtml.matchAll(/data-i18n(?:-rich|-aria|-placeholder)?="([^"]+)"/g)].map(m => m[1]!);
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(lookup(messagesFor(l), k), k).toBeTypeOf('string');
  });

  it.each(LANGS)('%s: rich texts have balanced markup', l => {
    const keys = [...indexHtml.matchAll(/data-i18n-rich="([^"]+)"/g)].map(m => m[1]!);
    for (const k of keys) {
      for (const seg of parseRich(lookup(messagesFor(l), k)!)) expect(seg.text, k).not.toMatch(/\*\*|`/);
    }
  });

  it.each(LANGS)('%s: legal pages exist', l => {
    const m = messagesFor(l);
    expect(legalPages).toContain(`../../public/${m.info.imprintHref}`);
    expect(legalPages).toContain(`../../public/${m.info.privacyHref}`);
  });

  it('keeps the safety statements in every language', () => {
    for (const l of LANGS) {
      const m = messagesFor(l);
      expect(m.disclaimer.points).toHaveLength(6);
      expect(m.notice.length).toBeGreaterThan(60);
    }
  });
});

describe('number formatting', () => {
  it('uses the decimal separator of the language, no grouping', () => {
    expect(numberFormat('en')(2.5, 1)).toBe('2.5');
    expect(numberFormat('de')(2.5, 1)).toBe('2,5');
    expect(numberFormat('fr')(2.5, 1)).toBe('2,5');
    expect(numberFormat('de')(1500)).toBe('1500');
    expect(numberFormat('en')(0.1 + 0.2)).toBe('0.3');
  });

  it('formats speeds in the messages', () => {
    expect(messagesFor('de').control.ramping(2, 2.5)).toBe('Tempo wird in Stufen angepasst: 2,0 → 2,5 km/h');
    expect(messagesFor('en').control.ramping(2, 2.5)).toBe('Changing speed in steps: 2.0 → 2.5 km/h');
  });
});

describe('parseRich', () => {
  it('splits bold and code segments', () => {
    expect(parseRich('a **b** c `d`')).toEqual([
      { text: 'a ' }, { text: 'b', tag: 'b' }, { text: ' c ' }, { text: 'd', tag: 'code' },
    ]);
    expect(parseRich('plain')).toEqual([{ text: 'plain' }]);
  });

  it('leaves unbalanced markers as text', () => {
    expect(parseRich('a ** b')).toEqual([{ text: 'a ** b' }]);
  });
});
