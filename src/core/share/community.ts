// What a device passes on to the community, and what it does with a file it took from there (docs/P2P.md).
//
// Passed on are: what the person has switched on (`shared`), and everything that was taken from the community (`communityHash`),
// for as long as the package the app writes for it is byte for byte the one that arrived. The hash of a file is its identity:
// the same file has the same hash on every device, so an item that differs is a different item and is not offered as the
// original. Editing a route or workout from the community therefore makes it the person's own again.

import type { Lang } from '../../i18n/i18n';
import { packageFromRoute, readPackage, serializePackage } from '../routes/route-package';
import { newRouteId, plainName, type Route } from '../routes/routes';
import { readWorkoutPackage, serializeWorkoutPackage, workoutPackage } from '../training/workout-package';
import { newWorkoutId, type Workout } from '../training/workouts';
import { sha256Hex } from './hash';
import { makeShareItem } from './item';
import { packageKind } from './package-kind';
import type { ItemKind, ShareItem } from './protocol';

const pick = (map: Readonly<Record<string, string>> | undefined, lang: Lang): string | undefined =>
  map && (map[lang] ?? plainName(map));

/** The id an item has on a connection: it means nothing outside it, so the start of the hash will do */
export const itemId = (sha256: string) => `h${sha256.slice(0, 24)}`;

/** What the app writes for a route or workout when it is exported: the file that is hashed and offered */
export function routeText(r: Route): string {
  return serializePackage(packageFromRoute(r));
}
export function workoutText(w: Workout): string {
  return serializeWorkoutPackage(workoutPackage(w));
}

/**
 * Everything this device offers: routes and workouts the person switched on, and those taken from the community that are still
 * as they arrived. One entry per file; named, placed and tagged in the language of the room.
 */
export async function offeredItems(routes: readonly Route[], workouts: readonly Workout[], lang: Lang): Promise<ShareItem[]> {
  const out: ShareItem[] = [];
  const seen = new Set<string>();
  const add = async (kind: ItemKind, text: string, name: string | undefined, place: string | undefined, country: string | undefined, tags: string[] | undefined, offer: (hash: string) => boolean) => {
    const sha256 = await sha256Hex(text);
    if (seen.has(sha256) || !offer(sha256) || !name) return;
    seen.add(sha256);
    out.push(await makeShareItem({ id: itemId(sha256), kind, name, text, place, country, tags }));
  };
  for (const r of routes) {
    if (!r.shared && !r.communityHash) continue;
    const pkg = packageFromRoute(r);
    await add('route', serializePackage(pkg), pick(pkg.name, lang), pick(pkg.place, lang), pkg.country, pkg.tags, hash => r.shared === true || r.communityHash === hash);
  }
  for (const w of workouts) {
    if (!w.shared && !w.communityHash) continue;
    const pkg = workoutPackage(w);
    await add('workout', serializeWorkoutPackage(pkg), pick(pkg.name, lang), undefined, undefined, pkg.tags, hash => w.shared === true || w.communityHash === hash);
  }
  return out;
}

/** The hash of every route and workout in the library, as the file the app would export: what is already here, whoever offers it */
export async function localHashes(routes: readonly Route[], workouts: readonly Workout[]): Promise<Set<string>> {
  const hashes = await Promise.all([...routes.map(r => sha256Hex(routeText(r))), ...workouts.map(w => sha256Hex(workoutText(w)))]);
  return new Set(hashes);
}

export type CommunityItem =
  | { ok: true; kind: 'route'; route: Route }
  | { ok: true; kind: 'workout'; workout: Workout }
  | { ok: false; reason: 'unreadable' | 'tooLarge' | 'newer' | 'invalid' };

/**
 * Reads a file that was taken from the community into a new route or workout. It is marked as taken from the community, and so
 * passed on again, only if the package the app writes for it is byte for byte the text that arrived; a package that comes out
 * differently (it was made by another program) is saved, but it would be a different file for everyone else, so it is not offered.
 * `kind` is what the device offered it as; the text has to be of that kind.
 */
export async function readCommunityItem(kind: ItemKind, text: string, now: number): Promise<CommunityItem> {
  if (packageKind(text) !== kind) return { ok: false, reason: 'invalid' };
  const hash = await sha256Hex(text);
  if (kind === 'route') {
    const read = readPackage(text, newRouteId(now), now);
    if (!read.ok) return read;
    const identical = routeText(read.route) === text;
    return { ok: true, kind, route: identical ? { ...read.route, communityHash: hash } : read.route };
  }
  const read = readWorkoutPackage(text, newWorkoutId(now), now);
  if (!read.ok) return read;
  const identical = workoutText(read.workout) === text;
  return { ok: true, kind, workout: identical ? { ...read.workout, communityHash: hash } : read.workout };
}
