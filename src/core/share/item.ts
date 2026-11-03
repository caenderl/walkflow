// What a device shares, ready to be offered: the package text with its hash and length, and what is shown in the list.

import { sha256Hex } from './hash';
import type { ItemKind, ShareItem } from './protocol';

export interface ShareItemInput {
  /** Only means something on a connection; any short id of letters, digits, `_` and `-` */
  id: string;
  kind: ItemKind;
  name: string;
  /** The package in its file format, exactly as it would be saved */
  text: string;
  place?: string;
  /** ISO 3166-1 alpha-2 */
  country?: string;
  tags?: string[];
}

export async function makeShareItem(input: ShareItemInput): Promise<ShareItem> {
  const { text, place, country, tags, ...rest } = input;
  return {
    ...rest,
    text,
    chars: text.length,
    sha256: await sha256Hex(text),
    ...(place ? { place } : {}), ...(country ? { country } : {}), ...(tags?.length ? { tags } : {}),
  };
}
