// The legal pages (public/legal/): finished, with a way to reach the project, and the same in every language. The Pages workflow
// also fails while a TODO is left; this keeps it in `npm test`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(fileURLToPath(new URL(`../public/legal/${f}`, import.meta.url)), 'utf8');
const NOTICES = ['de/impressum.html', 'en/legal-notice.html', 'fr/mentions-legales.html'];
const PRIVACY = ['de/datenschutz.html', 'en/privacy.html', 'fr/confidentialite.html'];

describe('the legal pages', () => {
  it.each([...NOTICES, ...PRIVACY])('%s: nothing is left to fill in', page => {
    const html = read(page);
    expect(html).not.toMatch(/TODO/);
    expect(html).not.toMatch(/class="todo"/);
  });

  it.each([...NOTICES, ...PRIVACY])('%s: names the project and a contact address', page => {
    const html = read(page);
    expect(html).toContain('Walkflow');
    expect(html).toContain('mailto:walkflow.app@gmail.com');
  });

  it.each(PRIVACY)('%s: says that GitHub hosts the pages and what the app asks GitHub for', page => {
    const html = read(page);
    expect(html).toContain('GitHub Pages');
    expect(html).toContain('raw.githubusercontent.com');
    expect(html).toContain('api.github.com');
    expect(html).toContain('walkflow-app/route-store');
  });

  it('every language has the same number of list items and sections', () => {
    const shape = (html: string) => ({ h2: (html.match(/<h2>/g) ?? []).length, li: (html.match(/<li>/g) ?? []).length });
    const [de, en, fr] = PRIVACY.map(p => shape(read(p)));
    expect(en).toEqual(de);
    expect(fr).toEqual(de);
  });
});
