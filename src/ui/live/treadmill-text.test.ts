import { afterEach, describe, expect, it } from 'vitest';
import { TreadmillError } from 'ftms-treadmill';
import { setLanguage } from '../../i18n/i18n';
import { describeControlPointResponse, describeMachineStatus, errorText, noticeText } from './treadmill-text';

afterEach(() => setLanguage('en'));

describe('Control Point responses', () => {
  it('op name and result', () => {
    expect(describeControlPointResponse({ requestOp: 0x02, result: 1 })).toBe('Set Speed: OK');
    expect(describeControlPointResponse({ requestOp: 0x03, result: 2 })).toBe('Set Inclination: not supported');
  });

  it('unknown opcode and result', () => {
    expect(describeControlPointResponse({ requestOp: 0x11, result: 9 })).toBe('0x11: 9');
  });

  it('result in the current language, op name stays the FTMS term', () => {
    setLanguage('de');
    expect(describeControlPointResponse({ requestOp: 0x02, result: 5 })).toBe('Set Speed: keine Berechtigung');
  });
});

describe('Machine Status', () => {
  it('readable description in the current language', () => {
    expect(describeMachineStatus({ kind: 'safety-key' })).toBe('Belt stopped by the safety key');
    expect(describeMachineStatus({ kind: 'target-speed', kmh: 3.5 })).toBe('Target speed on the treadmill: 3.5 km/h');
    expect(describeMachineStatus({ kind: 'other', op: 0x42 })).toBe('Machine Status 0x42');
    setLanguage('de');
    expect(describeMachineStatus({ kind: 'target-speed', kmh: 3.5 })).toBe('Ziel-Speed am Band: 3,5 km/h');
  });
});

describe('noticeText', () => {
  it('says what was found while connecting, as before', () => {
    expect(noticeText({ code: 'device-info', field: 'manufacturer', value: 'FITHOME' })).toBe('Manufacturer: FITHOME');
    expect(noticeText({ code: 'not-subscribable', uuid: 0x2ad3 })).toBe('(Status 0x2ad3 not subscribable)');
    expect(noticeText({ code: 'incline-range-unreadable' })).toBe('Inclination range not readable (fallback 0–15 %)');
    expect(noticeText({ code: 'features', names: [] })).toBe('Features: –');
    expect(noticeText({ code: 'controllable', names: ['Speed', 'Inclination'] })).toBe('Controllable: Speed, Inclination');
    expect(noticeText({ code: 'heart-rate', available: false })).toBe('(no heart rate service)');
  });

  it('names a failed write in the current language', () => {
    expect(noticeText({ code: 'write-failed', error: { message: 'GATT busy' } })).toBe('❌ Write error: GATT busy');
    expect(noticeText({ code: 'write-failed', error: 'write-timeout' })).toBe('❌ Write error: no answer from the treadmill');
    setLanguage('de');
    expect(noticeText({ code: 'write-failed', error: 'not-connected' })).not.toContain('not connected');
  });

  it('speaks for the governor, the limit and the console', () => {
    expect(noticeText({ code: 'no-allowed-speed', min: 1, max: 0.5 })).toMatch(/No allowed speed/);
    expect(noticeText({ code: 'ramp-aborted' })).toMatch(/Stepwise speed change aborted/);
    expect(noticeText({ code: 'limit-legacy-not-adopted', value: 9, above: 6 })).toMatch(/not adopted/);
    expect(noticeText({ code: 'console-over-limit', kmh: 6.5, max: 6 })).toBe('6.5 km/h is above the limit (6), blocked');
  });

  it('follows the language of the app', () => {
    const n = { code: 'console-jump', from: 5.8, to: 6.4, maxStep: 0.5 } as const;
    const en = noticeText(n);
    setLanguage('fr');
    expect(noticeText(n)).not.toBe(en);
  });
});

describe('errorText', () => {
  it('names a treadmill error in the current language and passes others through', () => {
    expect(errorText(new TreadmillError('no-gatt'))).toBe('Device has no GATT server');
    expect(errorText(new Error('User cancelled'))).toBe('User cancelled');
    expect(errorText('x')).toBe('x');
  });
});
