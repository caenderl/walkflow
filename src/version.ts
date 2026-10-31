// Version comparison for the desktop app's update notice (also used by the main process).

export function parseVersion(v: string): { parts: [number, number, number]; pre: boolean } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return null;
  return { parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: !!m[4] };
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.parts[i]! !== b.parts[i]!) return a.parts[i]! > b.parts[i]!;
  }
  return !a.pre && b.pre;
}
