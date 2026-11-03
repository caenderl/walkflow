import { describe, expect, it } from 'vitest';
import { matchesHash, sha256Hex } from './hash';

describe('sha256Hex', () => {
  it('gives the known hashes of the empty text and of "abc"', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes the bytes of the text as UTF-8, so every device gets the same hash', async () => {
    expect(await sha256Hex('Außenalster 東京')).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex('ä')).not.toBe(await sha256Hex('a'));
  });
});

describe('matchesHash', () => {
  it('is true only for the text the hash was made from', async () => {
    const hash = await sha256Hex('{"format":"walkflow-route"}');
    expect(await matchesHash('{"format":"walkflow-route"}', hash)).toBe(true);
    expect(await matchesHash('{"format":"walkflow-route"} ', hash)).toBe(false);
    expect(await matchesHash('', hash)).toBe(false);
  });

  it('does not care about the case of the hash', async () => {
    const hash = await sha256Hex('abc');
    expect(await matchesHash('abc', hash.toUpperCase())).toBe(true);
  });
});
