import { describe, expect, it } from 'vitest';
import { bluetoothSupportHint } from './browser';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

describe('bluetoothSupportHint', () => {
  it('kein Hinweis, wenn Web Bluetooth da ist', () => {
    expect(bluetoothSupportHint({ ua: UA.chromeMac, hasApi: true, secure: true })).toBeNull();
  });

  it('iOS: in keinem Browser, Umweg Bluefy', () => {
    for (const ua of [UA.iphoneChrome, UA.ipadSafari]) {
      const h = bluetoothSupportHint({ ua, hasApi: false, secure: true })!;
      expect(h.title).toMatch(/iPhone|iPad/);
      expect(h.text).toMatch(/Bluefy/);
    }
  });

  it('iPad im Desktop-Modus (Mac-UA mit Touch) wird als iOS erkannt', () => {
    const h = bluetoothSupportHint({ ua: UA.safariMac, hasApi: false, secure: true, touchPoints: 5 })!;
    expect(h.title).toMatch(/iPad/);
  });

  it('Safari und Firefox: freundlich auf Chrome/Edge/Opera verweisen', () => {
    expect(bluetoothSupportHint({ ua: UA.safariMac, hasApi: false, secure: true })!.text).toMatch(/Chrome, Edge oder Opera/);
    expect(bluetoothSupportHint({ ua: UA.firefox, hasApi: false, secure: true })!.title).toMatch(/Firefox/);
  });

  it('Linux-Chrome: Flag-Hinweis', () => {
    expect(bluetoothSupportHint({ ua: UA.linuxChrome, hasApi: false, secure: true })!.text).toMatch(/chrome:\/\/flags/);
  });

  it('ohne HTTPS', () => {
    expect(bluetoothSupportHint({ ua: UA.chromeMac, hasApi: false, secure: false })!.title).toMatch(/HTTPS/);
  });
});
