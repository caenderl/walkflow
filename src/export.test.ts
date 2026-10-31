import { describe, expect, it } from 'vitest';
import { buildTcx, exportFilename, toCsv, type Sample, type TcxSport } from './export';

const T0 = Date.UTC(2026, 9, 31, 9, 0, 0);
const s = (sec: number, f: Omit<Sample, 'ts'>): Sample => ({ ts: T0 + sec * 1000, ...f });
const tcx = (samples: Sample[], sport: TcxSport = 'Running', notes = 'Treadmill') => buildTcx(samples, { sport, notes });

/** Text of all occurrences of an element */
const all = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(m => m[1]!);
const one = (xml: string, tag: string) => all(xml, tag)[0];

describe('CSV', () => {
  it('has English column names and the prototype’s value format', () => {
    const csv = toCsv([s(0, { speed: 3, dist: 0 }), s(1, { speed: 3.1, dist: 1, incl: 0, hr: 90, kcal: 2 })]);
    expect(csv).toBe('time_s,speed_kmh,dist_m,incl_pct,hr_bpm,kcal\n0,3,0,,,\n1,3.1,1,0,90,2');
  });

  it('file name', () => {
    expect(exportFilename(new Date(T0), 'tcx')).toBe('walkflow-2026-10-31T09-00.tcx');
  });
});

describe('TCX', () => {
  it('no export without movement', () => {
    expect(tcx([])).toBeNull();
    expect(tcx([s(0, { speed: 0 }), s(1, { speed: 0 })])).toBeNull();
  });

  it('basic structure, times, sport', () => {
    const xml = tcx([s(0, { speed: 3.6, dist: 0 }), s(10, { speed: 3.6, dist: 10 })], 'Other')!;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"');
    expect(xml).toContain('<Activity Sport="Other">');
    expect(one(xml, 'Id')).toBe('2026-10-31T09:00:00Z');
    expect(xml).toContain('<Lap StartTime="2026-10-31T09:00:00Z">');
    expect(one(xml, 'TotalTimeSeconds')).toBe('10');
    expect(all(xml, 'Time')).toEqual(['2026-10-31T09:00:00Z', '2026-10-31T09:00:10Z']);
  });

  it('element order in Lap and Trackpoint follows the schema', () => {
    const xml = tcx([s(0, { speed: 3.6, dist: 0, hr: 100, kcal: 1 }), s(5, { speed: 3.6, dist: 5, hr: 110, kcal: 2 })])!;
    const order = ['<TotalTimeSeconds>', '<DistanceMeters>', '<MaximumSpeed>', '<Calories>', '<AverageHeartRateBpm>',
      '<MaximumHeartRateBpm>', '<Intensity>', '<TriggerMethod>', '<Track>'];
    const idx = order.map(tag => xml.indexOf(tag));
    expect(idx.every(i => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const tp = xml.slice(xml.indexOf('<Trackpoint>'), xml.indexOf('</Trackpoint>'));
    const tpOrder = ['<Time>', '<DistanceMeters>', '<HeartRateBpm>', '<Extensions>'].map(tag => tp.indexOf(tag));
    expect([...tpOrder].sort((a, b) => a - b)).toEqual(tpOrder);
  });

  it('speed in m/s, average and maximum', () => {
    const xml = tcx([s(0, { speed: 3.6, dist: 0 }), s(10, { speed: 7.2, dist: 15 })])!;
    expect(all(xml, 'ns3:Speed')).toEqual(['1', '2']);
    expect(one(xml, 'MaximumSpeed')).toBe('2');
    expect(one(xml, 'ns3:AvgSpeed')).toBe('1.5');
  });

  it('trims standstill at start and end, keeps pauses in the middle', () => {
    const xml = tcx([
      s(0, { speed: 0, dist: 0 }), s(1, { speed: 0, dist: 0 }),
      s(2, { speed: 3, dist: 0 }), s(3, { speed: 0, dist: 1 }), s(4, { speed: 3, dist: 1 }),
      s(5, { speed: 0, dist: 2 }), s(6, { speed: 0, dist: 2 }),
    ])!;
    expect(all(xml, 'Time')).toEqual(['2026-10-31T09:00:02Z', '2026-10-31T09:00:03Z', '2026-10-31T09:00:04Z']);
  });

  it('distance stays monotonic even if the treadmill resets in between', () => {
    const xml = tcx([
      s(0, { speed: 3, dist: 100 }), s(1, { speed: 3, dist: 200 }), s(2, { speed: 3, dist: 5 }), s(3, { speed: 3, dist: 50 }),
    ])!;
    const d = all(xml, 'DistanceMeters').slice(1).map(Number); // the first one is the lap total
    expect(d).toEqual([0, 100, 105, 150]);
    expect(one(xml, 'DistanceMeters')).toBe('150');
  });

  it('without distance from the treadmill: integrated from the speed', () => {
    const xml = tcx([s(0, { speed: 3.6 }), s(10, { speed: 3.6 }), s(20, { speed: 3.6 })])!;
    expect(all(xml, 'DistanceMeters').slice(1).map(Number)).toEqual([0, 10, 20]);
  });

  it('heart rate only if > 0', () => {
    const xml = tcx([s(0, { speed: 3, dist: 0, hr: 0 }), s(1, { speed: 3, dist: 1, hr: 120 }), s(2, { speed: 3, dist: 2 })])!;
    expect(xml.match(/<HeartRateBpm>/g)?.length).toBe(1);
    expect(xml).toContain('<AverageHeartRateBpm><Value>120</Value></AverageHeartRateBpm>');
  });

  it('no heart rate elements without heart rate', () => {
    const xml = tcx([s(0, { speed: 3, dist: 0 }), s(1, { speed: 3, dist: 1 })])!;
    expect(xml).not.toContain('HeartRate');
  });

  it('calories summed across resets, 0 without values', () => {
    const a = tcx([s(0, { speed: 3, kcal: 10 }), s(1, { speed: 3, kcal: 20 }), s(2, { speed: 3, kcal: 3 })])!;
    expect(one(a, 'Calories')).toBe('13');
    const b = tcx([s(0, { speed: 3 }), s(1, { speed: 3 })])!;
    expect(one(b, 'Calories')).toBe('0');
  });

  it('notes in the language of the app, XML-escaped', () => {
    const xml = tcx([s(0, { speed: 3 }), s(1, { speed: 3 })], 'Running', 'Tapis de course <test> & “co”')!;
    expect(one(xml, 'Notes')).toBe('Tapis de course &#60;test&#62; &#38; “co”');
  });
});
