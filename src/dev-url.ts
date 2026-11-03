// Development only (npm run electron:dev): the address of the Vite dev server the desktop app loads instead of its bundled
// files, so a change in the source shows at once. An installed app never does this, and only a local http address counts.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** The origin of the dev server, or null: not given, not a local http address, or the app is installed (packaged) */
export function devOrigin(url: string | undefined, packaged: boolean): string | null {
  if (!url || packaged) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && !u.username && !u.password && LOCAL_HOSTS.has(u.hostname) ? u.origin : null;
  } catch {
    return null;
  }
}
