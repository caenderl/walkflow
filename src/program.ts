// Interval program: parser and runner. The runner knows neither DOM nor BLE;
// it talks to the app through ProgramHost.

import { t, type Text } from './i18n';

export interface ProgramStep {
  sec: number;
  speed: number;
}

/** One "minutes km/h" per line, decimal point or comma. Unreadable lines are ignored. */
export function parseProgram(text: string): ProgramStep[] {
  const steps: ProgramStep[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/);
    if (m?.[1] && m[2]) {
      steps.push({
        sec: Math.round(parseFloat(m[1].replace(',', '.')) * 60),
        speed: parseFloat(m[2].replace(',', '.')),
      });
    }
  }
  return steps;
}

export function totalSeconds(steps: ProgramStep[]): number {
  return steps.reduce((a, s) => a + s.sec, 0);
}

export function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface ProgramHost {
  /** Request Control + Start. false = failed. */
  start(): Promise<boolean>;
  stop(): Promise<unknown>;
  /** New target; the app approaches it via the ramp and caps it to the limit. */
  setTarget(kmh: number): void;
  /** Current target after capping, for display. */
  currentTarget(): number | null;
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
  steps: ProgramStep[];
  phase: Exclude<ProgramPhase, 'idle'>;
  /** Program start after the countdown, null while starting */
  t0: number | null;
  index: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (r: 'finished' | 'aborted') => void;
}

/**
 * Runs a program by timestamps: the clock decides which step is due, not the number of timers that fired.
 * Throttled timers (background tab) only delay the transitions. tick() can also be called from outside
 * (BLE notifications, visibilitychange).
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

  run(steps: ProgramStep[]): Promise<'finished' | 'aborted'> {
    if (this.cur) this.end(this.cur);
    return new Promise(resolve => {
      const st: RunState = { steps, phase: 'starting', t0: null, index: -1, timer: null, resolve };
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
    const elapsed = nowMs - st.t0;
    let acc = 0, idx = -1, stepEnd = 0;
    for (let i = 0; i < st.steps.length; i++) {
      const end = acc + st.steps[i]!.sec * 1000;
      if (elapsed < end) { idx = i; stepEnd = end; break; }
      acc = end;
    }
    this.logSkipped(st, idx === -1 ? st.steps.length : idx);
    if (idx === -1) { this.finish(st); return; }

    const step = st.steps[idx]!;
    if (idx !== st.index) {
      st.index = idx;
      this.host.setTarget(step.speed);
    }
    const remainingMs = stepEnd - elapsed;
    const shown = this.host.currentTarget() ?? step.speed;
    const remaining = fmtTime(Math.ceil(remainingMs / 1000));
    this.host.status(() => t.program.step(idx + 1, st.steps.length, shown, remaining));
    st.timer = setTimeout(() => this.tick(), remainingMs % 1000 || 1000);
  }

  private logSkipped(st: RunState, nextIndex: number) {
    const skipped: number[] = [];
    for (let i = st.index + 1; i < nextIndex; i++) if (st.steps[i]!.sec > 0) skipped.push(i + 1);
    if (skipped.length) this.host.log?.(t.program.skipped(skipped));
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
