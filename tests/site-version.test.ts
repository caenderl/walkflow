import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script without types, also run by node in the Pages build
import { fillVersion, releaseVersion } from '../scripts/site-version.mjs';

describe('releaseVersion (the version of the latest release, for the download links)', () => {
  it('takes a release tag or a plain version', () => {
    expect(releaseVersion('v0.2.0')).toBe('0.2.0');
    expect(releaseVersion('1.12.30')).toBe('1.12.30');
    expect(releaseVersion('v0.2.0\n')).toBe('0.2.0');
  });

  it('refuses everything else, so a odd value never ends up in a link', () => {
    for (const bad of ['', 'latest', 'v0.2', '0.2.0-rc.1', 'v0.2.0/../x', '0.2.0"', 'v0.2.0 x', 'vv0.2.0']) {
      expect(() => releaseVersion(bad), bad).toThrow();
    }
  });
});

describe('fillVersion', () => {
  it('replaces every {{version}}', () => {
    expect(fillVersion('a {{version}} b/{{version}}', '0.2.0')).toBe('a 0.2.0 b/0.2.0');
  });

  it('fails on any other placeholder left in the page, so a typo is not published', () => {
    expect(() => fillVersion('{{versoin}}', '0.2.0')).toThrow(/versoin/);
    expect(() => fillVersion('{{ version }}', '0.2.0')).toThrow();
  });
});
