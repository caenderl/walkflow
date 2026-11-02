// The Content-Security-Policy of the web app (meta tag) and of the desktop app (response header). Nothing from outside
// is allowed, except the map server for data (tiles, style, sprites, fonts) and images, and only if the build has a map.

export function buildCsp({ mapOrigin, header }: { mapOrigin: string | null; header: boolean }): string {
  const remote = mapOrigin ? [mapOrigin] : [];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data:${remote.map(o => ` ${o}`).join('')}`,
    "font-src 'self'",
    `connect-src 'self'${remote.map(o => ` ${o}`).join('')}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    // Ignored in a meta tag, so only where it is a header
    ...(header ? ["frame-ancestors 'none'"] : []),
  ].join('; ');
}
