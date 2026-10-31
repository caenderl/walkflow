import { describe, expect, it } from 'vitest';
import { buildTcx, exportFilename, toCsv, type Sample } from './export';

const T0 = Date.UTC(2026, 9, 31, 9, 0, 0);
const s = (sec: number, f: Omit<Sample, 'ts'>): Sample => ({ ts: T0 + sec * 1000, ...f });

/** Text aller Vorkommen eines Elements */
const all = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(m => m[1]!);
const one = (xml: string, tag: string) => all(xml, tag)[0];

describe('CSV', () => {
  it('Format wie im Prototyp', () => {
    const csv = toCsv([s(0, { speed: 3, dist: 0 }), s(1, { speed: 3.1, dist: 1, incl: 0, hr: 90, kcal: 2 })]);
    expect(csv).toBe('zeit_s,speed_kmh,dist_m,incl_pct,puls,kcal\n0,3,0,,,\n1,3.1,1,0,90,2');
  });

  it('Dateiname', () => {
    expect(exportFilename(new Date(T0), 'tcx')).toBe('laufband-2026-10-31T09-00.tcx');
  });
});

describe('TCX', () => {
  it('ohne Bewegung kein Export', () => {
    expect(buildTcx([], { sport: 'Running' })).toBeNull();
    expect(buildTcx([s(0, { speed: 0 }), s(1, { speed: 0 })], { sport: 'Running' })).toBeNull();
  });

  it('Grundstruktur, Zeiten, Sportart', () => {
    const xml = buildTcx([s(0, { speed: 3.6, dist: 0 }), s(10, { speed: 3.6, dist: 10 })], { sport: 'Other' })!;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"');
    expect(xml).toContain('<Activity Sport="Other">');
    expect(one(xml, 'Id')).toBe('2026-10-31T09:00:00Z');
    expect(xml).toContain('<Lap StartTime="2026-10-31T09:00:00Z">');
    expect(one(xml, 'TotalTimeSeconds')).toBe('10');
    expect(all(xml, 'Time')).toEqual(['2026-10-31T09:00:00Z', '2026-10-31T09:00:10Z']);
  });

  it('Elementreihenfolge im Lap und Trackpoint nach Schema', () => {
    const xml = buildTcx([s(0, { speed: 3.6, dist: 0, hr: 100, kcal: 1 }), s(5, { speed: 3.6, dist: 5, hr: 110, kcal: 2 })], { sport: 'Running' })!;
    const order = ['<TotalTimeSeconds>', '<DistanceMeters>', '<MaximumSpeed>', '<Calories>', '<AverageHeartRateBpm>',
      '<MaximumHeartRateBpm>', '<Intensity>', '<TriggerMethod>', '<Track>'];
    const idx = order.map(t => xml.indexOf(t));
    expect(idx.every(i => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const tp = xml.slice(xml.indexOf('<Trackpoint>'), xml.indexOf('</Trackpoint>'));
    const tpOrder = ['<Time>', '<DistanceMeters>', '<HeartRateBpm>', '<Extensions>'].map(t => tp.indexOf(t));
    expect([...tpOrder].sort((a, b) => a - b)).toEqual(tpOrder);
  });

  it('Speed in m/s, Durchschnitt und Maximum', () => {
    const xml = buildTcx([s(0, { speed: 3.6, dist: 0 }), s(10, { speed: 7.2, dist: 15 })], { sport: 'Running' })!;
    expect(all(xml, 'ns3:Speed')).toEqual(['1', '2']);
    expect(one(xml, 'MaximumSpeed')).toBe('2');
    expect(one(xml, 'ns3:AvgSpeed')).toBe('1.5');
  });

  it('schneidet Stillstand am Anfang und Ende ab, behält Pausen in der Mitte', () => {
    const xml = buildTcx([
      s(0, { speed: 0, dist: 0 }), s(1, { speed: 0, dist: 0 }),
      s(2, { speed: 3, dist: 0 }), s(3, { speed: 0, dist: 1 }), s(4, { speed: 3, dist: 1 }),
      s(5, { speed: 0, dist: 2 }), s(6, { speed: 0, dist: 2 }),
    ], { sport: 'Running' })!;
    expect(all(xml, 'Time')).toEqual(['2026-10-31T09:00:02Z', '2026-10-31T09:00:03Z', '2026-10-31T09:00:04Z']);
  });

  it('Distanz bleibt monoton, auch wenn das Band zwischendurch zurückgesetzt wird', () => {
    const xml = buildTcx([
      s(0, { speed: 3, dist: 100 }), s(1, { speed: 3, dist: 200 }), s(2, { speed: 3, dist: 5 }), s(3, { speed: 3, dist: 50 }),
    ], { sport: 'Running' })!;
    const d = all(xml, 'DistanceMeters').slice(1).map(Number); // erstes = Lap-Summe
    expect(d).toEqual([0, 100, 105, 150]);
    expect(one(xml, 'DistanceMeters')).toBe('150');
  });

  it('ohne Distanz vom Band: aus dem Speed integriert', () => {
    const xml = buildTcx([s(0, { speed: 3.6 }), s(10, { speed: 3.6 }), s(20, { speed: 3.6 })], { sport: 'Running' })!;
    expect(all(xml, 'DistanceMeters').slice(1).map(Number)).toEqual([0, 10, 20]);
  });

  it('Puls nur, wenn > 0', () => {
    const xml = buildTcx([s(0, { speed: 3, dist: 0, hr: 0 }), s(1, { speed: 3, dist: 1, hr: 120 }), s(2, { speed: 3, dist: 2 })], { sport: 'Running' })!;
    expect(xml.match(/<HeartRateBpm>/g)?.length).toBe(1);
    expect(xml).toContain('<AverageHeartRateBpm><Value>120</Value></AverageHeartRateBpm>');
  });

  it('ohne Puls keine Puls-Elemente', () => {
    const xml = buildTcx([s(0, { speed: 3, dist: 0 }), s(1, { speed: 3, dist: 1 })], { sport: 'Running' })!;
    expect(xml).not.toContain('HeartRate');
  });

  it('Kalorien mit Reset aufsummiert, ohne Wert 0', () => {
    const a = buildTcx([s(0, { speed: 3, kcal: 10 }), s(1, { speed: 3, kcal: 20 }), s(2, { speed: 3, kcal: 3 })], { sport: 'Running' })!;
    expect(one(a, 'Calories')).toBe('13');
    const b = buildTcx([s(0, { speed: 3 }), s(1, { speed: 3 })], { sport: 'Running' })!;
    expect(one(b, 'Calories')).toBe('0');
  });
});
