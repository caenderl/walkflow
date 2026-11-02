// Recorded runs: detection from the live samples, compact storage form, backup file.
// No DOM and no IndexedDB here (see run-store.ts), so all of it is testable. The recorder sits next to the
// control path: it never throws, and saving runs asynchronously, so it cannot delay a stop.

import { accumulate, distanceSeries, type Sample } from './export';
import { readRoutes, type Route } from './routes';
import { readPlan, readWorkouts, type WeekPlan, type Workout } from './workouts';

export type RunSource = 'ble' | 'demo';

/** What a run was, when it was started from a saved workout or a route. A snapshot: the name stays if the original is deleted. */
export interface RunTag {
  kind: 'workout' | 'route';
  id: string;
  name: string;
  /** The workout or route reached its end (a run that was stopped early is false) */
  completed: boolean;
}

export const RUN_TAG_NAME_MAX = 80;

export interface RunSummary {
  /** Start time as a string; the same run from a backup gets the same id */
  id: string;
  source: RunSource;
  /** Unix ms of the first and the last sample with movement */
  start: number;
  end: number;
  /** Seconds with the belt moving, pauses not counted */
  movingSec: number;
  /** Metres */
  dist: number;
  kcal?: number;
  /** Over the moving time */
  avgKmh: number;
  maxKmh: number;
  avgHr?: number;
  maxHr?: number;
  tag?: RunTag;
}

/** Samples as integers in the FTMS resolution. Columns the treadmill never reported are left out. */
export interface Track {
  /** ms since the start */
  t: number[];
  /** km/h × 100 */
  speed: (number | null)[];
  /** m */
  dist?: (number | null)[];
  /** % × 10 */
  incl?: (number | null)[];
  /** bpm */
  hr?: (number | null)[];
  kcal?: (number | null)[];
}

export interface Run {
  summary: RunSummary;
  track: Track;
}

/** A run ends after this long without movement (or when the connection closes). */
export const RUN_END_IDLE_MS = 5 * 60_000;
/** Shorter runs are not saved (a quick test start is not a run). */
export const RUN_MIN_MOVING_SEC = 60;
/** The run being recorded is saved this often, so closing the app loses at most this much. */
export const RUN_CHECKPOINT_MS = 15_000;
/** About 14 h at 1 Hz; longer recordings are split. Also the limit for runs from a backup file. */
export const RUN_MAX_SAMPLES = 50_000;

const COLUMNS = [
  ['speed', 100], ['dist', 1], ['incl', 10], ['hr', 1], ['kcal', 1],
] as const satisfies readonly (readonly [keyof Track & keyof Sample, number])[];

const moving = (s: Sample | undefined) => (s?.speed ?? 0) > 0;

// ---------- Track codec ----------

export function encodeTrack(samples: readonly Sample[]): Track {
  const start = samples[0]?.ts ?? 0;
  const track: Track = { t: samples.map(s => Math.round(s.ts - start)), speed: [] };
  for (const [key, scale] of COLUMNS) {
    const col = samples.map(s => {
      const v = s[key];
      return v === undefined || !Number.isFinite(v) ? null : Math.round(v * scale);
    });
    if (key === 'speed' || col.some(v => v !== null)) track[key] = col;
  }
  return track;
}

export function decodeTrack(start: number, track: Track): Sample[] {
  return track.t.map((dt, i) => {
    const s: Sample = { ts: start + dt };
    for (const [key, scale] of COLUMNS) {
      const v = track[key]?.[i];
      if (v !== null && v !== undefined) s[key] = v / scale;
    }
    return s;
  });
}

// ---------- Summary ----------

export function summarize(id: string, source: RunSource, pts: readonly Sample[]): RunSummary {
  let movingMs = 0, maxKmh = 0;
  pts.forEach((p, i) => {
    const v = p.speed ?? 0;
    if (v > maxKmh) maxKmh = v;
    const next = pts[i + 1];
    if (next && v > 0) movingMs += next.ts - p.ts;
  });
  const movingSec = movingMs / 1000;
  const dist = distanceSeries(pts).at(-1) ?? 0;
  const run: RunSummary = {
    id, source,
    start: pts[0]?.ts ?? 0,
    end: pts.at(-1)?.ts ?? 0,
    movingSec, dist,
    avgKmh: movingSec > 0 ? (dist / movingSec) * 3.6 : 0,
    maxKmh,
  };
  if (pts.some(p => p.kcal !== undefined)) run.kcal = accumulate(pts.map(p => p.kcal)).at(-1)!;
  const hrs = pts.map(p => p.hr ?? 0).filter(h => h > 0);
  if (hrs.length) {
    run.avgHr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
    run.maxHr = Math.max(...hrs);
  }
  return run;
}

export function readTag(v: unknown): RunTag | null {
  if (!isObject(v)) return null;
  const { kind, id, name, completed } = v;
  if (kind !== 'workout' && kind !== 'route') return null;
  if (typeof id !== 'string' || !id || id.length > 64) return null;
  if (typeof name !== 'string' || typeof completed !== 'boolean') return null;
  const trimmed = name.trim();
  return trimmed && trimmed.length <= RUN_TAG_NAME_MAX ? { kind, id, name: trimmed, completed } : null;
}

/**
 * From the first to the last sample with movement; pauses in between stay. The summary is computed from the
 * stored (rounded) form, so a run read back from a backup gets exactly the same numbers.
 */
export function buildRun(samples: readonly Sample[], source: RunSource, tag?: RunTag): Run | null {
  const first = samples.findIndex(moving);
  if (first === -1) return null;
  let last = samples.length - 1;
  while (!moving(samples[last])) last--;
  const pts = samples.slice(first, last + 1);
  const start = Math.round(pts[0]!.ts);
  const track = encodeTrack(pts.map(p => ({ ...p, ts: p.ts - pts[0]!.ts + start })));
  const summary = summarize(String(start), source, decodeTrack(start, track));
  if (tag) summary.tag = tag;
  return { summary, track };
}

// ---------- Recorder ----------

export interface RecorderHost {
  /** Stores the run, replacing an earlier version with the same id. May fail; the recorder carries on. */
  save(run: Run): Promise<unknown>;
  /** final = the run has ended; otherwise an intermediate save of the run being recorded */
  onSaved?(run: Run, final: boolean): void;
  onError?(e: unknown): void;
}

export interface RecorderOptions {
  idleEndMs?: number;
  minMovingSec?: number;
  checkpointMs?: number;
  maxSamples?: number;
}

/**
 * Turns the stream of live samples into runs. A run starts with the first sample with movement and ends after
 * RUN_END_IDLE_MS without movement, on finish() (connection closed) or when the source changes. While it runs,
 * it is saved every RUN_CHECKPOINT_MS under the same id. Saves run one after another, never in parallel.
 */
export class RunRecorder {
  private samples: Sample[] = [];
  private source: RunSource = 'ble';
  private lastMoving = 0;
  private movingMs = 0;
  private lastSaved = -Infinity;
  private savedId: string | null = null;
  private enabled = true;
  private chain: Promise<void> = Promise.resolve();
  /** Tag for the run being recorded or the next one, with the token of the walk that set it */
  private tag: { value: RunTag; token: number } | null = null;
  private tokens = 0;
  private readonly o: Required<RecorderOptions>;

  constructor(private readonly host: RecorderHost, opts: RecorderOptions = {}) {
    this.o = {
      idleEndMs: RUN_END_IDLE_MS, minMovingSec: RUN_MIN_MOVING_SEC, checkpointMs: RUN_CHECKPOINT_MS,
      maxSamples: RUN_MAX_SAMPLES, ...opts,
    };
  }

  get recording(): boolean { return this.samples.length > 0; }
  /** Id of the run being recorded once it has been saved for the first time, otherwise null */
  get currentId(): string | null { return this.savedId; }

  feed(s: Sample, source: RunSource): void {
    this.guard(() => {
      if (!this.enabled || !Number.isFinite(s.ts)) return;
      const last = this.samples.at(-1);
      if (last && s.ts < last.ts) return;
      if (last && (source !== this.source || s.ts - this.lastMoving >= this.o.idleEndMs
        || this.samples.length >= this.o.maxSamples)) this.finish();
      const prev = this.samples.at(-1);
      if (!prev) {
        if (!moving(s)) return;
        this.source = source;
      } else if (moving(prev)) {
        this.movingMs += s.ts - prev.ts;
      }
      this.samples.push(s);
      if (moving(s)) this.lastMoving = s.ts;
      if (s.ts - this.lastSaved >= this.o.checkpointMs) this.save();
    });
  }

  /**
   * A workout or route is about to start: the run being recorded is closed, and the next one gets this tag, so a
   * program is always a run of its own. Returns the token that complete() needs; a walk that has been replaced by a
   * newer one can no longer change the tag.
   */
  begin(tag: Omit<RunTag, 'completed'>): number {
    this.finish();
    const token = ++this.tokens;
    const name = tag.name.trim().slice(0, RUN_TAG_NAME_MAX).trim();
    this.tag = name ? { value: { ...tag, name, completed: false }, token } : null;
    return token;
  }

  /**
   * The walk is over: completed = it reached its end. The tag stays on the run (which goes on until it ends by itself);
   * a walk during which the belt never moved leaves nothing behind for the next run.
   */
  complete(token: number, completed: boolean): void {
    this.guard(() => {
      if (!this.tag || this.tag.token !== token) return;
      if (!this.samples.length) { this.tag = null; return; }
      this.tag = { ...this.tag, value: { ...this.tag.value, completed } };
      this.save();
    });
  }

  /** Call regularly (about once a second): ends the run when the treadmill has stopped sending data. */
  tick(now: number): void {
    this.guard(() => {
      if (this.samples.length && now - this.lastMoving >= this.o.idleEndMs) this.finish();
    });
  }

  /** Connection closed: save what there is and wait for the next run. */
  finish(): void {
    this.guard(() => {
      this.save(true);
      this.samples = [];
      this.movingMs = 0;
      this.lastSaved = -Infinity;
      this.savedId = null;
      this.tag = null;
    });
  }

  /** Save now, e.g. when the page is hidden or closed. Recording continues. */
  flush(): void {
    this.guard(() => this.save());
  }

  setEnabled(on: boolean): void {
    this.guard(() => {
      if (!on) this.finish();
      this.enabled = on;
    });
  }

  /** Resolves once all saves started so far are done (or have failed). */
  settled(): Promise<void> { return this.chain; }

  private save(final = false) {
    if (this.movingMs / 1000 < this.o.minMovingSec) return;
    const run = buildRun(this.samples, this.source, this.tag?.value);
    if (!run) return;
    this.lastSaved = this.samples.at(-1)!.ts;
    this.savedId = run.summary.id;
    const { host } = this;
    this.chain = this.chain
      .then(() => host.save(run))
      .then(() => host.onSaved?.(run, final), e => host.onError?.(e))
      .catch(() => { /* a broken handler must not stop later saves */ });
  }

  private guard(fn: () => void) {
    try {
      fn();
    } catch (e) {
      try { this.host.onError?.(e); } catch { /* ignore */ }
    }
  }
}

// ---------- Backup file ----------

export const BACKUP_FORMAT = 'walkflow-backup';
export const BACKUP_VERSION = 1;

export interface BackupExtras {
  workouts?: readonly Workout[];
  routes?: readonly Route[];
  plan?: WeekPlan | null;
}

/**
 * Start, source, samples and the tag (what the run was) are written; the rest of the summary is computed again when reading.
 * Workouts, routes and the week plan are optional additions to version 1: older files simply do not have them.
 */
export function serializeBackup(runs: readonly Run[], exported: Date, extras: BackupExtras = {}): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported: exported.toISOString(),
    runs: runs.map(r => ({ start: r.summary.start, source: r.summary.source, track: r.track, ...(r.summary.tag ? { tag: r.summary.tag } : {}) })),
    ...(extras.workouts?.length ? { workouts: extras.workouts } : {}),
    ...(extras.routes?.length ? { routes: extras.routes } : {}),
    ...(extras.plan ? { plan: extras.plan } : {}),
  });
}

export type BackupResult =
  | { ok: true; runs: Run[]; invalid: number; workouts: Workout[]; invalidWorkouts: number; routes: Route[]; invalidRoutes: number; plan: WeekPlan | null }
  | { ok: false; reason: 'unreadable' | 'newer' };

/** Allowed integer range per column, in the stored resolution */
const RANGES: Record<(typeof COLUMNS)[number][0], readonly [number, number]> = {
  speed: [0, 10_000], dist: [0, 16_777_215], incl: [-1000, 1000], hr: [0, 300], kcal: [0, 65_535],
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readColumn(v: unknown, length: number, [min, max]: readonly [number, number]): (number | null)[] | null {
  if (!Array.isArray(v) || v.length !== length) return null;
  for (const x of v) {
    if (x !== null && !(Number.isInteger(x) && x >= min && x <= max)) return null;
  }
  return v as (number | null)[];
}

function readRun(v: unknown): Run | null {
  if (!isObject(v) || !isObject(v.track)) return null;
  const { start, source, track } = v;
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 0 || start > 1e14) return null;
  if (source !== 'ble' && source !== 'demo') return null;
  const t = track.t;
  if (!Array.isArray(t) || !t.length || t.length > RUN_MAX_SAMPLES) return null;
  for (let i = 0; i < t.length; i++) {
    const x: unknown = t[i];
    if (!Number.isInteger(x) || (x as number) < 0 || (i > 0 && (x as number) < (t[i - 1] as number))) return null;
  }
  const out: Track = { t: t as number[], speed: [] };
  for (const [key] of COLUMNS) {
    if (key !== 'speed' && track[key] === undefined) continue;
    const col = readColumn(track[key], t.length, RANGES[key]);
    if (!col) return null;
    out[key] = col;
  }
  // A damaged tag costs the tag, not the run
  return buildRun(decodeTrack(start, out), source, (v.tag === undefined ? null : readTag(v.tag)) ?? undefined);
}

export function parseBackup(text: string): BackupResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'unreadable' }; }
  if (!isObject(data) || data.format !== BACKUP_FORMAT || typeof data.version !== 'number' || !Array.isArray(data.runs)) {
    return { ok: false, reason: 'unreadable' };
  }
  if (data.version > BACKUP_VERSION) return { ok: false, reason: 'newer' };
  if (data.version !== BACKUP_VERSION) return { ok: false, reason: 'unreadable' };
  const runs: Run[] = [];
  let invalid = 0;
  for (const r of data.runs) {
    const run = readRun(r);
    if (run) runs.push(run); else invalid++;
  }
  const { workouts, invalid: invalidWorkouts } = readWorkouts(data.workouts);
  const { routes, invalid: invalidRoutes } = readRoutes(data.routes);
  return { ok: true, runs, invalid, workouts, invalidWorkouts, routes, invalidRoutes, plan: readPlan(data.plan) };
}
