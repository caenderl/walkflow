import { describe, expect, it } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('is made of the time and a few random characters', () => {
    expect(newId(1_700_000_000_000, () => 0)).toBe(`${(1_700_000_000_000).toString(36)}-0`);
  });

  it('differs for different random numbers at the same time', () => {
    expect(newId(5, () => 0.1)).not.toBe(newId(5, () => 0.2));
  });

  it('differs for different times', () => {
    expect(newId(5, () => 0.1)).not.toBe(newId(6, () => 0.1));
  });
});
