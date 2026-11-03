// Names of route files: the name a route gets from the file it was imported from, and the file name an export gets.

import { ROUTE_NAME_MAX } from './routes';

/** The name a route gets when the file has none: the file name without its extension */
export const nameFromFile = (fileName: string) => fileName.replace(/\.(gpx|xml)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, ROUTE_NAME_MAX).trim();

/** A file name for the GPX export: letters and digits of any language, everything else becomes a dash */
export function safeFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'route'}.gpx`;
}
