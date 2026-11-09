// The Content-Security-Policy of the web app (meta tag) and of the desktop app (response header). Nothing from outside
// is allowed, except the map servers for data (tiles, style, sprites, fonts) and images, and only if the build has a map,
// the relays for sharing (connections only, see relays.ts) and the route store (connections only, see store-url.ts).

export function buildCsp({ mapOrigins, relays, store = null, header }: { mapOrigins: readonly string[]; relays: readonly string[]; store?: string | null; header: boolean }): string {
  const remote = mapOrigins;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data:${remote.map(o => ` ${o}`).join('')}`,
    "font-src 'self'",
    // The store is a folder: with the trailing slash the policy allows that folder and what is below it, nothing else on the host
    `connect-src 'self'${[...remote, ...relays, ...(store ? [`${store}/`] : [])].map(o => ` ${o}`).join('')}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    // Ignored in a meta tag, so only where it is a header
    ...(header ? ["frame-ancestors 'none'"] : []),
  ].join('; ');
}
