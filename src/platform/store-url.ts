// Where the route store is read from (docs/ROUTE-STORE.md): the route-store repository on GitHub, next to the app's repository
// (same owner), worked out from the repository the build was made for. A build without a repository has no store. The content
// security policy and the request filter of the desktop app allow exactly this address and nothing else on that host.

/** The name of the repository the store is kept in, under the same owner as the app */
const STORE_REPO = 'route-store';
/** The branch the app reads the store from */
const STORE_BRANCH = 'main';

/**
 * The address the store is at, without a trailing slash, or null. `override` is an address for trying the store out (a local
 * server): it has to be secure, or a local one, and without a query or a part after #; it replaces the repository.
 */
export function resolveStoreBase(repo: string, override = ''): string | null {
  if (override) {
    let url: URL;
    try { url = new URL(override); } catch { return null; }
    const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if ((url.protocol !== 'https:' && !local) || url.search || url.hash || url.username || url.password || !url.hostname) return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  }
  const ok = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && !repo.split('/').some(p => p === '.' || p === '..');
  return ok ? `https://raw.githubusercontent.com/${repo.split('/')[0]}/${STORE_REPO}/${STORE_BRANCH}` : null;
}
