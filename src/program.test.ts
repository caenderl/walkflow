import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtTime, parseProgram, ProgramRunner, totalSeconds, type ProgramHost } from './program';

describe('parseProgram', () => {
  it('liest Zeilen "Minuten km/h"', () => {
    expect(parseProgram('2 2.0\n3 3.5\n1 5')).toEqual([
      { sec: 120, speed: 2 }, { sec: 180, speed: 3.5 }, { sec: 60, speed: 5 },
    ]);
  });

  it('akzeptiert Dezimalkomma und Tabs, ignoriert Müllzeilen', () => {
    expect(parseProgram('0,5\t3,5\n# Kommentar\n\n  1.25 4 Rest wird ignoriert')).toEqual([
      { sec: 30, speed: 3.5 }, { sec: 75, speed: 4 },
    ]);
  });

  it('leerer Text → leeres Programm', () => {
    expect(parseProgram('')).toEqual([]);
  });

  it('Gesamtdauer und Zeitformat', () => {
    expect(totalSeconds(parseProgram('2 2\n3 3'))).toBe(300);
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(600)).toBe('10:00');
  });
});

/** Uhr getrennt von den Timern, damit sich verzögerte Timer (Hintergrund-Tab) simulieren lassen. */
function setup(opts: { startOk?: boolean } = {}) {
  let offset = 0;
  let target: number | null = null;
  const calls: string[] = [];
  const logs: string[] = [];
  const host: ProgramHost = {
    start: vi.fn(async () => { calls.push('start'); return opts.startOk ?? true; }),
    stop: vi.fn(async () => { calls.push('stop'); }),
    setTarget: vi.fn((kmh: number) => { target = kmh; calls.push(`speed ${kmh}`); }),
    currentTarget: () => target,
    status: vi.fn(),
    log: m => logs.push(m),
  };
  const runner = new ProgramRunner(host, { now: () => Date.now() + offset });
  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  /** Uhr springt, ohne dass Timer feuern (gedrosselter Tab). */
  const jump = (ms: number) => { offset += ms; };
  return { host, runner, calls, logs, advance, jump };
}

describe('ProgramRunner', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('startet, wartet den Countdown ab und fährt die Schritte nacheinander', async () => {
    const { runner, calls, advance } = setup();
    const done = runner.run([{ sec: 2, speed: 2 }, { sec: 1, speed: 4 }]);

    await advance(0);
    expect(calls).toEqual(['start']);
    await advance(4499);
    expect(calls).toEqual(['start']);
    await advance(1);
    expect(calls).toEqual(['start', 'speed 2']);
    await advance(2000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 4']);
    await advance(1000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 4', 'stop']);
    await expect(done).resolves.toBe('finished');
    expect(runner.active).toBe(false);
  });

  it('zeigt Restzeit pro Schritt an', async () => {
    const { host, runner, advance } = setup();
    void runner.run([{ sec: 2, speed: 2 }]);
    await advance(0);
    expect(host.status).toHaveBeenLastCalledWith('Band startet…');
    await advance(4500);
    expect(host.status).toHaveBeenLastCalledWith('Schritt 1/1: 2.0 km/h, noch 0:02');
    await advance(1000);
    expect(host.status).toHaveBeenLastCalledWith('Schritt 1/1: 2.0 km/h, noch 0:01');
    await advance(1000);
    expect(host.status).toHaveBeenLastCalledWith('Fertig. Band wird gestoppt.');
  });

  it('Abbruch während des Countdowns: kein Speed-Befehl, kein zusätzlicher Stop', async () => {
    const { host, runner, calls, advance } = setup();
    const done = runner.run([{ sec: 60, speed: 3 }]);
    await advance(1000);
    runner.abort('Gestoppt');
    expect(host.status).toHaveBeenLastCalledWith('Gestoppt');
    await advance(10_000);
    expect(calls).toEqual(['start']);
    await expect(done).resolves.toBe('aborted');
  });

  it('Abbruch mitten im Schritt: keine weiteren Befehle, auch nicht durch externe Ticks', async () => {
    const { host, runner, calls, advance } = setup();
    const done = runner.run([{ sec: 10, speed: 3 }, { sec: 10, speed: 5 }]);
    await advance(4500 + 3000);
    runner.abort();
    expect(host.status).toHaveBeenLastCalledWith('Programm abgebrochen');
    await advance(60_000);
    runner.tick();
    expect(calls).toEqual(['start', 'speed 3']);
    await expect(done).resolves.toBe('aborted');
  });

  it('Abbruch während host.start() noch läuft', async () => {
    const { host, runner, calls, advance } = setup();
    let release!: () => void;
    host.start = vi.fn(() => new Promise<boolean>(r => { release = () => r(true); }));
    const done = runner.run([{ sec: 10, speed: 3 }]);
    runner.abort();
    release();
    await advance(20_000);
    expect(calls).toEqual([]);
    await expect(done).resolves.toBe('aborted');
  });

  it('Start fehlgeschlagen → Programm endet ohne Speed-Befehl', async () => {
    const { host, runner, calls, advance } = setup({ startOk: false });
    const done = runner.run([{ sec: 10, speed: 3 }]);
    await advance(20_000);
    expect(calls).toEqual(['start']);
    expect(host.status).toHaveBeenLastCalledWith('Start fehlgeschlagen, Programm beendet');
    await expect(done).resolves.toBe('aborted');
  });

  it('ein neuer Lauf macht den alten wirkungslos', async () => {
    const { runner, calls, advance } = setup();
    const first = runner.run([{ sec: 10, speed: 3 }]);
    await advance(5000);
    const second = runner.run([{ sec: 1, speed: 2 }]);
    await advance(20_000);
    expect(calls).toEqual(['start', 'speed 3', 'start', 'speed 2', 'stop']);
    await expect(first).resolves.toBe('aborted');
    await expect(second).resolves.toBe('finished');
  });

  it('abort ohne aktives Programm ändert den Status nicht', () => {
    const { host, runner } = setup();
    runner.abort('x');
    expect(host.status).not.toHaveBeenCalled();
  });

  it('verzögerte Timer: springt beim nächsten Tick in den richtigen Schritt und loggt Übersprungenes', async () => {
    const { runner, calls, logs, advance, jump } = setup();
    void runner.run([{ sec: 10, speed: 2 }, { sec: 10, speed: 3 }, { sec: 10, speed: 4 }, { sec: 10, speed: 5 }]);
    await advance(4500);
    expect(calls).toEqual(['start', 'speed 2']);
    jump(25_000); // 25 s ohne Timer, z. B. Hintergrund-Tab
    runner.tick(); // z. B. durch eine BLE-Notification
    expect(calls).toEqual(['start', 'speed 2', 'speed 4']);
    expect(logs.join('\n')).toMatch(/Schritt 2 übersprungen/);
  });

  it('verzögerte Timer über das Programmende hinaus: stoppt sofort', async () => {
    const { runner, calls, advance, jump } = setup();
    const done = runner.run([{ sec: 10, speed: 2 }, { sec: 10, speed: 3 }]);
    await advance(4500);
    jump(60_000);
    runner.tick();
    await advance(0);
    expect(calls).toEqual(['start', 'speed 2', 'stop']);
    await expect(done).resolves.toBe('finished');
  });

  it('Countdown läuft auf der Uhr, nicht auf dem Timer', async () => {
    const { runner, calls, advance, jump } = setup();
    void runner.run([{ sec: 10, speed: 2 }]);
    await advance(0);
    jump(4600);
    runner.tick();
    expect(calls).toEqual(['start', 'speed 2']);
  });

  it('externe Ticks schicken keine doppelten Befehle', async () => {
    const { runner, calls, advance } = setup();
    void runner.run([{ sec: 10, speed: 2 }]);
    await advance(4500);
    runner.tick(); runner.tick();
    await advance(500);
    runner.tick();
    expect(calls).toEqual(['start', 'speed 2']);
  });

  it('Schritte mit 0 Minuten werden still übersprungen', async () => {
    const { runner, calls, logs, advance } = setup();
    void runner.run([{ sec: 0, speed: 5 }, { sec: 2, speed: 2 }]);
    await advance(4500);
    expect(calls).toEqual(['start', 'speed 2']);
    expect(logs).toEqual([]);
  });

  it('meldet Phase und aktuellen Schritt', async () => {
    const { runner, advance } = setup();
    expect(runner.phase).toBe('idle');
    void runner.run([{ sec: 2, speed: 2 }]);
    await advance(0);
    expect(runner.phase).toBe('countdown');
    await advance(4500);
    expect(runner.phase).toBe('running');
    expect(runner.stepIndex).toBe(0);
  });
});
