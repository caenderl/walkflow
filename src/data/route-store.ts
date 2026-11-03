// Where the saved routes are kept: the same IndexedDB as the runs and workouts. Without it they stay in memory
// until the page is closed (same fallback as the others).

import { complete, openDb, request, ROUTES } from './db';
import { readRoutes, type Route } from '../core/routes/routes';

export interface RouteStore {
  /** false = only in memory, lost when the page is closed */
  readonly persistent: boolean;
  /** Sorted by name */
  list(): Promise<Route[]>;
  /** Adds the route or replaces the one with the same id */
  put(r: Route): Promise<void>;
  delete(id: string): Promise<void>;
}

const byName = (a: Route, b: Route) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const copy = (r: Route): Route => ({ ...r, points: r.points.map(p => ({ ...p })) });

export class MemoryRouteStore implements RouteStore {
  readonly persistent = false;
  private routes = new Map<string, Route>();

  async list() { return [...this.routes.values()].map(copy).sort(byName); }
  async put(r: Route) { this.routes.set(r.id, copy(r)); }
  async delete(id: string) { this.routes.delete(id); }
}

export class IdbRouteStore implements RouteStore {
  readonly persistent = true;

  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbRouteStore> {
    return new IdbRouteStore(await openDb());
  }

  // What is read back is checked like a file from outside: a damaged entry is dropped, not used
  async list() {
    const all = await request(this.db.transaction(ROUTES).objectStore(ROUTES).getAll());
    return readRoutes(all).routes.sort(byName);
  }

  put(r: Route) {
    const tx = this.db.transaction(ROUTES, 'readwrite');
    tx.objectStore(ROUTES).put(r);
    return complete(tx);
  }

  delete(id: string) {
    const tx = this.db.transaction(ROUTES, 'readwrite');
    tx.objectStore(ROUTES).delete(id);
    return complete(tx);
  }
}

let store: Promise<RouteStore> | null = null;

/** One store for the app (the history backup and the routes view share it) */
export function getRouteStore(): Promise<RouteStore> {
  store ??= IdbRouteStore.open().catch((): RouteStore => new MemoryRouteStore());
  return store;
}
