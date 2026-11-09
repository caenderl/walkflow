// The texts of a route in the language of the app: its name and its description. A route that came with translations (from a
// route package, for example from the route store) shows them in the language of the app; a text the person wrote is shown as it is.

import type { Lang } from '../../i18n/i18n';
import type { Route } from './routes';

/** The name of a route in the language of the app: a package's names, else its plain name */
export function routeName(r: Route, lang: Lang): string {
  return (r.names && (r.names[lang] ?? r.names.en)) || r.name;
}

/** The language of the app, else English, else any language there is */
function pickText(texts: Readonly<Record<string, string>>, lang: Lang): { text: string; lang: string } | null {
  const key = [lang, 'en', ...Object.keys(texts).sort()].find(k => texts[k]);
  return key ? { text: texts[key]!, lang: key } : null;
}

/**
 * The text to show for a route. A text the person wrote is shown as it is (it has no language we know); the text of an
 * installed package follows the language of the app, and says which one it is, for the lang attribute of the element.
 */
export function routeDescription(r: Route, lang: Lang): { text: string; lang: string | null } | null {
  if (r.description) return { text: r.description, lang: null };
  return r.texts ? pickText(r.texts, lang) : null;
}

/**
 * What to store after the description was edited. A route with translations whose field was left as shown keeps them (its
 * text keeps following the language); any other text, or an empty one, is the person's own from then on.
 */
export function descriptionAfterEdit(r: Route, typed: string, lang: Lang): { description?: string; texts?: Record<string, string> } {
  const shown = !r.description ? routeDescription(r, lang) : null;
  if (shown && typed.trim() === shown.text.trim()) return { texts: r.texts! };
  return typed.trim() ? { description: typed } : {};
}
