// Export of the recorded samples.

export interface Sample {
  /** Unix time in ms */
  ts: number;
  speed?: number;
  dist?: number;
  incl?: number;
  hr?: number;
  kcal?: number;
  time?: number;
}

export function toCsv(samples: readonly Sample[]): string {
  // Column names are part of the file format: English in every language
  const rows = ['time_s,speed_kmh,dist_m,incl_pct,hr_bpm,kcal'];
  const t0 = samples[0]?.ts ?? 0;
  for (const s of samples) {
    rows.push([((s.ts - t0) / 1000).toFixed(0), s.speed ?? '', s.dist ?? '', s.incl ?? '', s.hr ?? '', s.kcal ?? ''].join(','));
  }
  return rows.join('\n');
}

export function exportFilename(date: Date, ext: string): string {
  return `walkflow-${date.toISOString().slice(0, 16).replace(':', '-')}.${ext}`;
}

// ---------- TCX (Training Center XML, e.g. for Strava or Garmin Connect) ----------

export type TcxSport = 'Running' | 'Other';

const iso = (ts: number) => new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z');
const num = (v: number, decimals: number) => String(Math.round(v * 10 ** decimals) / 10 ** decimals);
const escapeXml = (s: string) => s.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);

/**
 * Turns counters from the treadmill (distance, kcal) into a monotonic sum from the first value on.
 * If the counter drops (the treadmill started over after a stop), the new value counts on from 0.
 * Missing values carry the previous sum forward.
 */
export function accumulate(values: readonly (number | undefined)[]): number[] {
  let sum = 0;
  let prev: number | undefined;
  return values.map(v => {
    if (v !== undefined) {
      if (prev !== undefined) sum += v >= prev ? v - prev : v;
      prev = v;
    }
    return sum;
  });
}

/** Metres from the first sample on: the treadmill's counter if it reports one, otherwise speed × time. */
export function distanceSeries(pts: readonly Sample[]): number[] {
  if (pts.some(p => p.dist !== undefined)) return accumulate(pts.map(p => p.dist));
  const dist = pts.length ? [0] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    dist.push(dist[i - 1]! + (((a.speed ?? 0) + (b.speed ?? 0)) / 2 / 3.6) * ((b.ts - a.ts) / 1000));
  }
  return dist;
}

export function buildTcx(all: readonly Sample[], opts: { sport: TcxSport; notes: string }): string | null {
  const withSpeed = all.filter(s => s.speed !== undefined);
  const first = withSpeed.findIndex(s => s.speed! > 0);
  if (first === -1) return null;
  let last = withSpeed.length - 1;
  while (withSpeed[last]!.speed! <= 0) last--;
  const pts = withSpeed.slice(first, last + 1);

  const dist = distanceSeries(pts);
  const kcal = accumulate(pts.map(p => p.kcal));
  const hrs = pts.map(p => p.hr ?? 0).filter(h => h > 0);

  const start = pts[0]!.ts;
  const totalSec = (pts.at(-1)!.ts - start) / 1000;
  const totalDist = dist.at(-1)!;
  const maxSpeed = Math.max(...pts.map(p => p.speed!)) / 3.6;
  const avgSpeed = totalSec > 0 ? totalDist / totalSec : 0;

  const trackpoints = pts.map((p, i) => {
    const hr = p.hr && p.hr > 0 ? `\n            <HeartRateBpm><Value>${Math.round(p.hr)}</Value></HeartRateBpm>` : '';
    return `          <Trackpoint>
            <Time>${iso(p.ts)}</Time>
            <DistanceMeters>${num(dist[i]!, 1)}</DistanceMeters>${hr}
            <Extensions><ns3:TPX><ns3:Speed>${num(p.speed! / 3.6, 3)}</ns3:Speed></ns3:TPX></Extensions>
          </Trackpoint>`;
  }).join('\n');

  const hrLap = hrs.length
    ? `\n        <AverageHeartRateBpm><Value>${Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)}</Value></AverageHeartRateBpm>`
      + `\n        <MaximumHeartRateBpm><Value>${Math.max(...hrs)}</Value></MaximumHeartRateBpm>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="${opts.sport}">
      <Id>${iso(start)}</Id>
      <Lap StartTime="${iso(start)}">
        <TotalTimeSeconds>${num(totalSec, 0)}</TotalTimeSeconds>
        <DistanceMeters>${num(totalDist, 1)}</DistanceMeters>
        <MaximumSpeed>${num(maxSpeed, 3)}</MaximumSpeed>
        <Calories>${Math.round(kcal.at(-1)!)}</Calories>${hrLap}
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpoints}
        </Track>
        <Extensions><ns3:LX><ns3:AvgSpeed>${num(avgSpeed, 3)}</ns3:AvgSpeed></ns3:LX></Extensions>
      </Lap>
      <Notes>${escapeXml(opts.notes)}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`;
}
