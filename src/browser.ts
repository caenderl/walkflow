// Freundliche Erklärung, wenn Web Bluetooth fehlt.

export interface SupportHint {
  title: string;
  text: string;
}

const ALTERNATIVES = 'Web Bluetooth gibt es in Chrome (Desktop und Android), Edge und Opera.';

export function bluetoothSupportHint(env: { ua: string; hasApi: boolean; secure: boolean; touchPoints?: number }): SupportHint | null {
  if (env.hasApi) return null;
  const ua = env.ua;
  const iPadDesktopMode = /Macintosh/.test(ua) && (env.touchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadDesktopMode) {
    return {
      title: 'Auf iPhone und iPad gibt es kein Web Bluetooth',
      text: 'Das liegt nicht an dir: Alle Browser auf iOS nutzen Safaris Engine, und die kann kein Web Bluetooth. '
        + 'Ein Umweg sind Browser mit eigener Bluetooth-Brücke wie Bluefy (von uns nicht getestet). '
        + 'Am Rechner geht es mit Chrome, Edge oder Opera oder mit der Desktop-App.',
    };
  }
  if (!env.secure) {
    return {
      title: 'Web Bluetooth braucht HTTPS',
      text: 'Öffne die App über https:// (oder lokal über localhost). Über http:// schaltet der Browser Bluetooth ab.',
    };
  }
  if (/Firefox\//.test(ua)) {
    return { title: 'Firefox kann kein Web Bluetooth', text: `${ALTERNATIVES} Alternativ gibt es die Desktop-App.` };
  }
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    return { title: 'Safari kann kein Web Bluetooth', text: 'Nimm Chrome, Edge oder Opera oder die Desktop-App.' };
  }
  if (/Linux/.test(ua) && /Chrome\//.test(ua) && !/Android/.test(ua)) {
    return {
      title: 'Web Bluetooth ist hier abgeschaltet',
      text: 'Unter Linux muss Web Bluetooth in Chrome je nach Version erst aktiviert werden: '
        + 'chrome://flags → „Experimental Web Platform features“. Alternativ die Desktop-App.',
    };
  }
  if (/Chrome\//.test(ua)) {
    return {
      title: 'Web Bluetooth ist hier abgeschaltet',
      text: `Manche Chromium-Browser (z. B. Brave) schalten es standardmäßig ab, dann hilft ein Blick in die Browser-Flags. ${ALTERNATIVES}`,
    };
  }
  return { title: 'Dieser Browser kann kein Web Bluetooth', text: `${ALTERNATIVES} Alternativ gibt es die Desktop-App.` };
}
