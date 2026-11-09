// The route store: routes that people contributed to the project, kept as route package files in the project's repository
// (store/routes/*.walkflow) with an index (store/index.json) that names each file, its SHA-256 and what is shown in the list.
// The app reads the index from GitHub when the person opens the store, and a file only after the person picked it. Nothing
// here is trusted: the index is read as strictly as a package, and a downloaded file is compared with the hash and the length
// the index gave before it is read as a package (and the person confirms before it is saved). Pure: no DOM, no network.
// The format is described in docs/ROUTE-STORE.md.

import { fold } from '../share/directory';
import { sha256Hex } from '../share/hash';
import { PACKAGE_MAX_CHARS, readPackage } from '../routes/route-package';
import { analyzeRoute, isRevision, readLangMap, ROUTE_META_MAX, ROUTE_NAME_MAX, ROUTE_TAGS_MAX, STORE_FILE_NAME, TAG_KEY } from '../routes/routes';

export const STORE_INDEX_VERSION = 1;
/** An index of thousands of routes is well below this */
export const STORE_INDEX_MAX_CHARS = 2_000_000;
export const STORE_MAX_ROUTES = 2000;

/** What the list shows about one route file */
export interface StoreRoute {
  /** The file below store/routes/: lower-case letters, digits, `.`, `_`, `-`, ending in `.walkflow` */
  file: string;
  /** The version of the route's content, a whole number from 1: a copy in the library with a lower one is offered an update */
  revision: number;
  /** SHA-256 of the file as it is stored, lower-case hex */
  sha256: string;
  /** The length of the file's text in characters */
  chars: number;
  /** The length of the route in metres */
  length: number;
  /** Language code → name */
  name: Record<string, string>;
  /** Language code → where it is */
  place?: Record<string, string>;
  /** ISO 3166-1 alpha-2 */
  country?: string;
  tags?: string[];
}

export interface StoreIndex { version: typeof STORE_INDEX_VERSION; routes: StoreRoute[] }

export type IndexResult = { ok: true; index: StoreIndex } | { ok: false; reason: 'invalid' | 'newer' };
export type EntryResult = { ok: true; entry: StoreRoute } | { ok: false; reason: 'unreadable' | 'tooLarge' | 'newer' | 'invalid' | 'fileName' };

const FILE_NAME = STORE_FILE_NAME;
const SHA256 = /^[0-9a-f]{64}$/;
const COUNTRY = /^[A-Z]{2}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The entry for a package file, as the build script writes it into the index */
export async function entryFromPackage(file: string, text: string): Promise<EntryResult> {
  if (!FILE_NAME.test(file)) return { ok: false, reason: 'fileName' };
  const read = readPackage(text, 'store', 0);
  if (!read.ok) return read;
  const { route } = read;
  const names = route.names ?? { und: route.name };
  const entry: StoreRoute = {
    file,
    revision: route.revision ?? 1,
    sha256: await sha256Hex(text),
    chars: text.length,
    length: Math.round(analyzeRoute(route).total),
    name: names,
    ...(route.meta?.place ? { place: route.meta.place } : {}),
    ...(route.country ? { country: route.country } : {}),
    ...(route.meta?.tags?.length ? { tags: route.meta.tags } : {}),
  };
  return { ok: true, entry };
}

/** The index file: sorted by file name, so the same routes always give the same bytes and a change shows line by line in a review */
export function serializeIndex(routes: readonly StoreRoute[]): string {
  const sorted = [...routes].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return `${JSON.stringify({ version: STORE_INDEX_VERSION, routes: sorted }, null, 2)}\n`;
}

function readEntry(v: unknown): StoreRoute | null {
  if (!isObject(v)) return null;
  if (typeof v.file !== 'string' || !FILE_NAME.test(v.file)) return null;
  if (!isRevision(v.revision)) return null;
  if (typeof v.sha256 !== 'string' || !SHA256.test(v.sha256)) return null;
  if (typeof v.chars !== 'number' || !Number.isInteger(v.chars) || v.chars < 1 || v.chars > PACKAGE_MAX_CHARS) return null;
  if (typeof v.length !== 'number' || !Number.isFinite(v.length) || v.length < 0) return null;
  const name = readLangMap(v.name, ROUTE_NAME_MAX, true);
  if (!name) return null;
  const entry: StoreRoute = { file: v.file, revision: v.revision, sha256: v.sha256, chars: v.chars, length: v.length, name };
  if (v.place !== undefined) {
    const place = readLangMap(v.place, ROUTE_META_MAX, true);
    if (place) entry.place = place;
  }
  if (v.country !== undefined) {
    if (typeof v.country !== 'string' || !COUNTRY.test(v.country)) return null;
    entry.country = v.country;
  }
  if (v.tags !== undefined) {
    if (!Array.isArray(v.tags) || v.tags.length > ROUTE_TAGS_MAX || !v.tags.every(t => typeof t === 'string' && TAG_KEY.test(t))) return null;
    if (v.tags.length) entry.tags = [...new Set(v.tags as string[])];
  }
  return entry;
}

/** Reads the index as it came from outside: strictly, and with a bound on size and number */
export function parseIndex(text: string): IndexResult {
  if (text.length > STORE_INDEX_MAX_CHARS) return { ok: false, reason: 'invalid' };
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: 'invalid' }; }
  if (!isObject(v) || typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return { ok: false, reason: 'invalid' };
  if (v.version > STORE_INDEX_VERSION) return { ok: false, reason: 'newer' };
  if (!Array.isArray(v.routes) || v.routes.length > STORE_MAX_ROUTES) return { ok: false, reason: 'invalid' };
  const routes: StoreRoute[] = [];
  const files = new Set<string>();
  for (const item of v.routes as unknown[]) {
    const entry = readEntry(item);
    if (!entry || files.has(entry.file)) return { ok: false, reason: 'invalid' };
    files.add(entry.file);
    routes.push(entry);
  }
  return { ok: true, index: { version: STORE_INDEX_VERSION, routes } };
}

/** True if the text is exactly the file the index describes */
export async function verifyDownload(entry: StoreRoute, text: string): Promise<boolean> {
  return text.length === entry.chars && (await sha256Hex(text)) === entry.sha256;
}

// ---------- Addresses (the base is platform/store-url.ts) ----------

export const storeIndexUrl = (base: string) => `${base}/index.json`;
export const storeFileUrl = (base: string, file: string) => `${base}/routes/${file}`;

// ---------- The list ----------

export interface StoreFilter {
  text?: string;
  /** ISO 3166-1 alpha-2; case does not matter */
  country?: string;
  tag?: string;
}

/** The routes that match, in the order they were given. Every word has to be in a name (any language), a place or a tag. */
export function filterRoutes(routes: readonly StoreRoute[], filter: StoreFilter): StoreRoute[] {
  const words = fold(filter.text ?? '').split(/\s+/).filter(Boolean);
  const country = filter.country?.toUpperCase();
  return routes.filter(r => {
    if (country && r.country !== country) return false;
    if (filter.tag && !r.tags?.includes(filter.tag)) return false;
    if (!words.length) return true;
    const hay = fold([...Object.values(r.name), ...Object.values(r.place ?? {}), ...(r.tags ?? [])].join(' '));
    return words.every(w => hay.includes(w));
  });
}

export interface StoreFacets {
  countries: { value: string; count: number }[];
  tags: { value: string; count: number }[];
}

/** What there is to filter by, and how many routes have it: most first, then by name */
export function storeFacets(routes: readonly StoreRoute[]): StoreFacets {
  const count = (values: (string | undefined)[]) => {
    const m = new Map<string, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
  };
  return { countries: count(routes.map(r => r.country)), tags: count(routes.flatMap(r => r.tags ?? [])) };
}

// ---------- What the person has already ----------

/** What the library has of a route in the store: nothing, a copy that is as new as the store's, or an older copy that can be updated */
export type StoreState = { kind: 'new' } | { kind: 'current'; id: string } | { kind: 'update'; id: string; from: number };

/** The copies in the library that were taken from the store: `storeFile` and `revision` of a route (a missing revision is the first) */
export interface LibraryMark { id: string; storeFile?: string; revision?: number }

/** With several copies of one file the one with the highest revision decides; a copy newer than the store is current */
export function storeState(entry: StoreRoute, library: readonly LibraryMark[]): StoreState {
  const copies = library.filter(r => r.storeFile === entry.file);
  if (!copies.length) return { kind: 'new' };
  const best = copies.reduce((a, b) => ((b.revision ?? 1) > (a.revision ?? 1) ? b : a));
  const have = best.revision ?? 1;
  return have >= entry.revision ? { kind: 'current', id: best.id } : { kind: 'update', id: best.id, from: have };
}
