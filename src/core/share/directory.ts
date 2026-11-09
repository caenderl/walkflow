// The list of what the connected devices offer: one entry per file (by its SHA-256, whatever each device calls it), with the
// devices that have it, filters, and a local list of what the person has hidden. Pure: the connection feeds it the offers
// as they arrive and the screen draws what it returns.
//
// Everything in an offer is what a stranger says. So a file that several devices describe differently is shown as most of
// them describe it, and what is asked for is always checked against the hash and the length that were offered.

import type { ItemKind, OfferedItem } from './protocol';

export interface DirectoryEntry {
  sha256: string;
  kind: ItemKind;
  name: string;
  chars: number;
  place?: string;
  country?: string;
  tags?: string[];
  /** The devices that offer it now, in the order they were first seen */
  peers: string[];
}

export interface DirectoryFilter {
  kind?: ItemKind;
  /** ISO 3166-1 alpha-2; case does not matter */
  country?: string;
  tag?: string;
  /** Every word has to be in the name, the place or the tags; case and accents do not matter */
  text?: string;
  /** Hidden files are left out unless this is set */
  includeHidden?: boolean;
}

export interface Facets {
  kinds: Record<ItemKind, number>;
  countries: { value: string; count: number }[];
  tags: { value: string; count: number }[];
}

/** Lower case, no accents, ß as ss: what is compared when searching */
export const fold = (text: string) => text.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');

const describe = (i: OfferedItem) => JSON.stringify([i.kind, i.name, i.chars, i.place ?? null, i.country ?? null, i.tags ?? null]);

export class Directory {
  /** Device → what it offers, in the order the devices were first seen */
  private readonly offers = new Map<string, OfferedItem[]>();
  private readonly hiddenSet: Set<string>;

  /** `hidden`: the hashes the person has hidden before (kept by the caller) */
  constructor(hidden: Iterable<string> = []) {
    this.hiddenSet = new Set(hidden);
  }

  /** A device's offer, in place of what it offered before */
  update(peer: string, items: readonly OfferedItem[]) {
    this.offers.set(peer, [...items]);
  }

  /** A device has left */
  remove(peer: string) {
    this.offers.delete(peer);
  }

  hide(sha256: string) { this.hiddenSet.add(sha256); }
  unhide(sha256: string) { this.hiddenSet.delete(sha256); }
  get hidden(): string[] { return [...this.hiddenSet]; }

  /** One entry per file, from the first item each device offers with that hash */
  private entries(): DirectoryEntry[] {
    type Group = { peers: string[]; seen: Map<string, { item: OfferedItem; count: number }> };
    const byHash = new Map<string, Group>();
    for (const [peer, items] of this.offers) {
      const once = new Set<string>();
      for (const item of items) {
        if (once.has(item.sha256)) continue;
        once.add(item.sha256);
        const group: Group = byHash.get(item.sha256) ?? { peers: [], seen: new Map() };
        byHash.set(item.sha256, group);
        group.peers.push(peer);
        const key = describe(item);
        const known = group.seen.get(key);
        if (known) known.count++; else group.seen.set(key, { item, count: 1 });
      }
    }
    const out: DirectoryEntry[] = [];
    for (const [sha256, { peers, seen }] of byHash) {
      // The description most devices agree on; with no majority the one seen first
      let best: { item: OfferedItem; count: number } | undefined;
      for (const candidate of seen.values()) if (!best || candidate.count > best.count) best = candidate;
      const i = best!.item;
      out.push({
        sha256, kind: i.kind, name: i.name, chars: i.chars,
        ...(i.place ? { place: i.place } : {}), ...(i.country ? { country: i.country } : {}), ...(i.tags ? { tags: [...i.tags] } : {}),
        peers,
      });
    }
    return out;
  }

  private visible(includeHidden = false): DirectoryEntry[] {
    return this.entries().filter(e => includeHidden || !this.hiddenSet.has(e.sha256));
  }

  /** The files, the ones most devices have first, then by name, then by hash */
  list(filter: DirectoryFilter = {}): DirectoryEntry[] {
    const words = fold(filter.text ?? '').split(/\s+/).filter(Boolean);
    const country = filter.country?.toUpperCase();
    return this.visible(filter.includeHidden)
      .filter(e => (!filter.kind || e.kind === filter.kind) && (!country || e.country === country) && (!filter.tag || e.tags?.includes(filter.tag)))
      .filter(e => {
        if (!words.length) return true;
        const haystack = fold([e.name, e.place ?? '', ...(e.tags ?? [])].join(' '));
        return words.every(w => haystack.includes(w));
      })
      .sort((a, b) => b.peers.length - a.peers.length || a.name.localeCompare(b.name) || (a.sha256 < b.sha256 ? -1 : 1));
  }

  /** How many files are listed (hidden ones do not count) */
  get size(): number {
    return this.visible().length;
  }

  /** What there is to filter by, with the number of files for each, most first */
  facets(): Facets {
    const kinds: Record<ItemKind, number> = { route: 0, workout: 0 };
    const countries = new Map<string, number>();
    const tags = new Map<string, number>();
    for (const e of this.visible()) {
      kinds[e.kind]++;
      if (e.country) countries.set(e.country, (countries.get(e.country) ?? 0) + 1);
      for (const t of e.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    const sorted = (m: Map<string, number>) => [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
    return { kinds, countries: sorted(countries), tags: sorted(tags) };
  }

  /** The devices that have a file, with the id it has on each connection, in the order they were first seen */
  candidates(sha256: string): { peer: string; id: string }[] {
    const out: { peer: string; id: string }[] = [];
    for (const [peer, items] of this.offers) {
      const item = items.find(i => i.sha256 === sha256);
      if (item) out.push({ peer, id: item.id });
    }
    return out;
  }

  /** What a device offered under an id: the length and the hash a transfer from it is checked against */
  offeredBy(peer: string, id: string): OfferedItem | undefined {
    return this.offers.get(peer)?.find(i => i.id === id);
  }
}
