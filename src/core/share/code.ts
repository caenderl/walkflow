// The share code: a one-time secret that two devices use to find each other and to protect the connection set-up.
// The person shows or reads it out; it is never stored. Room and key are derived from it with different prefixes, so what
// the relay sees (the room) says nothing about the key.

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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The room the two devices meet in, and the password that protects the set-up of the connection */
export async function roomFromCode(code: string): Promise<{ room: string; password: string }> {
  const canonical = readShareCode(code);
  if (!canonical) throw new Error('not a share code');
  return {
    room: (await sha256Hex(`walkflow-share-room:${canonical}`)).slice(0, 32),
    password: await sha256Hex(`walkflow-share-key:${canonical}`),
  };
}
