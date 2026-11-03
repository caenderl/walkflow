// "Developer mode": the person has switched on what is for tinkering and diagnosing: the experiment console (raw commands to
// the treadmill) and, in the desktop app, the developer tools. Nothing that walking needs depends on it, and nothing
// that limits or stops the belt is switched off by it: the checks of the console (limit, maximum change, spacing, the
// question before a raw Start) stay.

export const DEV_MODE_STORAGE_KEY = 'walkflow.devMode';

/** Only the exact stored value "1" switches it on; anything else (missing, damaged) leaves it off */
export const readDevMode = (raw: string | null): boolean => raw === '1';

/** The desktop app opens the developer tools only in developer mode, or when it runs from the dev server (npm run electron:dev) */
export const devToolsAllowed = (devMode: boolean, fromDevServer: boolean): boolean => devMode || fromDevServer;
