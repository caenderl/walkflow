import { describe, expect, it } from 'vitest';
import { nameFromFile, safeFileName } from './route-files';
import { ROUTE_NAME_MAX } from './routes';

describe('nameFromFile', () => {
  it('drops the extension and turns underscores and dashes into spaces', () => {
    expect(nameFromFile('Morning_run-short.gpx')).toBe('Morning run short');
    expect(nameFromFile('Track.XML')).toBe('Track');
  });

  it('leaves other extensions alone and keeps the name within the limit', () => {
    expect(nameFromFile('loop.tcx')).toBe('loop.tcx');
    expect(nameFromFile(`${'a'.repeat(200)}.gpx`)).toHaveLength(ROUTE_NAME_MAX);
  });

  it('is empty for a file that is only an extension', () => {
    expect(nameFromFile('.gpx')).toBe('');
  });
});

describe('safeFileName', () => {
  it('keeps letters and digits of any language and replaces the rest by a dash', () => {
    expect(safeFileName('Außenalster-Runde 7,5 km')).toBe('Außenalster-Runde-7-5-km.gpx');
    expect(safeFileName('東京 皇居')).toBe('東京-皇居.gpx');
  });

  it('has no dashes at the ends and falls back to "route"', () => {
    expect(safeFileName('  /Test/  ')).toBe('Test.gpx');
    expect(safeFileName('///')).toBe('route.gpx');
  });

  it('is at most 60 characters long before the extension', () => {
    expect(safeFileName('x'.repeat(100))).toBe(`${'x'.repeat(60)}.gpx`);
  });
});
