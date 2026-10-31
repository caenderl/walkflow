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
  /** Request Control + Start */
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  /** Setzt das Ziel (die App kappt auf Limit). */
  setSpeed(kmh: number): Promise<unknown>;
  /** Aktuelles Ziel nach Kappung, für die Anzeige. */
  currentTarget(): number;
  status(text: string): void;
}

export interface ProgramOptions {
  /** Wartezeit nach Start wegen des Band-Countdowns (Annahme, nicht gemessen). */
  countdownMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const COUNTDOWN_MS = 4500;

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class ProgramRunner {
  private activeId = 0;
  private counter = 0;
  private readonly countdownMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly host: ProgramHost, opts: ProgramOptions = {}) {
    this.countdownMs = opts.countdownMs ?? COUNTDOWN_MS;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  get active() { return this.activeId !== 0; }

  abort(msg?: string) {
    if (this.activeId) {
      this.activeId = 0;
      this.host.status(msg || 'Programm abgebrochen');
    }
  }

  async run(steps: ProgramStep[]): Promise<'finished' | 'aborted'> {
    const { host } = this;
    const id = ++this.counter;
    this.activeId = id;
    host.status('Band startet…');
    await host.start();
    await this.sleep(this.countdownMs);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      if (this.activeId !== id) return 'aborted';
      await host.setSpeed(step.speed);
      for (let r = step.sec; r > 0; r--) {
        if (this.activeId !== id) return 'aborted';
        host.status(`Schritt ${i + 1}/${steps.length}: ${host.currentTarget().toFixed(1)} km/h, noch ${fmtTime(r)}`);
        await this.sleep(1000);
      }
    }
    if (this.activeId !== id) return 'aborted';
    this.activeId = 0;
    host.status('Fertig. Band wird gestoppt.');
    await host.stop();
    return 'finished';
  }
}
