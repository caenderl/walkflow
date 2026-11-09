import { describe, expect, it } from 'vitest';
import { descriptionAfterEdit, routeDescription, routeName } from './route-text';
import { SAMPLE_NAMES, SAMPLE_TEXTS, sampleRoute } from './sample-route';
import type { Route } from './routes';

const base = sampleRoute('x', 0);
const plain: Route = { ...base, names: undefined, texts: undefined };

describe('routeName', () => {
  it('shows the name of a package in the language of the app, then English, then its plain name', () => {
    const r: Route = { ...plain, name: 'Plain', names: { en: 'English', fr: 'Français' } };
    expect(routeName(r, 'fr')).toBe('Français');
    expect(routeName(r, 'de')).toBe('English');
    expect(routeName({ ...r, names: { fr: 'Seul' } }, 'de')).toBe('Plain');
  });

  it('shows the name in each language the route has', () => {
    expect(routeName(base, 'de')).toBe(SAMPLE_NAMES.de);
    expect(routeName(base, 'fr')).toBe(SAMPLE_NAMES.fr);
  });

  it('shows the name as it is for any other route', () => {
    expect(routeName({ ...plain, name: 'Mein Weg' }, 'fr')).toBe('Mein Weg');
  });
});

describe('routeDescription', () => {
  it('shows the text of a package in the language of the app, and tells which language it is', () => {
    expect(routeDescription(base, 'de')).toEqual({ text: SAMPLE_TEXTS.de, lang: 'de' });
    expect(routeDescription(base, 'fr')).toEqual({ text: SAMPLE_TEXTS.fr, lang: 'fr' });
  });

  it('then English, then any language there is', () => {
    expect(routeDescription({ ...base, texts: { en: 'English', fr: 'Français' } }, 'de')).toEqual({ text: 'English', lang: 'en' });
    expect(routeDescription({ ...base, texts: { fr: 'Seul' } }, 'de')).toEqual({ text: 'Seul', lang: 'fr' });
  });

  it('shows a text the person wrote before the translations, as it is, without a language', () => {
    expect(routeDescription({ ...base, description: 'Mein Weg.' }, 'en')).toEqual({ text: 'Mein Weg.', lang: null });
    expect(routeDescription({ ...plain, description: 'Mein Weg.' }, 'fr')).toEqual({ text: 'Mein Weg.', lang: null });
  });

  it('has nothing for a route without text', () => {
    expect(routeDescription(plain, 'en')).toBeNull();
  });
});

describe('descriptionAfterEdit', () => {
  it('keeps the translations when the field was left as it was shown', () => {
    expect(descriptionAfterEdit(base, SAMPLE_TEXTS.de, 'de')).toEqual({ texts: base.texts });
    expect(descriptionAfterEdit(base, `  ${SAMPLE_TEXTS.de}\n`, 'de')).toEqual({ texts: base.texts });
  });

  it('makes the text the person\'s own once it was changed or cleared', () => {
    expect(descriptionAfterEdit(base, 'Mein Weg.', 'de')).toEqual({ description: 'Mein Weg.' });
    expect(descriptionAfterEdit(base, '', 'de')).toEqual({});
  });

  it('takes the text as it is for a route that has no translations', () => {
    const own = { ...plain, description: 'Alt' };
    expect(descriptionAfterEdit(own, 'Neu', 'en')).toEqual({ description: 'Neu' });
    expect(descriptionAfterEdit(own, SAMPLE_TEXTS.en, 'en')).toEqual({ description: SAMPLE_TEXTS.en });
  });
});
