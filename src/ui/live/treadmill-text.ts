// The treadmill side speaks in codes (core/protocol/notice.ts, Machine Status, Control Point results); this turns them into
// text in the language of the app. No DOM, so it can be tested.

import { OP_NAMES, type ControlPointResponse, type MachineEvent } from '../../core/protocol/ftms';
import { TreadmillError, type Notice, type TreadmillErrorCode } from '../../core/protocol/notice';
import { t } from '../../i18n/i18n';

/** Result codes of Control Point responses → key in the locale files */
const RESULT_KEYS: Record<number, keyof typeof t.ftmsResult> = {
  1: 'ok',
  2: 'notSupported',
  3: 'invalidParameter',
  4: 'failed',
  5: 'notPermitted',
};

export function describeControlPointResponse(r: ControlPointResponse): string {
  const k = RESULT_KEYS[r.result];
  // Op names stay English in every language: they are the FTMS terms
  return `${OP_NAMES[r.requestOp] ?? '0x' + r.requestOp.toString(16)}: ${k ? t.ftmsResult[k] : r.result}`;
}

export function describeMachineStatus(e: MachineEvent): string {
  switch (e.kind) {
    case 'reset': return t.machine.reset;
    case 'stopped': return t.machine.stopped;
    case 'paused': return t.machine.paused;
    case 'safety-key': return t.machine.safetyKey;
    case 'started': return t.machine.started;
    case 'target-speed': return t.machine.targetSpeed(e.kmh);
    case 'target-incline': return t.machine.targetIncline(e.pct);
    case 'control-lost': return t.machine.controlLost;
    case 'other': return `Machine Status 0x${e.op.toString(16).padStart(2, '0')}`;
  }
}

function errorCodeText(code: TreadmillErrorCode): string {
  switch (code) {
    case 'no-gatt': return t.ble.noGatt;
    case 'not-connected': return t.ble.notConnected;
    case 'write-timeout': return t.ble.writeTimeout;
  }
}

/** The message of an error, in the language of the app if it is one of the treadmill's own */
export function errorText(e: unknown): string {
  if (e instanceof TreadmillError) return errorCodeText(e.code);
  return e instanceof Error ? e.message : String(e);
}

export function noticeText(n: Notice): string {
  switch (n.code) {
    case 'device': return t.ble.device(n.name);
    case 'device-info': return t.ble[n.field](n.value);
    case 'not-subscribable': return t.ble.notSubscribable(n.uuid.toString(16));
    case 'features': return t.ble.features(n.names.join(', ') || '–');
    case 'controllable': return t.ble.controllable(n.names.join(', ') || '–');
    case 'features-unreadable': return t.ble.featuresUnreadable;
    case 'speed-range': return t.ble.speedRange(n.range.min, n.range.max, n.range.step);
    case 'speed-range-unreadable': return t.ble.speedRangeUnreadable;
    case 'incline-range': return t.ble.inclRange(n.range.min, n.range.max, n.range.step);
    case 'incline-range-unreadable': return t.ble.inclRangeUnreadable;
    case 'heart-rate': return n.available ? t.ble.hrSubscribed : t.ble.noHr;
    case 'write-dropped': return t.ble.dropped(n.bytes);
    case 'write-failed': return t.ble.writeError(typeof n.error === 'string' ? errorCodeText(n.error) : n.error.message);
    case 'no-allowed-speed': return t.limit.noAllowedSpeed(n.max, n.min);
    case 'speed-held-until-moving': return t.limit.heldUntilMoving(n.kmh);
    case 'ramp-aborted': return t.limit.rampAborted;
    case 'start-speed-failed': return t.start.startSpeedFailed;
    case 'speed-refused': return t.limit.speedRefused;
    case 'limit-lowered': return t.limit.lowered(n.kmh);
    case 'limit-unconfirmed': return t.limit.unconfirmed(n.requested, n.applied);
    case 'limit-not-a-number': return t.limit.notANumber;
    case 'limit-out-of-range': return t.limit.outOfRange(n.min, n.max);
    case 'limit-stored-unconfirmed': return t.limit.storedUnconfirmed(n.value, n.applied);
    case 'limit-legacy-not-adopted': return t.limit.legacyNotAdopted(n.value, n.above);
    case 'console-set-speed-length': return t.console.setSpeedLength;
    case 'console-over-limit': return t.console.overLimit(n.kmh, n.max);
    case 'console-jump': return t.console.jump(n.from, n.to, n.maxStep);
    case 'console-too-soon': return t.console.tooSoon(n.intervalMs);
    case 'console-heart-rate': return t.console.heartRateBlocked;
  }
}
