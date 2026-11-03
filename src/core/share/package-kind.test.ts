import { describe, expect, it } from 'vitest';
import { packageKind } from './package-kind';

describe('packageKind', () => {
  it('tells a route package from a workout package', () => {
    expect(packageKind('{"format":"walkflow-route","version":1}')).toBe('route');
    expect(packageKind('  \n{"format":"walkflow-workout","version":1}')).toBe('workout');
  });

  it('is null for everything else', () => {
    for (const text of ['', 'nope', '<gpx></gpx>', '[]', '{}', '{"format":"gpx"}', '{"format":5}', '{"format":null}', '{broken', 'null']) {
      expect(packageKind(text), text).toBeNull();
    }
  });

  it('only looks at the format: the reader of the kind does the checking', () => {
    expect(packageKind('{"format":"walkflow-route","points":"garbage"}')).toBe('route');
  });
});
