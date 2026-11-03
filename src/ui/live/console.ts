// The experiment console (developer mode): hex bytes typed by hand go to the treadmill, but through the same checks as
// everything else. Speed commands count for the governor, a stop always goes out at once, a start asks first.

import { OP } from '../../core/protocol/ftms';
import { checkConsoleCommand, parseHexBytes, type SpeedGovernor } from '../../core/safety/safety';
import { t, type Text } from '../../i18n/i18n';
import { $button, $input, log } from '../ui';
import type { Session } from './session';

export interface ConsoleHost {
  session: Session;
  governor: SpeedGovernor;
  /** The highest speed that may be sent (device range and the person's limit) */
  effectiveMax(): number;
  /** The question before a start; the console's raw Start is always asked */
  confirmStart(intro?: string, opts?: { always?: boolean }): Promise<boolean>;
  /** A running workout or route ends */
  abortRun(reason: Text): void;
  /** The belt is stopping or has stopped on purpose: standing still is expected from now on */
  disarmStandstill(): void;
}

export function setupConsole(host: ConsoleHost) {
  const { session, governor } = host;

  async function send() {
    const c = session.client;
    if (!c) return;
    const bytes = parseHexBytes($input('raw').value);
    if (!bytes) { log(t.console.invalidHex); return; }
    const check = checkConsoleCommand(bytes, {
      maxKmh: host.effectiveMax(),
      maxStep: governor.maxStep,
      baseKmh: governor.base(),
      msSinceLastSpeedCommand: governor.msSinceLastCommand(),
    });
    if (check.action === 'block') { log(`❌ ${check.reason}`); return; }
    const data = new Uint8Array(bytes);
    if (check.action === 'confirm-start') {
      if (!(await host.confirmStart(undefined, { always: true }))) return;
      governor.reset();
      if (await c.send(data)) session.beltStarted = true;
      return;
    }
    if (bytes[0] === OP.STOP_PAUSE && (bytes[1] === 0x01 || bytes[1] === 0x02)) {
      host.abortRun(() => t.console.stopped);
      governor.reset();
      host.disarmStandstill();
      if (await c.send(data, { urgent: true })) session.beltStarted = false;
      return;
    }
    if (check.setSpeed !== undefined) governor.noteExternalCommand(check.setSpeed);
    void c.send(data);
  }

  $button('rawSend').onclick = () => void send();
  $input('raw').addEventListener('keydown', e => { if (e.key === 'Enter') $button('rawSend').click(); });

  return { send };
}
