// The share code: a one-time secret that two devices use to find each other and to protect the connection set-up.
// The person shows or reads it out; it is never stored. Room and key are derived from it with different prefixes, so what
// the relay sees (the room) says nothing about the key.

import { sha256Hex } from './hash';

/** No I, L, O, 0 or 1: nothing that can be mistaken for something else when it is read out or typed */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_GROUPS = 2;
export const CODE_GROUP_LENGTH = 5;
const CODE_LENGTH = CODE_GROUPS * CODE_GROUP_LENGTH;

/** `random` fills the array with random bytes (crypto.getRandomValues); it is passed in so the code can be tested */
export function newShareCode(random: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const out: string[] = [];
  // Bytes that would make some letters more likely than others are thrown away
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (out.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH * 2);
    random(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < CODE_LENGTH) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]!);
    }
  }
  return groupCode(out.join(''));
}

function groupCode(chars: string): string {
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += CODE_GROUP_LENGTH) groups.push(chars.slice(i, i + CODE_GROUP_LENGTH));
  return groups.join('-');
}

/** What was typed, as the code it stands for; null if it is not a code. Case, spaces and dashes do not matter. */
export function readShareCode(input: string): string | null {
  const chars = input.toUpperCase().replace(/[\s-]+/g, '');
  if (chars.length !== CODE_LENGTH || ![...chars].every(c => CODE_ALPHABET.includes(c))) return null;
  return groupCode(chars);
}

/**
 * How slow it is to try one code. The room is visible to a relay, so someone who sees it could guess codes offline; about 49 bits
 * are a lot for that, and this makes each guess cost about 0.1 s of a fast machine instead of a fraction of a microsecond.
 */
export const CODE_KDF_ITERATIONS = 600_000;

const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

/** The room the two devices meet in, and the password that protects the set-up of the connection */
export async function roomFromCode(code: string): Promise<{ room: string; password: string }> {
  const canonical = readShareCode(code);
  if (!canonical) throw new Error('not a share code');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(canonical), 'PBKDF2', false, ['deriveBits']);
  const key = toHex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('walkflow-share-v1'), iterations: CODE_KDF_ITERATIONS }, material, 256));
  // One slow step, then two outputs with different prefixes, so the room says nothing about the password
  return {
    room: (await sha256Hex(`walkflow-share-room:${key}`)).slice(0, 32),
    password: await sha256Hex(`walkflow-share-key:${key}`),
  };
}
