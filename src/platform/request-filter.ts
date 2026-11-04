// Which requests the renderer of the desktop app may make. Everything else is cancelled in the main process. The list is the
// same as the content security policy (csp.ts) plus what the app itself needs: its own origin, the dev server in development,
// local data, the map servers of this build and the relays for sharing (connections only, see relays.ts).

export interface RequestRules {
  origin: string;
  devOrigin: string | null;
  mapOrigins: readonly string[];
  relays: readonly string[];
}

/** An origin matches itself and everything below it, never a longer name that only starts the same way */
const under = (url: string, origin: string) => url === origin || url.startsWith(`${origin}/`);

export function isAllowedRequest(url: string, rules: RequestRules): boolean {
  const dev = rules.devOrigin ? [rules.devOrigin, rules.devOrigin.replace('http:', 'ws:')] : [];
  const origins = [rules.origin, ...dev, ...rules.mapOrigins, ...rules.relays];
  return origins.some(o => under(url, o)) || ['devtools://', 'data:', 'blob:'].some(p => url.startsWith(p));
}
