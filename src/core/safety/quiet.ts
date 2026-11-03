// "Quiet mode": the person has switched off the warnings and the start confirmation. It only covers what is a notice or a
// question before a start. Nothing that limits or stops the belt depends on it: the speed limit, the ramp, the
// standstill check and Stop (Space/Esc) work the same either way, and so do the alarms for a lost connection.

export const QUIET_STORAGE_KEY = 'walkflow.quiet';

/** Only the exact stored value "1" switches it on; anything else (missing, damaged) leaves every question in place */
export const readQuiet = (raw: string | null): boolean => raw === '1';

/**
 * The question before a start. In quiet mode it is not asked and the start goes ahead. `always` is for the experiment
 * console: a raw Start command there is asked for either way.
 */
export function askBeforeStart(quiet: boolean, ask: () => Promise<boolean>, opts: { always?: boolean } = {}): Promise<boolean> {
  return quiet && !opts.always ? Promise.resolve(true) : ask();
}
