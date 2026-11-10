// scripts/build-store.mjs is what the CI of the route-store repository (walkflow-app/route-store) runs against its files, using this
// repository's code for reading route packages. These tests run it on copies of a small store in a temporary folder.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const FIXTURE = fileURLToPath(new URL('./fixtures/route-store/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/build-store.mjs', import.meta.url));
const FILE = 'central-park-reservoir.walkflow';

let root = '';
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'route-store-')); cpSync(FIXTURE, root, { recursive: true }); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Run from the store's own folder, as the CI of the route-store repository does: the script finds the app's code by itself
const run = (...args: string[]) => {
  const r = spawnSync('node', [SCRIPT, '--root', root, ...args], { encoding: 'utf8', cwd: root });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const edit = (change: (pkg: Record<string, unknown>) => void) => {
  const path = join(root, 'routes', FILE);
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  change(pkg);
  writeFileSync(path, JSON.stringify(pkg));
};

describe('build-store.mjs', () => {
  it('writes the index, and the check then agrees', () => {
    rmSync(join(root, 'index.json'), { force: true });
    expect(run().code).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')).routes.map((r: { file: string }) => r.file)).toEqual([FILE]);
    expect(run('--check').code).toBe(0);
  });

  it('needs a folder to work on', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--root/);
  });

  it('fails the check when the index is not up to date, but not with --files-only', () => {
    run();
    edit(pkg => { pkg.revision = 2; });
    const stale = run('--check');
    expect(stale.code).toBe(1);
    expect(stale.out).toMatch(/not up to date/);
    expect(run('--check', '--files-only').code).toBe(0);
  });

  it('fails for a route without a licence', () => {
    edit(pkg => { delete pkg.license; });
    const r = run('--check', '--files-only');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/license/);
  });

  it('fails for a route that is not a valid package', () => {
    writeFileSync(join(root, 'routes', FILE), '{"not":"a route"}');
    const r = run('--check', '--files-only');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not a valid route package/);
  });

  it('fails for a file name the app would not accept, and for a copy of another file', () => {
    cpSync(join(root, 'routes', FILE), join(root, 'routes', 'Copy.walkflow'));
    expect(run('--check', '--files-only').out).toMatch(/file name must be/);
    rmSync(join(root, 'routes', 'Copy.walkflow'));
    cpSync(join(root, 'routes', FILE), join(root, 'routes', 'copy.walkflow'));
    expect(run('--check', '--files-only').out).toMatch(/the same file as/);
  });

  it('fails for a waypoint that is far from the route', () => {
    edit(pkg => { pkg.waypoints = [{ at: [0, 0], name: { en: 'Far away' } }]; });
    const r = run('--check', '--files-only');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/waypoint/);
  });
});
