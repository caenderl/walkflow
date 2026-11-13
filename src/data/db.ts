// The one IndexedDB database of the app: runs and their samples (run-store.ts), workouts and settings
// (workout-store.ts), routes (route-store.ts). Opened once; a missing or blocked IndexedDB makes the stores fall back to memory.

const DB_NAME = 'walkflow';
const DB_VERSION = 3;
export const RUNS = 'runs';
export const TRACKS = 'tracks';
export const WORKOUTS = 'workouts';
export const ROUTES = 'routes';
/** Small single values (the week plan), under out-of-line keys */
export const META = 'meta';

export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

let opening: Promise<IDBDatabase> | null = null;

/** Memoized: both stores share one connection. A failed attempt is not remembered. */
export function openDb(timeoutMs = 5000): Promise<IDBDatabase> {
  if (opening) return opening;
  const attempt = (async () => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(TRACKS)) db.createObjectStore(TRACKS);
      if (!db.objectStoreNames.contains(WORKOUTS)) db.createObjectStore(WORKOUTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ROUTES)) db.createObjectStore(ROUTES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    const db = await Promise.race([
      request(r),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB did not open')), timeoutMs)),
    ]);
    // Another tab with a newer version wants to upgrade: let it
    db.onversionchange = () => { db.close(); opening = null; };
    return db;
  })();
  opening = attempt;
  attempt.catch(() => { if (opening === attempt) opening = null; });
  return attempt;
}
