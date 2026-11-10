import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script without types, also run by node in the Pages build
import { fillPage, releaseVersion, siteUrl } from '../scripts/site-version.mjs';

describe('releaseVersion (the version of the latest release, for the download links)', () => {
  it('takes a release tag or a plain version', () => {
    expect(releaseVersion('v0.2.0')).toBe('0.2.0');
    expect(releaseVersion('1.12.30')).toBe('1.12.30');
    expect(releaseVersion('v0.2.0\n')).toBe('0.2.0');
  });

  it('refuses everything else, so an odd value never ends up in a link', () => {
    for (const bad of ['', 'latest', 'v0.2', '0.2.0-rc.1', 'v0.2.0/../x', '0.2.0"', 'v0.2.0 x', 'vv0.2.0']) {
      expect(() => releaseVersion(bad), bad).toThrow();
    }
  });
});

describe('siteUrl (the address of the site, for canonical links and the sitemap)', () => {
  it('is a secure address without a trailing slash', () => {
    expect(siteUrl('https://walkflow-app.github.io/walkflow')).toBe('https://walkflow-app.github.io/walkflow');
    expect(siteUrl('https://walkflow-app.github.io/walkflow/')).toBe('https://walkflow-app.github.io/walkflow');
    expect(siteUrl('https://example.org')).toBe('https://example.org');
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'http://example.org', 'example.org', 'https://example.org/a?x=1', 'https://example.org/#x', 'https://u:p@example.org', 'https://exa mple.org', 'https://example.org/"x']) {
      expect(() => siteUrl(bad), bad).toThrow();
    }
  });
});

describe('fillPage', () => {
  it('replaces every {{version}} and {{site}}', () => {
    expect(fillPage('a {{version}} b/{{version}} {{site}}/de/', { version: '0.2.0', site: 'https://x.example/w' })).toBe('a 0.2.0 b/0.2.0 https://x.example/w/de/');
  });

  it('fails on any other placeholder left in the page, so a typo is not published', () => {
    const v = { version: '0.2.0', site: 'https://x.example' };
    expect(() => fillPage('{{versoin}}', v)).toThrow(/versoin/);
    expect(() => fillPage('{{ version }}', v)).toThrow();
  });
});
