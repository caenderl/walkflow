// The product page (site/, built into the root of GitHub Pages by scripts/build-pages.mjs): every local link, image and script
// exists, every image has a text for people who cannot see it, and the English and German pages have the same shape.
// Addresses that point into app/ are the web app, which is built beside the page and is not in site/.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script without types, also run by node in the Pages build
import { fillPage } from '../scripts/site-version.mjs';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const PAGES = ['index.html', 'de/index.html'];
const read = (f: string) => readFileSync(`${SITE}${f}`, 'utf8');
const VALUES = { version: '9.8.7', site: 'https://example.org/w' };
const filled = (f: string): string => fillPage(read(f), VALUES);

/** Local addresses in a page: href, src and the files of a srcset, without anchors, queries and other sites */
function localAddresses(html: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/\b(?:href|src|srcset)="([^"]*)"/g)) {
    for (const part of m[1]!.split(',')) {
      const url = part.trim().split(/\s+/)[0] ?? '';
      if (!url || url.startsWith('#') || url.startsWith('{{') || /^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
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

  it.each(PAGES)('%s: the download links point straight at the files of the release, named like the installers', page => {
    const html: string = fillPage(read(page), VALUES);
    const base = 'https://github.com/walkflow-app/walkflow/releases/download/v9.8.7/';
    for (const file of ['Walkflow-9.8.7-win-x64.exe', 'Walkflow-9.8.7-linux-x86_64.AppImage', 'SHA256SUMS.txt']) {
      expect(html, file).toContain(`href="${base}${file}"`);
    }
    // No macOS app for now (it is not notarized): the Mac card leads to the web app
    expect(html).not.toMatch(/\.dmg"/);
    expect(html).toMatch(/<a class="dl" data-os="mac"[^>]* href="(\.\.\/)?app\//);
    expect(html).toContain('href="https://github.com/walkflow-app/walkflow/releases/tag/v9.8.7"');
    expect(html).toContain('9.8.7');
  });

  it.each([['index.html', 'https://example.org/w/'], ['de/index.html', 'https://example.org/w/de/']])('%s: search engines and link previews get absolute addresses', (page, own) => {
    const html = filled(page);
    expect(html).toContain(`<link rel="canonical" href="${own}">`);
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://example.org/w/">');
    expect(html).toContain('<link rel="alternate" hreflang="de" href="https://example.org/w/de/">');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://example.org/w/">');
    expect(html).toContain(`<meta property="og:url" content="${own}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    const image = /<meta property="og:image" content="https:\/\/example\.org\/w\/([^"]+)">/.exec(html)?.[1];
    expect(image, 'og:image').toBeTruthy();
    expect(existsSync(`${SITE}${image}`), image).toBe(true);
  });

  it.each(PAGES)('%s: the structured data is valid JSON and describes the software', page => {
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(filled(page));
    expect(m, 'ld+json').toBeTruthy();
    const data = JSON.parse(m![1]!);
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.name).toBe('Walkflow');
    expect(data.softwareVersion).toBe('9.8.7');
    expect(data.offers.price).toBe('0');
    expect(data.url).toMatch(/^https:\/\/example\.org\/w\//);
  });

  it('the sitemap lists both pages', () => {
    const xml = filled('sitemap.xml');
    expect(xml).toContain('<loc>https://example.org/w/</loc>');
    expect(xml).toContain('<loc>https://example.org/w/de/</loc>');
  });

  it('links to the legal pages of the web app in the language of the page', () => {
    expect(read('index.html')).toContain('app/legal/en/legal-notice.html');
    expect(read('index.html')).toContain('app/legal/en/privacy.html');
    expect(read('de/index.html')).toContain('app/legal/de/impressum.html');
    expect(read('de/index.html')).toContain('app/legal/de/datenschutz.html');
  });
});
