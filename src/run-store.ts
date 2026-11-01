// Where the runs are kept: IndexedDB (browser, PWA and desktop app). Summaries and samples are separate
// object stores, so the list never loads all samples. Without IndexedDB (e.g. blocked site data) the runs
// stay in memory until the page is closed, and the history says so.

import type { Run, RunSummary, Track } from './runs';

export interface RunStore {
  /** false = only in memory, lost when the page is closed */
  readonly persistent: boolean;
  /** All summaries, newest first */
  list(): Promise<RunSummary[]>;
  track(id: string): Promise<Track | undefined>;
  /** Adds the run or replaces the one with the same id */
  put(run: Run): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  /** All runs with their samples, oldest first (backup) */
  all(): Promise<Run[]>;
}

const newestFirst = (a: RunSummary, b: RunSummary) => b.start - a.start;

export class MemoryRunStore implements RunStore {
  readonly persistent = false;
  private runs = new Map<string, Run>();

  async list() { return [...this.runs.values()].map(r => r.summary).sort(newestFirst); }
  async track(id: string) { return this.runs.get(id)?.track; }
  async put(run: Run) { this.runs.set(run.summary.id, run); }
  async delete(id: string) { this.runs.delete(id); }
  async clear() { this.runs.clear(); }
  async all() { return [...this.runs.values()].sort((a, b) => a.summary.start - b.summary.start); }
}

const DB_NAME = 'walkflow';
const DB_VERSION = 1;
const RUNS = 'runs';
const TRACKS = 'tracks';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IdbRunStore implements RunStore {
  readonly persistent = true;

  private constructor(private readonly db: IDBDatabase) {
    // Another tab with a newer version wants to upgrade: let it
    db.onversionchange = () => db.close();
  }

  static async open(timeoutMs = 5000): Promise<IdbRunStore> {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(TRACKS)) db.createObjectStore(TRACKS);
    };
    const db = await Promise.race([
      request(r),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB did not open')), timeoutMs)),
    ]);
    return new IdbRunStore(db);
  }

  async list() {
    const all = await request(this.db.transaction(RUNS).objectStore(RUNS).getAll() as IDBRequest<RunSummary[]>);
    return all.sort(newestFirst);
  }

  track(id: string) {
    return request(this.db.transaction(TRACKS).objectStore(TRACKS).get(id) as IDBRequest<Track | undefined>);
  }

  put(run: Run) {
    const tx = this.db.transaction([RUNS, TRACKS], 'readwrite');
    tx.objectStore(RUNS).put(run.summary);
    tx.objectStore(TRACKS).put(run.track, run.summary.id);
    return complete(tx);
  }

  delete(id: string) {
    const tx = this.db.transaction([RUNS, TRACKS], 'readwrite');
    tx.objectStore(RUNS).delete(id);
    tx.objectStore(TRACKS).delete(id);
    return complete(tx);
  }

  clear() {
    const tx = this.db.transaction([RUNS, TRACKS], 'readwrite');
    tx.objectStore(RUNS).clear();
    tx.objectStore(TRACKS).clear();
    return complete(tx);
  }

  async all() {
    const tx = this.db.transaction([RUNS, TRACKS]);
    const tracks = tx.objectStore(TRACKS);
    // All requests in one go, while the transaction is active
    const [sums, keys, values] = await Promise.all([
      request(tx.objectStore(RUNS).getAll() as IDBRequest<RunSummary[]>),
      request(tracks.getAllKeys()),
      request(tracks.getAll() as IDBRequest<Track[]>),
    ]);
    const byId = new Map(keys.map((k, i) => [String(k), values[i]!]));
    return sums
      .flatMap(summary => { const track = byId.get(summary.id); return track ? [{ summary, track }] : []; })
      .sort((a, b) => a.summary.start - b.summary.start);
  }
}

export async function openRunStore(): Promise<RunStore> {
  try {
    return await IdbRunStore.open();
  } catch {
    return new MemoryRunStore();
  }
}
