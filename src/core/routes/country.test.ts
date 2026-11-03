import { describe, expect, it } from 'vitest';
import data from './data/countries.json';
import { countryAt, countryName, findCountry, isCountryCode, type CountryData } from './country';

/** Delta-coded ring as the data file has it, in 0.001° steps */
function ring(points: [number, number][], scale = 1000): number[] {
  const q = points.map(([lon, lat]) => [Math.round(lon * scale), Math.round(lat * scale)]);
  return [q[0]![0]!, q[0]![1]!, ...q.slice(1).flatMap((p, i) => [p[0]! - q[i]![0]!, p[1]! - q[i]![1]!])];
}
const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

describe('findCountry (the algorithm, on made-up data)', () => {
  const made: CountryData = {
    scale: 1000,
    countries: {
      AA: [[ring(square(0, 0, 10, 10)), ring(square(4, 4, 6, 6))]], // with a hole
      BB: [[ring(square(4.5, 4.5, 5.5, 5.5))]], // inside that hole
    },
  };

  it('finds the country that contains the point', () => {
    expect(findCountry(made, 2, 2)).toBe('AA');
    expect(findCountry(made, 9, 9)).toBe('AA');
  });

  it('respects a hole: what lies in it belongs to the country inside', () => {
    expect(findCountry(made, 5, 5)).toBe('BB');
    expect(findCountry(made, 4.2, 4.2)).toBe('');
  });

  it('takes a point just off the coast for the nearest country, but not one far away', () => {
    expect(findCountry(made, -0.05, 5)).toBe('AA');
    expect(findCountry(made, 5, 10.1)).toBe('AA');
    expect(findCountry(made, -1, 5)).toBe('');
    expect(findCountry(made, 50, 50)).toBe('');
  });

  it('is not fooled by unusable coordinates', () => {
    expect(findCountry(made, NaN, 5)).toBe('');
    expect(findCountry(made, 5, Infinity)).toBe('');
    expect(findCountry(made, 95, 5)).toBe('');
  });
});

describe('the country data (offline, from Natural Earth)', () => {
  const world = data as unknown as CountryData;

  const places: [string, number, number, string][] = [
    ['Munich', 48.1351, 11.582, 'DE'],
    ['Paris', 48.8566, 2.3522, 'FR'],
    ['Central Park Reservoir, New York', 40.7822, -73.9625, 'US'],
    ['Luxembourg', 49.6116, 6.1319, 'LU'],
    ['Vatican City', 41.9034, 12.4534, 'VA'],
    ['Colosseum, Rome', 41.8902, 12.4922, 'IT'],
    ['San Marino', 43.9424, 12.4578, 'SM'],
    ['Monaco', 43.7384, 7.4246, 'MC'],
    ['Vaduz', 47.141, 9.5215, 'LI'],
    ['Zurich', 47.3769, 8.5417, 'CH'],
    ['Maseru, inside South Africa', -29.31, 27.48, 'LS'],
    ['Pretoria', -25.7479, 28.2293, 'ZA'],
    ['Tokyo', 35.6762, 139.6503, 'JP'],
    ['Sydney', -33.8688, 151.2093, 'AU'],
    ['Reykjavik', 64.1466, -21.9426, 'IS'],
    ['Oslo', 59.9139, 10.7522, 'NO'],
    ['Suva, Fiji', -18.1248, 178.4501, 'FJ'],
    ['Singapore', 1.3521, 103.8198, 'SG'],
    ['Pristina', 42.6629, 21.1655, 'XK'],
    ['Cape Verde, Praia', 14.933, -23.5133, 'CV'],
  ];

  it.each(places)('%s', (_name, lat, lon, code) => {
    expect(findCountry(world, lat, lon)).toBe(code);
  });

  it('knows nothing in the middle of the ocean', () => {
    expect(findCountry(world, 30, -40)).toBe('');
  });

  it('has only valid codes, and a flag for each (see flags.test.ts)', () => {
    const codes = Object.keys(world.countries);
    expect(codes.length).toBeGreaterThan(200);
    expect(codes.every(isCountryCode)).toBe(true);
  });

  it('countryAt loads the data on demand and gives the same answer', async () => {
    expect(await countryAt(48.1351, 11.582)).toBe('DE');
    expect(await countryAt(30, -40)).toBe('');
  });
});

describe('isCountryCode and countryName', () => {
  it('accepts two capital letters only', () => {
    expect(isCountryCode('DE')).toBe(true);
    for (const bad of ['de', 'DEU', 'D', '', '1A', null, undefined, 5]) expect(isCountryCode(bad), String(bad)).toBe(false);
  });

  it('names a country in the language of the app, without a table of our own', () => {
    expect(countryName('DE', 'de')).toBe('Deutschland');
    expect(countryName('DE', 'en')).toBe('Germany');
    expect(countryName('FR', 'fr')).toBe('France');
  });

  it('falls back to the code when the name is not known', () => {
    expect(countryName('ZZ', 'en')).toMatch(/Unknown|ZZ/);
  });
});
