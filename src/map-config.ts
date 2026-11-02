// Where the optional map gets its data from. The styles (one for the light theme, one for the dark) are fixed when the
// app is built (WALKFLOW_MAP_STYLE and WALKFLOW_MAP_STYLE_DARK), not typed into the running app: the Content-Security-Policy
// lists the map servers the app may talk to, and a setting at runtime would either be blocked by it or need a policy
// that lets the app talk to any server.

export const DEFAULT_MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
export const DEFAULT_MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export interface MapStyles { light: string; dark: string }

const OFF = Symbol('off');

/** Empty = the default, "off" = no map, otherwise a plain https URL; anything else throws */
function resolveOne(name: string, raw: string | undefined): string | typeof OFF | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (v.toLowerCase() === 'off') return OFF;
  let url: URL;
  try { url = new URL(v); } catch { throw new Error(`${name} must be an https URL or "off", got "${v}"`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || !/^https:\/\/[^/\s]/.test(v)) {
    throw new Error(`${name} must be an https URL without credentials, or "off", got "${v}"`);
  }
  return v;
}

/**
 * The styles for a build. A bad value throws, so a typo in a build setting cannot quietly send map requests to a server
 * nobody chose. Only a light style given: it is used for the dark theme too. null = no map in this build.
 */
export function resolveMapStyles(light: string | undefined, dark: string | undefined): MapStyles | null {
  const l = resolveOne('WALKFLOW_MAP_STYLE', light);
  const d = resolveOne('WALKFLOW_MAP_STYLE_DARK', dark);
  if (l === OFF || d === OFF) return null;
  return { light: l ?? DEFAULT_MAP_STYLE_LIGHT, dark: d ?? l ?? DEFAULT_MAP_STYLE_DARK };
}

/** The server the policy has to let through: scheme, host and port of the style (the style names its tiles on it) */
export const mapOrigin = (styleUrl: string): string => new URL(styleUrl).origin;

/** Each server of the styles once */
export const mapOrigins = (styles: MapStyles): string[] => [...new Set([mapOrigin(styles.light), mapOrigin(styles.dark)])];

/** The style is OpenFreeMap's own for that theme, whose layers src/map-tint.ts knows; any other style is shown as it is */
export const isDefaultMapStyle = (url: string, dark: boolean): boolean => url === (dark ? DEFAULT_MAP_STYLE_DARK : DEFAULT_MAP_STYLE_LIGHT);
