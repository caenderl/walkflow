// The question before a start. Quiet mode (settings) skips it, except for a raw Start in the experiment console.

import { askBeforeStart } from '../../core/safety/quiet';
import { t } from '../../i18n/i18n';
import { confirmDialog } from '../components/dialogs';

export function makeConfirmStart(quiet: () => boolean) {
  return (intro?: string, opts?: { always?: boolean }): Promise<boolean> =>
    askBeforeStart(quiet(), () => confirmDialog(t.start.title, [
      ...(intro ? [intro] : []),
      t.start.sideRails,
      t.start.safetyKey,
    ], t.start.confirm), opts);
}
