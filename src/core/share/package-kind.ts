// Which kind of package a text is, so a file that is opened from outside, or an item that arrives from another device, goes to
// the reader that fits it. It only looks at the format field; the reader of that kind does the checking.

import { PACKAGE_FORMAT } from '../routes/route-package';
import { WORKOUT_PACKAGE_FORMAT } from '../training/workout-package';
import type { ItemKind } from './protocol';

/** null = not a package of ours (not JSON, no or another format) */
export function packageKind(text: string): ItemKind | null {
  // A GPX file is XML and never starts like this: no need to parse it as JSON
  if (!text.trimStart().startsWith('{')) return null;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  const format = typeof v === 'object' && v !== null ? (v as { format?: unknown }).format : undefined;
  return format === PACKAGE_FORMAT ? 'route' : format === WORKOUT_PACKAGE_FORMAT ? 'workout' : null;
}
