import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beltMaybeRunning, checkConsoleCommand, clampSpeed, decideLimitChange, DEFAULT_MAX_STEP, DEFAULT_SPEED_LIMIT,
  DISCLAIMER_VERSION, effectiveMax, isDisclaimerAccepted, loadLimit, parseHexBytes, parseLimit, parseMaxStep,
  planRamp, RAMP_INTERVAL_MS, serializeLimit, SpeedGovernor, StandstillDetector, type ConsoleContext,
} from './safety';

describe('Speed-Limit (Bestand)', () => {
  it('Standard-Limit ist 6 km/h', () => {
    expect(DEFAULT_SPEED_LIMIT).toBe(6);
  });

  it('effektives Maximum ist das kleinere aus Geräte-Max und eigenem Limit', () => {
    expect(effectiveMax(12, 6)).toBe(6);
    expect(effectiveMax(5, 6)).toBe(5);
  });

  it('parseLimit fällt bei ungültiger Eingabe auf 6 zurück', () => {
    expect(parseLimit('4.5')).toBe(4.5);
    expect(parseLimit('')).toBe(6);
    expect(parseLimit('abc')).toBe(6);
    expect(parseLimit('0')).toBe(6);
  });
});

describe('clampSpeed', () => {
  const range = { min: 1, max: 6 };

  it('kappt nach oben und unten', () => {
    expect(clampSpeed(9, range)).toBe(6);
    expect(clampSpeed(0.2, range)).toBe(1);
  });

  it('rundet auf 0,1 km/h', () => {
    expect(clampSpeed(3.04, range)).toBe(3);
    expect(clampSpeed(3.06, range)).toBe(3.1);
  });

  it('Rundung führt nie über das Maximum', () => {
    expect(clampSpeed(9, { min: 1, max: 5.97 })).toBe(5.9);
  });

  it('liefert nie einen Wert über dem Maximum, auch wenn das Limit unter dem Geräte-Minimum liegt', () => {
    expect(clampSpeed(3, { min: 1.5, max: 1 })).toBeNull();
  });

  it('NaN und Unendlich → null', () => {
    expect(clampSpeed(Number.NaN, range)).toBeNull();
    expect(clampSpeed(Number.POSITIVE_INFINITY, range)).toBeNull();
  });
});

describe('Limit ändern', () => {
  it('Werte bis 6 km/h ohne Bestätigung', () => {
    expect(decideLimitChange('5.5', 6)).toEqual({ ok: true, value: 5.5, needsConfirmation: false });
    expect(decideLimitChange('6', 4)).toEqual({ ok: true, value: 6, needsConfirmation: false });
  });

  it('Werte über 6 km/h brauchen Bestätigung, wenn sie das Limit erhöhen', () => {
    expect(decideLimitChange('6.5', 6)).toEqual({ ok: true, value: 6.5, needsConfirmation: true });
    expect(decideLimitChange('8', 7)).toEqual({ ok: true, value: 8, needsConfirmation: true });
  });

  it('Senken braucht nie eine Bestätigung', () => {
    expect(decideLimitChange('7', 8)).toEqual({ ok: true, value: 7, needsConfirmation: false });
  });

  it('ungültige oder unsinnige Werte werden abgelehnt', () => {
    expect(decideLimitChange('', 6).ok).toBe(false);
    expect(decideLimitChange('abc', 6).ok).toBe(false);
    expect(decideLimitChange('0.5', 6).ok).toBe(false);
    expect(decideLimitChange('25', 6).ok).toBe(false);
  });

  it('rundet auf 0,1 km/h', () => {
    expect(decideLimitChange('4.56', 6)).toMatchObject({ value: 4.6 });
  });
});

describe('gespeichertes Limit', () => {
  it('ohne gespeicherten Wert: 6 km/h', () => {
    expect(loadLimit(null, null)).toEqual({ value: 6 });
  });

  it('bestätigte Werte über 6 bleiben erhalten', () => {
    expect(loadLimit(serializeLimit(8, true), null)).toEqual({ value: 8 });
  });

  it('unbestätigte Werte über 6 werden nicht übernommen', () => {
    expect(loadLimit(serializeLimit(8, false), null).value).toBe(6);
    expect(loadLimit('{"value":9}', null).value).toBe(6);
  });

  it('Prototyp-Wert "cap" wird bis 6 km/h übernommen, darüber nicht', () => {
    expect(loadLimit(null, '5')).toEqual({ value: 5 });
    const r = loadLimit(null, '9');
    expect(r.value).toBe(6);
    expect(r.note).toMatch(/nicht übernommen/);
  });

  it('kaputte oder unsinnige Werte → 6 km/h', () => {
    expect(loadLimit('{kaputt', null).value).toBe(6);
    expect(loadLimit(serializeLimit(50, true), null).value).toBe(6);
    expect(loadLimit(null, 'abc').value).toBe(6);
  });
});

describe('maximale Änderung pro Befehl', () => {
  it('Standard 0,5 km/h, erlaubt 0,1 bis 1,0', () => {
    expect(DEFAULT_MAX_STEP).toBe(0.5);
    expect(parseMaxStep('0.3')).toBe(0.3);
    expect(parseMaxStep('0,2')).toBe(0.2);
    expect(parseMaxStep('0.05')).toBeNull();
    expect(parseMaxStep('1.5')).toBeNull();
    expect(parseMaxStep('x')).toBeNull();
  });
});

describe('planRamp', () => {
  const range = { min: 1, max: 6 };

  it('fährt große Sprünge in Stufen an', () => {
    expect(planRamp(2, 5, 0.5, range)).toEqual([2.5, 3, 3.5, 4, 4.5, 5]);
    expect(planRamp(5, 2, 0.5, range)).toEqual([4.5, 4, 3.5, 3, 2.5, 2]);
  });

  it('kleine Änderungen in einem Schritt', () => {
    expect(planRamp(2, 2.3, 0.5, range)).toEqual([2.3]);
    expect(planRamp(2, 2.5, 0.5, range)).toEqual([2.5]);
  });

  it('kein Schritt, wenn schon am Ziel', () => {
    expect(planRamp(3, 3, 0.5, range)).toEqual([]);
  });

  it('kappt das Ziel auf die Range', () => {
    expect(planRamp(5, 9, 0.5, range)).toEqual([5.5, 6]);
  });

  it('aus dem Stand: erster Schritt ist das Geräte-Minimum', () => {
    expect(planRamp(0, 2, 0.5, range)).toEqual([1, 1.5, 2]);
  });

  it('ungerader Startwert: keine Stufe größer als maxStep', () => {
    expect(planRamp(2.05, 3, 0.3, range)).toEqual([2.3, 2.6, 2.9, 3]);
  });

  it('kleine Schritte trotz Gleitkomma-Fehlern', () => {
    expect(planRamp(0.7, 1, 0.1, { min: 0.5, max: 6 })).toEqual([0.8, 0.9, 1]);
  });

  it('nie ein Befehl über dem Limit, auch nicht beim Abbremsen von oberhalb', () => {
    expect(planRamp(6, 4, 0.5, { min: 1, max: 4 })).toEqual([4]);
  });

  it('kein erlaubter Wert → keine Schritte', () => {
    expect(planRamp(2, 3, 0.5, { min: 2, max: 1 })).toEqual([]);
  });

  it('Invarianten für zufällige Eingaben', () => {
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2000; i++) {
      const r = { min: 0.5 + rnd(), max: 3 + rnd() * 10 };
      const step = Math.round((0.1 + rnd() * 0.9) * 10) / 10;
      const from = rnd() * 14;
      const to = rnd() * 14;
      const plan = planRamp(from, to, step, r);
      const target = clampSpeed(to, r)!;
      if (plan.length) expect(plan.at(-1)).toBeCloseTo(target, 9);
      let prev = from;
      plan.forEach((v, k) => {
        expect(v).toBeLessThanOrEqual(r.max + 1e-9);
        expect(v).toBeGreaterThanOrEqual(r.min - 1e-9);
        const firstFromOutside = k === 0 && (from < r.min || from > r.max);
        if (!firstFromOutside) expect(Math.abs(v - prev)).toBeLessThanOrEqual(step + 1e-9);
        prev = v;
      });
    }
  });
});

describe('SpeedGovernor', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  function make(opts: { fail?: (kmh: number) => boolean } = {}) {
    const sent: [number, number][] = [];
    const logs: string[] = [];
    const gov = new SpeedGovernor({
      send: async kmh => { sent.push([Date.now(), kmh]); return !opts.fail?.(kmh); },
      now: () => Date.now(),
      log: m => logs.push(m),
    });
    gov.setRange({ min: 1, max: 6 });
    return { gov, sent, logs };
  }

  it('Mindestabstand ist 1,5 s', () => {
    expect(RAMP_INTERVAL_MS).toBe(1500);
  });

  it('kleine Änderung geht sofort raus', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    expect(gov.request(2.5)).toBe(2.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([[0, 2.5]]);
  });

  it('großer Sprung wird in Stufen mit 1,5 s Abstand angefahren', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3], [3000, 3.5], [4500, 4]]);
    expect(gov.ramping).toBe(false);
  });

  it('schnelle +0,5-Klicks werden nicht zum Sprung', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(2.5);
    await vi.advanceTimersByTimeAsync(100);
    gov.request(3);
    await vi.advanceTimersByTimeAsync(100);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3], [3000, 3.5]]);
  });

  it('nie zwei Befehle näher als 1,5 s, auch über getrennte Anfragen', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(3);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(1000);
    gov.request(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([[0, 3.5], [1500, 3]]);
  });

  it('kappt Ziele aufs Limit', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(5.5);
    expect(gov.request(9)).toBe(6);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([[0, 6]]);
  });

  it('kein erlaubter Wert → null, nichts gesendet', async () => {
    const { gov, sent } = make();
    gov.setRange({ min: 2, max: 1 });
    expect(gov.request(3)).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([]);
  });

  it('cancel stoppt die Rampe sofort', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(5);
    await vi.advanceTimersByTimeAsync(2000);
    gov.cancel();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3]]);
    expect(gov.target).toBeNull();
    expect(gov.ramping).toBe(false);
  });

  it('Schreibfehler bricht die Rampe ab', async () => {
    const { gov, sent, logs } = make({ fail: kmh => kmh === 3 });
    gov.noteMeasured(2);
    gov.request(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([[0, 2.5], [1500, 3]]);
    expect(gov.target).toBeNull();
    expect(logs.join()).toMatch(/Rampe abgebrochen/);
  });

  it('aus dem Stand beginnt die Rampe am Geräte-Minimum', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(0);
    gov.request(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([1, 1.5, 2]);
  });

  it('ohne Messwert und ohne letzten Befehl: Basis ist das Geräte-Minimum', async () => {
    const { gov, sent } = make();
    gov.request(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([1.5, 2]);
  });

  it('Basis ist der letzte Befehl, solange das Band nachregelt', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(2.5);
    await vi.advanceTimersByTimeAsync(2000);
    gov.noteMeasured(2.1); // Band hat 2,5 noch nicht erreicht
    gov.request(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.map(s => s[1])).toEqual([2.5, 3]);
  });

  it('Basis ist der Messwert, wenn das Band deutlich anders läuft (z. B. per Fernbedienung geändert)', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(2.5);
    await vi.advanceTimersByTimeAsync(10_000);
    gov.noteMeasured(4); // jemand hat am Band auf 4 gestellt
    gov.request(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([2.5, 4.5, 5]);
  });

  it('Limit senken unter den letzten Befehl regelt aktiv auf das neue Limit', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(5);
    gov.request(5);
    await vi.advanceTimersByTimeAsync(10_000);
    gov.setRange({ min: 1, max: 4 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([5, 4]);
    expect(gov.target).toBe(4);
  });

  it('Limit senken während einer Rampe kappt das Ziel', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(2);
    gov.request(6);
    await vi.advanceTimersByTimeAsync(1600);
    gov.setRange({ min: 1, max: 3.5 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent.map(s => s[1])).toEqual([2.5, 3, 3.5]);
  });

  it('reset vergisst den letzten Befehl (nach Stop/Disconnect)', async () => {
    const { gov, sent } = make();
    gov.noteMeasured(3);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(100);
    gov.reset();
    expect(gov.lastCommand).toBeNull();
    gov.request(2);
    await vi.advanceTimersByTimeAsync(10_000);
    // nach reset: kein Mindestabstand-Bezug mehr, Basis = Geräte-Minimum
    expect(sent.map(s => s[1])).toEqual([3.5, 1.5, 2]);
  });

  it('externer Befehl (Konsole) wird als Basis und für den Mindestabstand berücksichtigt', async () => {
    const { gov, sent } = make();
    gov.noteExternalCommand(3);
    expect(gov.msSinceLastCommand()).toBe(0);
    gov.request(3.5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([[1500, 3.5]]);
  });

  it('maxStep ist einstellbar', async () => {
    const { gov, sent } = make();
    gov.maxStep = 1;
    gov.noteMeasured(2);
    gov.request(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map(s => s[1])).toEqual([3, 4]);
  });
});

describe('Experimentier-Konsole', () => {
  const ctx: ConsoleContext = { maxKmh: 6, maxStep: 0.5, baseKmh: 3, msSinceLastSpeedCommand: 10_000 };
  const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

  it('parst Hex-Bytes mit Leerzeichen oder Kommas', () => {
    expect(parseHexBytes('02 2C 01')).toEqual([0x02, 0x2c, 0x01]);
    expect(parseHexBytes(' 08,01 ')).toEqual([0x08, 0x01]);
  });

  it('lehnt alles ab, was kein sauberes Hex-Byte ist', () => {
    expect(parseHexBytes('')).toBeNull();
    expect(parseHexBytes('zz')).toBeNull();
    expect(parseHexBytes('100')).toBeNull();
    expect(parseHexBytes('2z')).toBeNull(); // parseInt würde hier 2 liefern
  });

  it('blockt Set-Speed über dem Limit', () => {
    const c = { ...ctx, baseKmh: 5.8 };
    expect(checkConsoleCommand([0x02, ...le16(600)], c)).toEqual({ action: 'send', setSpeed: 6 });
    expect(checkConsoleCommand([0x02, ...le16(601)], c).action).toBe('block');
  });

  it('blockt Set-Speed mit falscher Länge', () => {
    expect(checkConsoleCommand([0x02, 0x2c], ctx).action).toBe('block');
    expect(checkConsoleCommand([0x02, 0x2c, 0x01, 0x00], ctx).action).toBe('block');
  });

  it('blockt Set-Speed-Sprünge über der maximalen Änderung', () => {
    expect(checkConsoleCommand([0x02, ...le16(350)], ctx).action).toBe('send');
    expect(checkConsoleCommand([0x02, ...le16(360)], ctx).action).toBe('block');
    expect(checkConsoleCommand([0x02, ...le16(240)], ctx).action).toBe('block');
  });

  it('blockt Set-Speed innerhalb des Mindestabstands', () => {
    expect(checkConsoleCommand([0x02, ...le16(320)], { ...ctx, msSinceLastSpeedCommand: 1000 }).action).toBe('block');
  });

  it('Start nur mit Bestätigung', () => {
    expect(checkConsoleCommand([0x07], ctx)).toEqual({ action: 'confirm-start' });
  });

  it('blockt Set Target Heart Rate (das Band würde den Speed selbst regeln)', () => {
    expect(checkConsoleCommand([0x06, 120], ctx).action).toBe('block');
  });

  it('lässt andere Befehle roh durch', () => {
    expect(checkConsoleCommand([0x08, 0x01], ctx)).toEqual({ action: 'send' });
    expect(checkConsoleCommand([0x03, 0x32, 0x00], ctx)).toEqual({ action: 'send' });
    expect(checkConsoleCommand([0x00], ctx)).toEqual({ action: 'send' });
  });
});

describe('Band läuft möglicherweise', () => {
  it('nach Start durch die App', () => {
    expect(beltMaybeRunning({ startedByApp: true, lastMeasuredKmh: undefined })).toBe(true);
  });

  it('wenn der letzte Messwert > 0 war, egal wie alt', () => {
    expect(beltMaybeRunning({ startedByApp: false, lastMeasuredKmh: 1.2 })).toBe(true);
  });

  it('nur wenn beides dagegen spricht: nein', () => {
    expect(beltMaybeRunning({ startedByApp: false, lastMeasuredKmh: 0 })).toBe(false);
    expect(beltMaybeRunning({ startedByApp: false, lastMeasuredKmh: undefined })).toBe(false);
  });
});

describe('StandstillDetector', () => {
  it('meldet Stillstand nach 8 s mit 0 km/h, sobald scharf geschaltet', () => {
    const d = new StandstillDetector();
    d.arm();
    expect(d.feed(0, 0)).toBe(false);
    expect(d.feed(0, 7999)).toBe(false);
    expect(d.feed(0, 8000)).toBe(true);
    expect(d.feed(0, 9000)).toBe(false); // nur einmal
  });

  it('Bewegung setzt den Zähler zurück', () => {
    const d = new StandstillDetector();
    d.arm();
    d.feed(0, 0);
    d.feed(1, 5000);
    expect(d.feed(0, 9000)).toBe(false);
    expect(d.feed(0, 17_000)).toBe(true);
  });

  it('erneutes arm() (nächster Programmschritt) setzt den Zähler nicht zurück', () => {
    const d = new StandstillDetector();
    d.arm();
    d.feed(0, 0);
    d.arm();
    expect(d.feed(0, 8000)).toBe(true);
  });

  it('nicht scharf → nie', () => {
    const d = new StandstillDetector();
    expect(d.feed(0, 0)).toBe(false);
    expect(d.feed(0, 60_000)).toBe(false);
  });
});

describe('Erststart-Hinweis', () => {
  it('gilt nur für die aktuelle Version', () => {
    expect(isDisclaimerAccepted(String(DISCLAIMER_VERSION))).toBe(true);
    expect(isDisclaimerAccepted(String(DISCLAIMER_VERSION - 1))).toBe(false);
    expect(isDisclaimerAccepted(null)).toBe(false);
    expect(isDisclaimerAccepted('ja')).toBe(false);
  });
});
