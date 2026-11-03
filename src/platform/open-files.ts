// Route packages opened from outside the app (double click in the Finder or Explorer, "Open with"). The system hands the
// path of the file to the app; here is the part that picks the packages out of what it passes. No DOM, no Node.

/** More than this at once are left alone: each one asks the person */
export const OPEN_MAX_PACKAGES = 5;
/** Larger files are not read (a package is a few hundred KB at most, see PACKAGE_MAX_CHARS) */
export const OPEN_MAX_BYTES = 8_000_000;

const EXTENSION = /\.walkflow$/i;

/** The route packages among command line arguments or paths, each once, in order */
export function packagePaths(args: readonly string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (a.startsWith('-') || !EXTENSION.test(a) || out.includes(a)) continue;
    out.push(a);
    if (out.length === OPEN_MAX_PACKAGES) break;
  }
  return out;
}
