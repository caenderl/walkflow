import { describe, expect, it } from 'vitest';
import {
  cmdPause, cmdRequestControl, cmdSetInclination, cmdSetSpeed, cmdStart, cmdStop, dataView,
  decodeSetSpeed, describeControlPointResponse, hex, parseControlPointResponse, parseFeatures,
  parseHeartRate, parseInclinationRange, parseSpeedRange, parseTreadmillData, toBytes,
} from './ftms';

const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

describe('Treadmill Data', () => {
  it('liest Instantaneous Speed, wenn Bit 0 = 0 ist', () => {
    expect(parseTreadmillData(dataView([0x00, 0x00, 0x2c, 0x01]))).toEqual({ speed: 3 });
  });

  it('hat keinen Speed, wenn Bit 0 = 1 ist', () => {
    expect(parseTreadmillData(dataView([0x01, 0x00]))).toEqual({});
  });

  it('liest alle Felder bis Elapsed Time in der richtigen Reihenfolge', () => {
    const flags = 0x07fe; // Bit 1..10, Bit 0 = 0 → Speed vorhanden
    const bytes = [
      ...le16(flags),
      ...le16(350), // speed 3,50
      ...le16(320), // avg speed 3,20
      0x10, 0x27, 0x00, // dist 10000 m
      ...le16(25), ...le16(0xfffb), // incl 2,5 %, ramp -0,5°
      ...le16(123), ...le16(4), // elevation +12,3 / -0,4 m
      12, 11, // pace, avg pace
      ...le16(87), ...le16(300), 5, // kcal, kcal/h, kcal/min
      98, // hr
      34, // MET 3,4
      ...le16(754), // time
    ];
    expect(parseTreadmillData(dataView(bytes))).toEqual({
      speed: 3.5, avgSpeed: 3.2, dist: 10000, incl: 2.5, rampAngle: -0.5,
      elevationGainPos: 12.3, elevationGainNeg: 0.4, pace: 1.2, avgPace: 1.1,
      kcal: 87, kcalPerHour: 300, kcalPerMin: 5, hr: 98, met: 3.4, time: 754,
    });
  });

  it('überspringt nicht gesetzte Felder korrekt (Speed, Distanz, Energie, Zeit)', () => {
    const flags = 0x0004 | 0x0080 | 0x0400;
    const bytes = [...le16(flags), ...le16(410), 0xe8, 0x03, 0x00, ...le16(12), ...le16(0xffff), 0xff, ...le16(60)];
    expect(parseTreadmillData(dataView(bytes))).toEqual({ speed: 4.1, dist: 1000, kcal: 12, time: 60 });
  });

  it('negative Steigung', () => {
    const bytes = [...le16(0x0009), ...le16(0xfff6), 0, 0];
    expect(parseTreadmillData(dataView(bytes))).toEqual({ incl: -1, rampAngle: 0 });
  });

  it('kcal 0xFFFF bedeutet: kein Wert', () => {
    const bytes = [...le16(0x0081), ...le16(0xffff), ...le16(0xffff), 0xff];
    expect(parseTreadmillData(dataView(bytes))).toEqual({});
  });

  it('liefert Puls 0 durch (UI entscheidet, ob er angezeigt wird)', () => {
    expect(parseTreadmillData(dataView([...le16(0x0101), 0]))).toEqual({ hr: 0 });
  });

  it('behält bei abgeschnittenem Paket die schon gelesenen Felder', () => {
    const bytes = [...le16(0x0404), ...le16(250), 0x64, 0x00, 0x00, 0x05]; // Zeit fehlt halb
    expect(parseTreadmillData(dataView(bytes))).toEqual({ speed: 2.5, dist: 100 });
  });

  it('wirft nie, auch nicht bei leerem Paket', () => {
    expect(parseTreadmillData(dataView([]))).toEqual({});
    expect(parseTreadmillData(dataView([0x00]))).toEqual({});
  });
});

describe('Heart Rate Measurement', () => {
  it('uint8-Format', () => expect(parseHeartRate(dataView([0x00, 72]))).toBe(72));
  it('uint16-Format', () => expect(parseHeartRate(dataView([0x01, 0x2c, 0x01]))).toBe(300));
});

describe('Feature und Ranges', () => {
  it('Feature-Bits', () => {
    const f = parseFeatures(dataView([0x0c, 0x14, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00]));
    expect(f.machineNames).toEqual(['Total Distance', 'Inclination', 'Heart Rate', 'Elapsed Time']);
    expect(f.targetNames).toEqual(['Speed', 'Inclination']);
  });

  it('Speed Range', () => {
    expect(parseSpeedRange(dataView([...le16(100), ...le16(600), ...le16(10)]))).toEqual({ min: 1, max: 6, step: 0.1 });
  });

  it('Inclination Range mit negativem Minimum', () => {
    expect(parseInclinationRange(dataView([...le16(0xffec), ...le16(150), ...le16(5)]))).toEqual({ min: -2, max: 15, step: 0.5 });
  });
});

describe('Control-Point-Befehle', () => {
  it('Request Control, Start, Stop, Pause', () => {
    expect(toBytes(cmdRequestControl())).toEqual([0x00]);
    expect(toBytes(cmdStart())).toEqual([0x07]);
    expect(toBytes(cmdStop())).toEqual([0x08, 0x01]);
    expect(toBytes(cmdPause())).toEqual([0x08, 0x02]);
  });

  it('Set Speed 3,0 km/h = 02 2C 01', () => {
    expect(hex(cmdSetSpeed(3))).toBe('02 2c 01');
  });

  it('Set Speed rundet auf 0,01 km/h', () => {
    expect(toBytes(cmdSetSpeed(4.3))).toEqual([0x02, ...le16(430)]);
    expect(toBytes(cmdSetSpeed(0.1 + 0.2))).toEqual([0x02, ...le16(30)]);
  });

  it('Set Speed lehnt Werte außerhalb uint16 ab', () => {
    expect(() => cmdSetSpeed(-1)).toThrow(RangeError);
    expect(() => cmdSetSpeed(700)).toThrow(RangeError);
    expect(() => cmdSetSpeed(Number.NaN)).toThrow(RangeError);
  });

  it('Set Inclination als sint16 in 0,1 %', () => {
    expect(toBytes(cmdSetInclination(5))).toEqual([0x03, ...le16(50)]);
    expect(toBytes(cmdSetInclination(-1.5))).toEqual([0x03, ...le16(0xfff1)]);
  });

  it('decodeSetSpeed', () => {
    expect(decodeSetSpeed([0x02, 0x2c, 0x01])).toBe(3);
    expect(decodeSetSpeed([0x02, 0x2c])).toBeNull();
    expect(decodeSetSpeed([0x07])).toBeNull();
  });
});

describe('Control-Point-Antworten', () => {
  it('80 <op> <result>', () => {
    const r = parseControlPointResponse(dataView([0x80, 0x02, 0x01]));
    expect(r).toEqual({ requestOp: 2, result: 1 });
    expect(describeControlPointResponse(r!)).toBe('Set Speed: OK');
  });

  it('unbekannter Opcode und Result', () => {
    expect(describeControlPointResponse({ requestOp: 0x11, result: 9 })).toBe('0x11: 9');
    expect(describeControlPointResponse({ requestOp: 0x03, result: 2 })).toBe('Set Inclination: nicht unterstützt');
  });

  it('kein Response-Paket → null', () => {
    expect(parseControlPointResponse(dataView([0x07]))).toBeNull();
    expect(parseControlPointResponse(dataView([0x80, 0x02]))).toBeNull();
  });
});
