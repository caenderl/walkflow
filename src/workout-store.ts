// Where the saved workouts and the week plan are kept: the same IndexedDB as the runs. Without it they stay in
// memory until the page is closed (same fallback as the runs).

import { complete, META, openDb, request, WORKOUTS } from './db';
import { readPlan, readWorkouts, type WeekPlan, type Workout } from './workouts';

export interface WorkoutStore {
  /** false = only in memory, lost when the page is closed */
  readonly persistent: boolean;
  /** Sorted by name */
  list(): Promise<Workout[]>;
  /** Adds the workout or replaces the one with the same id */
  put(w: Workout): Promise<void>;
  delete(id: string): Promise<void>;
  plan(): Promise<WeekPlan | null>;
  setPlan(p: WeekPlan): Promise<void>;
}

const byName = (a: Workout, b: Workout) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
const copy = (w: Workout): Workout => ({ ...w, steps: w.steps.map(s => ({ ...s })) });

export class MemoryWorkoutStore implements WorkoutStore {
  readonly persistent = false;
  private workouts = new Map<string, Workout>();
  private weekPlan: WeekPlan | null = null;

  async list() { return [...this.workouts.values()].map(copy).sort(byName); }
  async put(w: Workout) { this.workouts.set(w.id, copy(w)); }
  async delete(id: string) { this.workouts.delete(id); }
  async plan() { return this.weekPlan && { minutes: [...this.weekPlan.minutes] }; }
  async setPlan(p: WeekPlan) { this.weekPlan = { minutes: [...p.minutes] }; }
}

const PLAN_KEY = 'plan';

export class IdbWorkoutStore implements WorkoutStore {
  readonly persistent = true;

  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbWorkoutStore> {
    return new IdbWorkoutStore(await openDb());
  }

  // What is read back is checked like a file from outside: a damaged entry is dropped, not run
  async list() {
    const all = await request(this.db.transaction(WORKOUTS).objectStore(WORKOUTS).getAll());
    return readWorkouts(all).workouts.sort(byName);
  }

  put(w: Workout) {
    const tx = this.db.transaction(WORKOUTS, 'readwrite');
    tx.objectStore(WORKOUTS).put(w);
    return complete(tx);
  }

  delete(id: string) {
    const tx = this.db.transaction(WORKOUTS, 'readwrite');
    tx.objectStore(WORKOUTS).delete(id);
    return complete(tx);
  }

  async plan() {
    return readPlan(await request(this.db.transaction(META).objectStore(META).get(PLAN_KEY)));
  }

  setPlan(p: WeekPlan) {
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).put(p, PLAN_KEY);
    return complete(tx);
  }
}

let store: Promise<WorkoutStore> | null = null;

/** One store for the app (the history backup and the workouts view share it) */
export function getWorkoutStore(): Promise<WorkoutStore> {
  store ??= IdbWorkoutStore.open().catch((): WorkoutStore => new MemoryWorkoutStore());
  return store;
}
