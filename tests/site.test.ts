// The product page (site/, built into the root of GitHub Pages by scripts/build-pages.mjs): every local link, image and script
// exists, every image has a text for people who cannot see it, and the English and German pages have the same shape.
// Addresses that point into app/ are the web app, which is built beside the page and is not in site/.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const PAGES = ['index.html', 'de/index.html'];
const read = (f: string) => readFileSync(`${SITE}${f}`, 'utf8');

/** Local addresses in a page: href, src and the files of a srcset, without anchors, queries and other sites */
function localAddresses(html: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/\b(?:href|src|srcset)="([^"]*)"/g)) {
    for (const part of m[1]!.split(',')) {
      const url = part.trim().split(/\s+/)[0] ?? '';
      if (!url || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
      found.push(url.split('#')[0]!.split('?')[0]!);
    }
  }
  return found;
}

describe('the product page', () => {
  it.each(PAGES)('%s: every local file it names exists', page => {
    const dir = dirname(`${SITE}${page}`);
    for (const url of localAddresses(read(page))) {
      const target = resolve(dir, url || '.');
      // The web app is built beside the page
      if (target.startsWith(`${SITE}app`) || target === SITE.replace(/\/$/, '')) continue;
      const file = target.endsWith('/') ? `${target}index.html` : target;
      expect(existsSync(file) || existsSync(`${file}/index.html`), `${page}: ${url}`).toBe(true);
    }
  });

  it.each(PAGES)('%s: every image has a size and a text', page => {
    const imgs = [...read(page).matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img, img).toMatch(/\bwidth="\d+"/);
      expect(img, img).toMatch(/\bheight="\d+"/);
      // Decorative images say so with an empty text
      expect(img, img).toMatch(/\balt="[^"]*"/);
    }
  });

  it('every screenshot exists for both colour schemes and both languages', () => {
    const files = new Set(readdirSync(`${SITE}img`));
    for (const scheme of ['dark', 'light']) {
      for (const lang of ['en', 'de']) {
        for (const scene of ['training', 'routes', 'workouts', 'history']) expect(files.has(`${scheme}-${lang}-${scene}.webp`), `${scheme}-${lang}-${scene}`).toBe(true);
      }
    }
  });

  it('English and German have the same sections, links and images', () => {
    const shape = (html: string) => ({
      ids: [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]),
      sections: (html.match(/<section\b/g) ?? []).length,
      images: [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]!.replace(/^(\.\.\/)?(img\/(dark|light)-(en|de)-)?/, '')),
      external: [...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map(m => m[1]),
    });
    const en = shape(read('index.html')), de = shape(read('de/index.html'));
    expect(de.ids).toEqual(en.ids);
    expect(de.sections).toBe(en.sections);
    expect(de.images).toEqual(en.images);
    expect(de.external).toEqual(en.external);
  });

  it('does not load anything from other sites (no tracking, no external fonts or scripts)', () => {
    for (const page of PAGES) {
      const html = read(page);
      expect(html).not.toMatch(/<script[^>]+src="https?:/);
      expect(html).not.toMatch(/<link[^>]+href="https?:\/\/[^"]*"[^>]*rel="stylesheet"/);
    }
    expect(read('site.css')).not.toMatch(/@import|url\(\s*["']?https?:/);
  });

  it('links to the legal pages of the web app in the language of the page', () => {
    expect(read('index.html')).toContain('app/legal/en/legal-notice.html');
    expect(read('index.html')).toContain('app/legal/en/privacy.html');
    expect(read('de/index.html')).toContain('app/legal/de/impressum.html');
    expect(read('de/index.html')).toContain('app/legal/de/datenschutz.html');
  });
});
