// Friendly explanation when Web Bluetooth is missing.

import { t } from '../i18n/i18n';

export interface SupportHint {
  title: string;
  text: string;
}

export function bluetoothSupportHint(env: { ua: string; hasApi: boolean; secure: boolean; touchPoints?: number }): SupportHint | null {
  if (env.hasApi) return null;
  const b = t.browser;
  const ua = env.ua;
  const iPadDesktopMode = /Macintosh/.test(ua) && (env.touchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadDesktopMode) return { title: b.iosTitle, text: b.iosText };
  if (!env.secure) return { title: b.httpsTitle, text: b.httpsText };
  if (/Firefox\//.test(ua)) return { title: b.firefoxTitle, text: `${b.alternatives} ${b.desktopAlternative}` };
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return { title: b.safariTitle, text: b.safariText };
  if (/Linux/.test(ua) && /Chrome\//.test(ua) && !/Android/.test(ua)) return { title: b.disabledTitle, text: b.linuxText };
  if (/Chrome\//.test(ua)) return { title: b.disabledTitle, text: `${b.chromiumText} ${b.alternatives}` };
  return { title: b.otherTitle, text: `${b.alternatives} ${b.desktopAlternative}` };
}
