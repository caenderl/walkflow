import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, newShareCode, readShareCode, roomFromCode } from './code';

const fixed = (values: number[]) => (bytes: Uint8Array<ArrayBuffer>) => { for (let i = 0; i < bytes.length; i++) bytes[i] = values[i % values.length]!; };

describe('newShareCode', () => {
  it('has two groups of five characters from the alphabet', () => {
    const code = newShareCode(b => crypto.getRandomValues(b));
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect([...code.replace('-', '')].every(c => CODE_ALPHABET.includes(c))).toBe(true);
  });

  it('never contains a character that can be mistaken for another', () => {
    for (let i = 0; i < 200; i++) expect(newShareCode(b => crypto.getRandomValues(b))).not.toMatch(/[ILO01]/);
  });

  it('throws away bytes that would favour some characters', () => {
    // 255 is above the largest multiple of 31 in a byte (248), so it is skipped; 0 gives the first character
    const code = newShareCode(fixed([255, 255, 0]));
    expect(code).toBe('AAAAA-AAAAA');
  });

  it('gives different codes for different random bytes', () => {
    expect(newShareCode(fixed([1]))).not.toBe(newShareCode(fixed([2])));
  });
});

describe('readShareCode', () => {
  it('accepts a code typed in any case, with spaces or without the dash', () => {
    expect(readShareCode('abcde-fghjk')).toBe('ABCDE-FGHJK');
    expect(readShareCode(' ABCDE FGHJK ')).toBe('ABCDE-FGHJK');
    expect(readShareCode('abcdefghjk')).toBe('ABCDE-FGHJK');
  });

  it('refuses a wrong length and characters that are not in the alphabet', () => {
    for (const bad of ['', 'ABCDE', 'ABCDE-FGHJ', 'ABCDE-FGHJKM', 'ABCDE-FGHJ0', 'ABCDE-FGHJI', 'ABCDE-FGHJ!']) {
      expect(readShareCode(bad), bad).toBeNull();
    }
  });
});

describe('roomFromCode', () => {
  it('is the same for every way of typing the same code', async () => {
    expect(await roomFromCode('abcde fghjk')).toEqual(await roomFromCode('ABCDE-FGHJK'));
  });

  it('differs for different codes', async () => {
    const a = await roomFromCode('ABCDE-FGHJK');
    const b = await roomFromCode('ABCDE-FGHJM');
    expect(a.room).not.toBe(b.room);
    expect(a.password).not.toBe(b.password);
  });

  it('keeps the room, which a relay sees, apart from the password', async () => {
    const { room, password } = await roomFromCode('ABCDE-FGHJK');
    expect(room).toMatch(/^[0-9a-f]{32}$/);
    expect(password).toMatch(/^[0-9a-f]{64}$/);
    expect(password.startsWith(room)).toBe(false);
  });

  it('refuses something that is not a code', async () => {
    await expect(roomFromCode('hello')).rejects.toThrow();
  });
});
