// Links to the project's own GitHub repository (product page, README, security policy, issue templates) all name the same owner,
// so a move of the repository cannot leave half of them behind. The CHANGELOG is written by release-please and is left out.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function files(path: string): string[] {
  const full = `${ROOT}${path}`;
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).flatMap(f => files(`${path}/${f}`));
}

describe('links to the project repository', () => {
  it('name one owner everywhere', () => {
    const owners = new Map<string, string[]>();
    for (const f of ['README.md', 'SECURITY.md', ...files('.github'), ...files('site').filter(s => /\.(html|js|css)$/.test(s)), ...files('docs')]) {
      for (const m of readFileSync(`${ROOT}${f}`, 'utf8').matchAll(/github\.com\/([A-Za-z0-9-]+)\/walkflow\b/g)) {
        owners.set(m[1]!, [...(owners.get(m[1]!) ?? []), f]);
      }
    }
    expect(owners.size, JSON.stringify([...owners])).toBe(1);
  });
});
