// Where the optional map gets its data from. The style URL is fixed when the app is built (WALKFLOW_MAP_STYLE), not
// typed into the running app: the Content-Security-Policy lists the one server the map may talk to, and a setting at
// runtime would either be blocked by it or need a policy that lets the app talk to any server.

export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * The style URL for a build: the default for an empty value, null for "off" (no map in this build), the value itself
 * if it is a plain https URL. Anything else throws, so a typo in a build setting cannot quietly send map requests to a
 * server nobody chose.
 */
export function resolveMapStyle(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return DEFAULT_MAP_STYLE;
  if (v.toLowerCase() === 'off') return null;
  let url: URL;
  try { url = new URL(v); } catch { throw new Error(`WALKFLOW_MAP_STYLE must be an https URL or "off", got "${v}"`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || !/^https:\/\/[^/\s]/.test(v)) {
    throw new Error(`WALKFLOW_MAP_STYLE must be an https URL without credentials, or "off", got "${v}"`);
  }
  return v;
}

/** The server the policy has to let through: scheme, host and port of the style (the style names its tiles on it) */
export const mapOrigin = (styleUrl: string): string => new URL(styleUrl).origin;
