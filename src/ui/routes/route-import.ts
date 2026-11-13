// Importing routes: a GPX file or a route package, chosen in the routes view or opened from outside (double click). What is
// saved has passed readRoute; a package always becomes a new route and never replaces one that is there already.

import { countryAt } from '../../core/routes/country';
import { GPX_MAX_CHARS, parseGpx } from '../../core/routes/gpx';
import { nameFromFile } from '../../core/routes/route-files';
import { readPackage } from '../../core/routes/route-package';
import { packageKind } from '../../core/share/package-kind';
import { routeName } from '../../core/routes/route-text';
import { analyzeRoute, newRouteId, readRoute, type Route } from '../../core/routes/routes';
import { fmtDistance } from '../../core/training/program';
import type { RouteStore } from '../../data/route-store';
import { lang, t } from '../../i18n/i18n';
import { confirmDialog } from '../components/dialogs';

export interface RouteImportHost {
  store(): Promise<RouteStore>;
  /** A message under the list, or null to clear it */
  setStatus(text: (() => string) | null): void;
  /** A route was saved: the library is loaded again and the route is selected */
  added(route: Route): Promise<void>;
}

type Failure = 'unreadable' | 'packageTooLarge' | 'packageNewer' | 'packageInvalid';

export function setupRouteImport(host: RouteImportHost) {
  const setStatus: RouteImportHost['setStatus'] = text => host.setStatus(text);
  async function importFile(file: File) {
    const fail = (key: 'unreadable' | 'tooLarge' | 'unsafe' | 'noPoints' | 'packageTooLarge' | 'packageNewer' | 'packageInvalid' | 'isWorkoutPackage') => setStatus(() => t.routes[key]);
    if (file.size > GPX_MAX_CHARS) { fail('tooLarge'); return; }
    let text: string;
    try { text = await file.text(); } catch { fail('unreadable'); return; }
    // A route package is JSON, a GPX file is XML; a workout package belongs in the workouts view
    if (packageKind(text) === 'workout') { fail('isWorkoutPackage'); return; }
    if (text.trimStart().startsWith('{')) { await importPackage(text, fail); return; }
    const parsed = parseGpx(text);
    if (!parsed.ok) { fail(parsed.reason); return; }
    const name = (parsed.name ?? nameFromFile(file.name)) || t.routes.cardTitle;
    // Where the route starts, worked out on the device; if that fails the route is kept and looked up at the next start
    const country = await countryAt(parsed.points[0]!.lat, parsed.points[0]!.lon).catch(() => undefined);
    const route = readRoute({ id: newRouteId(Date.now()), name, points: parsed.points, updated: Date.now(), country });
    if (!route) { fail('noPoints'); return; }
    try { await (await host.store()).put(route); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await host.added(route);
    const stats = analyzeRoute(route);
    setStatus(() => [
      t.routes.imported(routeName(route, lang), stats.total),
      ...(parsed.skipped ? [t.routes.skippedPoints(parsed.skipped)] : []),
      ...(parsed.simplified ? [t.routes.simplified] : []),
    ].join(' '));
  }

  const packageFailure = (reason: 'unreadable' | 'tooLarge' | 'newer' | 'invalid') =>
    reason === 'tooLarge' ? 'packageTooLarge' : reason === 'newer' ? 'packageNewer' : reason === 'invalid' ? 'packageInvalid' : 'unreadable';

  /**
   * A package opened from outside (double click in the Finder or Explorer). It is read and checked first, then the person is
   * asked: a file that comes from outside is never imported on its own.
   */
  async function openPackage(file: { name: string; text?: string; error?: 'unreadable' | 'tooLarge' }) {
    location.hash = '#routes';
    if (file.text === undefined) { setStatus(() => (file.error === 'tooLarge' ? t.routes.packageTooLarge : t.routes.unreadable)); return; }
    if (packageKind(file.text) === 'workout') { setStatus(() => t.routes.isWorkoutPackage); return; }
    const read = readPackage(file.text, newRouteId(Date.now()), Date.now());
    if (!read.ok) { setStatus(() => t.routes[packageFailure(read.reason)]); return; }
    const total = analyzeRoute(read.route).total;
    if (!(await confirmDialog(t.routes.openPackageTitle, [t.routes.openPackageText(routeName(read.route, lang), fmtDistance(total))], t.routes.openPackageConfirm))) return;
    await importPackage(file.text, key => setStatus(() => t.routes[key]));
  }

  /** A package always becomes a new route, with a new id: it never replaces one that is there already */
  async function importPackage(text: string, fail: (key: Failure) => void) {
    const read = readPackage(text, newRouteId(Date.now()), Date.now());
    if (!read.ok) { fail(packageFailure(read.reason)); return; }
    let route = read.route;
    // A package without a country gets the one of its start, worked out on the device
    if (route.country === undefined) {
      const country = await countryAt(route.points[0]!.lat, route.points[0]!.lon).catch(() => undefined);
      route = readRoute({ ...route, country }) ?? route;
    }
    try { await (await host.store()).put(route); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await host.added(route);
    setStatus(() => t.routes.imported(routeName(route, lang), analyzeRoute(route).total));
  }

  /**
   * A route package that was downloaded from the route store (already compared with the list). The person is asked first.
   * `replace` is the id of the copy in the library that is updated: it keeps its id (and stays chosen and shared), everything
   * else is the new version. Without it the package becomes a new route.
   */
  async function takeFromStore(file: { name: string; text: string }, opts: { storeFile: string; replace?: string }) {
    const read = readPackage(file.text, newRouteId(Date.now()), Date.now());
    if (!read.ok) { setStatus(() => t.routes[packageFailure(read.reason)]); return; }
    const name = routeName(read.route, lang);
    const revision = read.route.revision ?? 1;
    const existing = opts.replace ? (await (await host.store()).list()).find(r => r.id === opts.replace) : undefined;
    const ok = existing
      ? await confirmDialog(t.routeStore.updateTitle, [t.routeStore.updateText(routeName(existing, lang), existing.revision ?? 1, revision)], t.routeStore.updateConfirm)
      : await confirmDialog(t.routeStore.addTitle, [t.routeStore.addText(name, fmtDistance(analyzeRoute(read.route).total))], t.routeStore.addConfirm);
    if (!ok) return;
    let route: Route = { ...read.route, storeFile: opts.storeFile, ...(existing ? { id: existing.id, ...(existing.shared ? { shared: true as const } : {}) } : {}) };
    if (route.country === undefined) {
      const country = await countryAt(route.points[0]!.lat, route.points[0]!.lon).catch(() => undefined);
      route = readRoute({ ...route, country }) ?? route;
    }
    try { await (await host.store()).put(route); } catch (e) { setStatus(() => t.routes.failed(String(e))); return; }
    await host.added(route);
    setStatus(() => (existing ? t.routeStore.updated(name, revision) : t.routes.imported(name, analyzeRoute(route).total)));
  }

  return { importFile, openPackage, takeFromStore };
}
