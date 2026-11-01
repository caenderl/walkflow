// Interval program: parser and runner. The runner knows neither DOM nor BLE;
// it talks to the app through ProgramHost.

import { t, type Text } from './i18n';

/** A step ends after a time or after the belt has covered a distance. */
export type ProgramStep =
  | { sec: number; speed: number; meters?: undefined }
  | { meters: number; speed: number; sec?: undefined };

const num = (v: string) => parseFloat(v.replace(',', '.'));

/**
 * One step per line: "<amount> [unit] <km/h>", decimal point or comma. Unit min (default), s, m or km.
 * Unreadable lines are ignored, and so is a distance step without a speed, which could never end.
 */
export function parseProgram(text: string): ProgramStep[] {
  const steps: ProgramStep[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d+(?:[.,]\d+)?)\s*(min|km|s|m)?\s+(\d+(?:[.,]\d+)?)/);
    if (!m?.[1] || !m[3]) continue;
    const amount = num(m[1]), speed = num(m[3]), unit = m[2] ?? 'min';
    if (unit === 'm' || unit === 'km') {
      if (speed > 0) steps.push({ meters: Math.round(amount * (unit === 'km' ? 1000 : 1)), speed });
    } else {
      steps.push({ sec: Math.round(amount * (unit === 's' ? 1 : 60)), speed });
    }
  }
  return steps;
}

/** Text that parseProgram reads back to the same steps */
export function formatProgram(steps: readonly ProgramStep[]): string {
  return steps.map(s => {
    if (s.meters !== undefined) return s.meters >= 1000 ? `${s.meters / 1000} km ${s.speed}` : `${s.meters} m ${s.speed}`;
    return s.sec % 60 === 0 ? `${s.sec / 60} ${s.speed}` : `${s.sec} s ${s.speed}`;
  }).join('\n');
}

export function programLength(steps: readonly ProgramStep[]): { sec: number; meters: number } {
  let sec = 0, meters = 0;
  for (const s of steps) { sec += s.sec ?? 0; meters += s.meters ?? 0; }
  return { sec, meters };
}

export function totalSeconds(steps: readonly ProgramStep[]): number {
  return programLength(steps).sec;
}

export function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${t.number(meters / 1000, 2)} km`;
}

/** "5:00 min", "400 m", or both */
export function fmtLength({ sec, meters }: { sec: number; meters: number }): string {
  return [...(sec > 0 || meters === 0 ? [`${fmtTime(sec)} min`] : []), ...(meters > 0 ? [fmtDistance(meters)] : [])].join(' + ');
}

export interface ProgramHost {
  /** Request Control + Start. false = failed. */
  start(): Promise<boolean>;
  stop(): Promise<unknown>;
  /** New target; the app approaches it via the ramp and caps it to the limit. */
  setTarget(kmh: number): void;
  /** Current target after capping, for display. */
  currentTarget(): number | null;
  /** Total distance of the treadmill in m, undefined as long as none has been reported */
  distance(): number | undefined;
  /** Status line. A function, so the app can re-render it after a language change. */
  status(text: Text): void;
  log?(msg: string): void;
}

export interface ProgramOptions {
  /** Wait after start because of the belt's countdown (assumption, not measured). */
  countdownMs?: number;
  /** Monotonic clock in ms */
  now?: () => number;
}

export const COUNTDOWN_MS = 4500;

export type ProgramPhase = 'idle' | 'starting' | 'countdown' | 'running';

interface RunState {
  steps: readonly ProgramStep[];
  phase: Exclude<ProgramPhase, 'idle'>;
  /** Program start after the countdown, null while starting */
  t0: number | null;
  /** Step that has been entered (its speed was requested); -1 before the first */
  index: number;
  /** Clock time at which the entered step began */
  stepStart: number;
  /** Distance step: last reading, distance covered so far, and when to give up */
  lastDist: number | undefined;
  covered: number;
  limitMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (r: 'finished' | 'aborted') => void;
}

/**
 * Runs a program by timestamps: the clock decides which time step is due, not the number of timers that fired.
 * Throttled timers (background tab) only delay the transitions. tick() can also be called from outside
 * (BLE notifications, visibilitychange).
 * A distance step ends when the treadmill's distance counter has advanced by that much since the step began
 * (a counter that jumps back counts as 0 for that update). If it does not get there within twice the expected
 * time plus 30 s, the program ends instead of keeping the belt on that step.
 */
export class ProgramRunner {
  private cur: RunState | null = null;
  private readonly countdownMs: number;
  private readonly now: () => number;

  constructor(private readonly host: ProgramHost, opts: ProgramOptions = {}) {
    this.countdownMs = opts.countdownMs ?? COUNTDOWN_MS;
    this.now = opts.now ?? (() => performance.now());
  }

  get active() { return this.cur !== null; }
  get phase(): ProgramPhase { return this.cur?.phase ?? 'idle'; }
  get stepIndex() { return this.cur?.index ?? -1; }

  abort(msg?: Text) {
    const st = this.cur;
    if (!st) return;
    this.end(st);
    this.host.status(msg ?? (() => t.program.aborted));
  }

  run(steps: readonly ProgramStep[]): Promise<'finished' | 'aborted'> {
    if (this.cur) this.end(this.cur);
    return new Promise(resolve => {
      const st: RunState = {
        steps, phase: 'starting', t0: null, index: -1, stepStart: 0, lastDist: undefined, covered: 0, limitMs: 0,
        timer: null, resolve,
      };
      this.cur = st;
      this.host.status(() => t.program.starting);
      void this.host.start().catch(() => false).then(ok => {
        if (this.cur !== st) return;
        if (!ok) { this.abort(() => t.program.startFailed); return; }
        st.t0 = this.now() + this.countdownMs;
        st.phase = 'countdown';
        this.tick();
      });
    });
  }

  tick() {
    const st = this.cur;
    if (!st || st.t0 === null) return;
    if (st.timer !== null) { clearTimeout(st.timer); st.timer = null; }
    const nowMs = this.now();
    if (nowMs < st.t0) {
      st.timer = setTimeout(() => this.tick(), st.t0 - nowMs);
      return;
    }
    st.phase = 'running';

    const skipped: number[] = [];
    let i = Math.max(st.index, 0);
    let start = st.index < 0 ? st.t0 : st.stepStart;
    for (; i < st.steps.length; i++) {
      const step = st.steps[i]!;
      const entered = i === st.index;
      if (step.sec !== undefined) {
        const end = start + step.sec * 1000;
        if (nowMs < end) break;
        if (!entered && step.sec > 0) skipped.push(i + 1);
        start = end;
      } else {
        if (step.meters === 0) { start = nowMs; continue; }
        if (!entered) break;
        this.advanceDistance(st);
        if (st.covered < step.meters) break;
        start = nowMs;
      }
    }
    if (skipped.length) this.host.log?.(t.program.skipped(skipped));
    if (i >= st.steps.length) { this.finish(st); return; }

    const step = st.steps[i]!;
    if (i !== st.index) {
      st.index = i;
      st.stepStart = start;
      this.host.setTarget(step.speed);
      if (step.meters !== undefined) {
        st.lastDist = this.host.distance();
        st.covered = 0;
        const kmh = Math.max(this.host.currentTarget() ?? step.speed, 0.5);
        st.limitMs = (step.meters / (kmh / 3.6)) * 2000 + 30_000;
      }
    }
    const shown = this.host.currentTarget() ?? step.speed;
    const count = st.steps.length;
    if (step.meters !== undefined) {
      if (nowMs - st.stepStart > st.limitMs) {
        this.host.log?.(t.program.distanceStuckLog(i + 1));
        this.abort(() => t.program.distanceStuck);
        return;
      }
      const left = step.meters - st.covered;
      this.host.status(() => t.program.stepDistance(i + 1, count, shown, fmtDistance(left)));
      st.timer = setTimeout(() => this.tick(), 1000);
      return;
    }
    const remainingMs = start + step.sec * 1000 - nowMs;
    const remaining = fmtTime(Math.ceil(remainingMs / 1000));
    this.host.status(() => t.program.step(i + 1, count, shown, remaining));
    st.timer = setTimeout(() => this.tick(), remainingMs % 1000 || 1000);
  }

  private advanceDistance(st: RunState) {
    const d = this.host.distance();
    if (d === undefined) return;
    if (st.lastDist !== undefined && d > st.lastDist) st.covered += d - st.lastDist;
    st.lastDist = d;
  }

  private finish(st: RunState) {
    st.index = st.steps.length;
    this.end(st, false);
    this.host.status(() => t.program.done);
    void this.host.stop().catch(() => undefined).then(() => st.resolve('finished'));
  }

  private end(st: RunState, resolveAborted = true) {
    if (st.timer !== null) clearTimeout(st.timer);
    st.timer = null;
    if (this.cur === st) this.cur = null;
    if (resolveAborted) st.resolve('aborted');
  }
}
