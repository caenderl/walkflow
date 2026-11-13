// scripts/route-preview-pr.mjs writes the map of a route into a pull request of the route store, as one comment that is changed on every
// push. These tests give it a fake `gh` that answers like the GitHub API and records what is written; nothing here uses the network.

import { describe, expect, it } from 'vitest';
// @ts-expect-error plain script without types, run by node
import { previewComment } from '../scripts/route-preview-pr.mjs';
// @ts-expect-error plain script without types, run by node
import { MARKER } from '../scripts/route-preview.mjs';

const SHA = 'a'.repeat(40);
const PKG = JSON.stringify({ format: 'walkflow-route', version: 1, name: { en: 'X' }, points: [[52.5, 13.4], [52.5, 13.41]], waypoints: [] });
type File = { status: string; filename: string };
type Comment = { id: number; body: string; login: string };

function fake({ files, comments = [], content = PKG }: { files: File[]; comments?: Comment[]; content?: string | null }) {
  const writes: string[][] = [];
  const gh = (args: string[]): string => {
    const url = args.find(a => a.startsWith('repos/')) ?? '';
    if (args.includes('-X')) { writes.push(args); return ''; }
    if (url.includes('/pulls/')) return files.map(f => JSON.stringify(f)).join('\n');
    if (url.includes('/issues/') && url.endsWith('/comments')) return comments.map(c => JSON.stringify(c)).join('\n');
    if (url.includes('/contents/')) { if (content == null) throw new Error('404'); return content; }
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  return { gh, writes };
}
const run = (f: ReturnType<typeof fake>, over: Record<string, unknown> = {}) =>
  previewComment({ gh: f.gh, repo: 'walkflow-app/route-store', pr: 7, headRepo: 'someone/route-store', headSha: SHA, ...over }) as string | null;

describe('previewComment', () => {
  it('writes a new comment with the map when one route file is new', () => {
    const f = fake({ files: [{ status: 'added', filename: 'routes/a.walkflow' }, { status: 'modified', filename: 'README.md' }] });
    const body = run(f)!;
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain('```geojson');
    expect(body).toContain(`commit \`${SHA.slice(0, 12)}\``);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toContain('POST');
    expect(f.writes[0]).toContain('repos/walkflow-app/route-store/issues/7/comments');
  });

  it('changes the comment of the bot instead of writing a second one, and ignores a comment that only looks like it', () => {
    const f = fake({
      files: [{ status: 'modified', filename: 'routes/a.walkflow' }],
      comments: [{ id: 1, body: `${MARKER}\nfaked`, login: 'someone' }, { id: 2, body: 'a review comment', login: 'github-actions[bot]' }, { id: 3, body: `${MARKER}\nold map`, login: 'github-actions[bot]' }],
    });
    run(f);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toContain('PATCH');
    expect(f.writes[0]).toContain('repos/walkflow-app/route-store/issues/comments/3');
  });

  it('says that a pull request takes one route when it changes several, also when one of them is removed', () => {
    for (const files of [
      [{ status: 'added', filename: 'routes/a.walkflow' }, { status: 'added', filename: 'routes/b.walkflow' }],
      [{ status: 'added', filename: 'routes/a.walkflow' }, { status: 'removed', filename: 'routes/b.walkflow' }],
    ]) {
      const body = run(fake({ files }))!;
      expect(body).toContain('changes 2 route files');
      expect(body).not.toContain('```geojson');
    }
  });

  it('writes nothing for a pull request without a route file, unless there is an old map to take back', () => {
    const files = [{ status: 'modified', filename: 'README.md' }];
    const none = fake({ files });
    expect(run(none)).toBeNull();
    expect(none.writes).toHaveLength(0);
    const old = fake({ files, comments: [{ id: 5, body: `${MARKER}\nold map`, login: 'github-actions[bot]' }] });
    expect(run(old)).toContain('does not change a route file');
    expect(old.writes[0]).toContain('PATCH');
  });

  it('does not read a file whose name it does not know, and says so when the file cannot be read', () => {
    const odd = fake({ files: [{ status: 'added', filename: 'routes/A b.walkflow' }] });
    expect(run(odd)).toContain('The name of the route file');
    const gone = fake({ files: [{ status: 'added', filename: 'routes/a.walkflow' }], content: null });
    expect(run(gone)).toContain('could not be read');
    expect(run(fake({ files: [{ status: 'added', filename: 'routes/a.walkflow' }] }), { headRepo: null })).toContain('not there any more');
  });

  it('writes nothing with --dry, and refuses input that does not look right', () => {
    const f = fake({ files: [{ status: 'added', filename: 'routes/a.walkflow' }] });
    expect(run(f, { dry: true })).toContain('```geojson');
    expect(f.writes).toHaveLength(0);
    expect(() => run(f, { pr: '7; rm -rf' })).toThrow(/look right/);
    expect(() => run(f, { repo: 'a b' })).toThrow(/look right/);
    expect(() => run(f, { headSha: 'main' })).toThrow(/look right/);
  });
});
