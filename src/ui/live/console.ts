// The experiment console (developer mode): hex bytes typed by hand go to the treadmill, but through the same checks as
// everything else (device/treadmill.ts, sendRaw): speed commands count for the governor, a stop always goes out at once and
// ends a program, a start asks first.

import { parseHexBytes } from '../../core/safety/safety';
import type { Treadmill } from '../../device/treadmill';
import { t } from '../../i18n/i18n';
import { $button, $input, log } from '../ui';
import { noticeText } from './treadmill-text';

export interface ConsoleHost {
  tm: Pick<Treadmill, 'state' | 'sendRaw'>;
  /** The question before a start; the console's raw Start is always asked */
  confirmStart(intro?: string, opts?: { always?: boolean }): Promise<boolean>;
}

export function setupConsole(host: ConsoleHost) {
  const { tm } = host;

  async function send() {
    if (!tm.state.connected) return;
    const bytes = parseHexBytes($input('raw').value);
    if (!bytes) { log(t.console.invalidHex); return; }
    let r = await tm.sendRaw(bytes);
    if (r.action === 'needs-confirmation') {
      if (!(await host.confirmStart(undefined, { always: true }))) return;
      r = await tm.sendRaw(bytes, { confirmed: true });
    }
    if (r.action === 'blocked') log(`❌ ${noticeText(r.reason)}`);
  }

  $button('rawSend').onclick = () => void send();
  $input('raw').addEventListener('keydown', e => { if (e.key === 'Enter') $button('rawSend').click(); });

  return { send };
}
