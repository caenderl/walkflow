// Installing the web app as an app of its own (a PWA), offered in Settings → Info. Chrome and Edge hand the page an install
// prompt when it can be installed; the app keeps it and shows a button that opens the browser's own dialog. Pure: what the
// info section shows, from what the page knows.

export type InstallState =
  /** Nothing to show: the desktop app */
  | 'none'
  /** Runs as an installed app already, or was just installed */
  | 'installed'
  /** The browser offers the install: the button */
  | 'offer'
  /** The browser does not offer it here (Safari, Firefox, dismissed, not yet): how to do it in the browser's menu */
  | 'manual';

export function installState(s: { web: boolean; standalone: boolean; installed: boolean; promptReady: boolean }): InstallState {
  if (!s.web) return 'none';
  if (s.standalone || s.installed) return 'installed';
  return s.promptReady ? 'offer' : 'manual';
}
