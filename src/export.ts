// Export der aufgezeichneten Samples.

export interface Sample {
  /** Unix-Zeit in ms */
  ts: number;
  speed?: number;
  dist?: number;
  incl?: number;
  hr?: number;
  kcal?: number;
  time?: number;
}

export function toCsv(samples: readonly Sample[]): string {
  const rows = ['zeit_s,speed_kmh,dist_m,incl_pct,puls,kcal'];
  const t0 = samples[0]?.ts ?? 0;
  for (const s of samples) {
    rows.push([((s.ts - t0) / 1000).toFixed(0), s.speed ?? '', s.dist ?? '', s.incl ?? '', s.hr ?? '', s.kcal ?? ''].join(','));
  }
  return rows.join('\n');
}

export function exportFilename(date: Date, ext: string): string {
  return `laufband-${date.toISOString().slice(0, 16).replace(':', '-')}.${ext}`;
}
