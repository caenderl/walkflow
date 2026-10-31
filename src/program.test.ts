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

function makeHost() {
  let target = 3;
  const calls: string[] = [];
  const host: ProgramHost = {
    start: vi.fn(async () => { calls.push('start'); }),
    stop: vi.fn(async () => { calls.push('stop'); }),
    setSpeed: vi.fn(async (kmh: number) => { target = kmh; calls.push(`speed ${kmh}`); }),
    currentTarget: () => target,
    status: vi.fn(),
  };
  return { host, calls };
}

describe('ProgramRunner', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('startet, wartet den Countdown ab und fährt die Schritte nacheinander', async () => {
    const { host, calls } = makeHost();
    const runner = new ProgramRunner(host);
    const done = runner.run([{ sec: 2, speed: 2 }, { sec: 1, speed: 4 }]);

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['start']);
    await vi.advanceTimersByTimeAsync(4499);
    expect(calls).toEqual(['start']);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['start', 'speed 2']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 4']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual(['start', 'speed 2', 'speed 4', 'stop']);
    await expect(done).resolves.toBe('finished');
    expect(runner.active).toBe(false);
  });

  it('zeigt Restzeit pro Schritt an', async () => {
    const { host } = makeHost();
    const runner = new ProgramRunner(host);
    void runner.run([{ sec: 2, speed: 2 }]);
    await vi.advanceTimersByTimeAsync(4500);
    expect(host.status).toHaveBeenLastCalledWith('Schritt 1/1: 2.0 km/h, noch 0:02');
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.status).toHaveBeenLastCalledWith('Schritt 1/1: 2.0 km/h, noch 0:01');
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.status).toHaveBeenLastCalledWith('Fertig. Band wird gestoppt.');
  });

  it('Abbruch während des Countdowns: kein Speed-Befehl, kein zusätzlicher Stop', async () => {
    const { host, calls } = makeHost();
    const runner = new ProgramRunner(host);
    const done = runner.run([{ sec: 60, speed: 3 }]);
    await vi.advanceTimersByTimeAsync(1000);
    runner.abort('Gestoppt');
    expect(host.status).toHaveBeenLastCalledWith('Gestoppt');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual(['start']);
    await expect(done).resolves.toBe('aborted');
  });

  it('Abbruch mitten im Schritt: keine weiteren Befehle', async () => {
    const { host, calls } = makeHost();
    const runner = new ProgramRunner(host);
    const done = runner.run([{ sec: 10, speed: 3 }, { sec: 10, speed: 5 }]);
    await vi.advanceTimersByTimeAsync(4500 + 3000);
    runner.abort();
    expect(host.status).toHaveBeenLastCalledWith('Programm abgebrochen');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual(['start', 'speed 3']);
    await expect(done).resolves.toBe('aborted');
  });

  it('ein neuer Lauf macht den alten wirkungslos', async () => {
    const { host, calls } = makeHost();
    const runner = new ProgramRunner(host);
    const first = runner.run([{ sec: 10, speed: 3 }]);
    await vi.advanceTimersByTimeAsync(5000);
    runner.abort();
    const second = runner.run([{ sec: 1, speed: 2 }]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toEqual(['start', 'speed 3', 'start', 'speed 2', 'stop']);
    await expect(first).resolves.toBe('aborted');
    await expect(second).resolves.toBe('finished');
  });

  it('abort ohne aktives Programm ändert den Status nicht', () => {
    const { host } = makeHost();
    new ProgramRunner(host).abort('x');
    expect(host.status).not.toHaveBeenCalled();
  });
});
