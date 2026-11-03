import { describe, expect, it } from 'vitest';
import { OPEN_MAX_PACKAGES, packagePaths } from './open-files';

describe('packagePaths', () => {
  it('takes the route packages from the arguments the system passes when a file is opened', () => {
    expect(packagePaths(['C:\\Users\\me\\Loop.walkflow'])).toEqual(['C:\\Users\\me\\Loop.walkflow']);
    expect(packagePaths(['/Users/me/Loop.walkflow', '/Users/me/Other.walkflow'])).toEqual(['/Users/me/Loop.walkflow', '/Users/me/Other.walkflow']);
  });

  it('ignores everything else: the program, options, other files, other extensions', () => {
    expect(packagePaths(['/Applications/Walkflow.app', '--no-sandbox', '--flag=a.walkflow', '.', 'route.gpx', 'notes.walkflow.txt', 'walkflow'])).toEqual([]);
  });

  it('knows the extension in any case, and only at the end', () => {
    expect(packagePaths(['A.WALKFLOW', 'b.Walkflow', 'c.walkflow.bak'])).toEqual(['A.WALKFLOW', 'b.Walkflow']);
  });

  it('lists a file once and opens only a few at a time', () => {
    expect(packagePaths(['a.walkflow', 'a.walkflow'])).toEqual(['a.walkflow']);
    const many = Array.from({ length: OPEN_MAX_PACKAGES + 4 }, (_, i) => `f${i}.walkflow`);
    expect(packagePaths(many)).toHaveLength(OPEN_MAX_PACKAGES);
  });

  it('copes with nothing', () => {
    expect(packagePaths([])).toEqual([]);
  });
});
