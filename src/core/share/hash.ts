// SHA-256 of a text, as lower-case hex. It is the identity of a package in the community and in a catalogue: the same
// file has the same hash on every device, and what arrives is compared with what was offered before it is read.

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** True if the text is exactly what the hash was made from */
export async function matchesHash(text: string, sha256: string): Promise<boolean> {
  return (await sha256Hex(text)) === sha256.toLowerCase();
}
