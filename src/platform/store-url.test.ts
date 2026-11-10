import { describe, expect, it } from 'vitest';
import { resolveStoreBase } from './store-url';

describe('resolveStoreBase', () => {
  it('is the store folder of the repository on its main branch', () => {
    expect(resolveStoreBase('walkflow-app/walkflow')).toBe('https://raw.githubusercontent.com/walkflow-app/walkflow/main/store');
  });

  it('is none without a plausible repository, so a build without one has no store', () => {
    for (const repo of ['', 'walkflow', 'a/b/c', 'a b/c', '../x', 'a/..', './x', '/x', 'x/', 'a/b?x', 'a/b#x']) expect(resolveStoreBase(repo), repo).toBeNull();
  });

  it('an address given for testing replaces the repository: secure, or a local server', () => {
    expect(resolveStoreBase('walkflow-app/walkflow', 'https://example.org/store')).toBe('https://example.org/store');
    expect(resolveStoreBase('', 'http://localhost:8099/store/')).toBe('http://localhost:8099/store');
    expect(resolveStoreBase('', 'http://127.0.0.1:8099/store')).toBe('http://127.0.0.1:8099/store');
  });

  it('an address given for testing that is not safe is not used, and does not fall back to something else', () => {
    for (const bad of ['http://example.org/store', 'ftp://example.org/store', 'https://example.org/store?x=1', 'https://example.org/store#x', 'https://user:pw@example.org/store', 'javascript:alert(1)', 'https://', 'localhost:8099']) {
      expect(resolveStoreBase('walkflow-app/walkflow', bad), bad).toBeNull();
    }
  });
});
