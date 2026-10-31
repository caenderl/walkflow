// Intervall-Programm: Parser und Runner. Der Runner kennt weder DOM noch BLE,
// sondern spricht über ProgramHost mit der App.

export interface ProgramStep {
  sec: number;
  speed: number;
}

/** Pro Zeile "Minuten km/h", Dezimalpunkt oder -komma. Nicht lesbare Zeilen werden ignoriert. */
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
  /** Request Control + Start. false = fehlgeschlagen. */
  start(): Promise<boolean>;
  stop(): Promise<unknown>;
  /** Neues Ziel; die App fährt es über die Rampe an und kappt auf das Limit. */
  setTarget(kmh: number): void;
  /** Aktuelles Ziel nach Kappung, für die Anzeige. */
  currentTarget(): number | null;
  status(text: string): void;
  log?(msg: string): void;
}

export interface ProgramOptions {
  /** Wartezeit nach Start wegen des Band-Countdowns (Annahme, nicht gemessen). */
  countdownMs?: number;
  /** Monotone Uhr in ms */
  now?: () => number;
}

export const COUNTDOWN_MS = 4500;

export type ProgramPhase = 'idle' | 'starting' | 'countdown' | 'running';

interface RunState {
  steps: ProgramStep[];
  phase: Exclude<ProgramPhase, 'idle'>;
  /** Programmbeginn nach dem Countdown, null solange der Start noch läuft */
  t0: number | null;
  index: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (r: 'finished' | 'aborted') => void;
}

/**
 * Fährt ein Programm anhand von Zeitstempeln: Welcher Schritt dran ist, ergibt sich aus der Uhr,
 * nicht aus der Zahl abgelaufener Timer. Gedrosselte Timer (Hintergrund-Tab) verzögern nur die
 * Übergänge. tick() kann zusätzlich von außen kommen (BLE-Notifications, visibilitychange).
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

  abort(msg?: string) {
    const st = this.cur;
    if (!st) return;
    this.end(st);
    this.host.status(msg || 'Programm abgebrochen');
  }

  run(steps: ProgramStep[]): Promise<'finished' | 'aborted'> {
    if (this.cur) this.end(this.cur);
    return new Promise(resolve => {
      const st: RunState = { steps, phase: 'starting', t0: null, index: -1, timer: null, resolve };
      this.cur = st;
      this.host.status('Band startet…');
      void this.host.start().catch(() => false).then(ok => {
        if (this.cur !== st) return;
        if (!ok) { this.abort('Start fehlgeschlagen, Programm beendet'); return; }
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
    const t = this.now();
    if (t < st.t0) {
      st.timer = setTimeout(() => this.tick(), st.t0 - t);
      return;
    }
    st.phase = 'running';
    const elapsed = t - st.t0;
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
    this.host.status(`Schritt ${idx + 1}/${st.steps.length}: ${shown.toFixed(1)} km/h, noch ${fmtTime(Math.ceil(remainingMs / 1000))}`);
    st.timer = setTimeout(() => this.tick(), remainingMs % 1000 || 1000);
  }

  private logSkipped(st: RunState, nextIndex: number) {
    const skipped: number[] = [];
    for (let i = st.index + 1; i < nextIndex; i++) if (st.steps[i]!.sec > 0) skipped.push(i + 1);
    if (skipped.length) this.host.log?.(`⚠ Schritt ${skipped.join(', ')} übersprungen (Timer verzögert, z. B. Tab im Hintergrund)`);
  }

  private finish(st: RunState) {
    st.index = st.steps.length;
    this.end(st, false);
    this.host.status('Fertig. Band wird gestoppt.');
    void this.host.stop().catch(() => undefined).then(() => st.resolve('finished'));
  }

  private end(st: RunState, resolveAborted = true) {
    if (st.timer !== null) clearTimeout(st.timer);
    st.timer = null;
    if (this.cur === st) this.cur = null;
    if (resolveAborted) st.resolve('aborted');
  }
}
