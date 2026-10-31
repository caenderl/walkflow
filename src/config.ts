// Build-Konfiguration. Werte kommen aus vite.config.ts (define) bzw. VITE_*-Umgebungsvariablen.

declare const __APP_VERSION__: string;
declare const __GITHUB_REPO__: string;

export const APP_NAME = 'Walkflow';
export const APP_VERSION: string = __APP_VERSION__;
/** "owner/repo" oder leer, wenn beim Build unbekannt */
export const GITHUB_REPO: string = __GITHUB_REPO__;
/** 'web' (GitHub Pages) oder 'desktop' (Electron) */
export const BUILD_TARGET: 'web' | 'desktop' = import.meta.env.VITE_TARGET === 'desktop' ? 'desktop' : 'web';
/**
 * Optionaler Link für freiwillige Unterstützung. Leer = nichts anzeigen.
 * Wird nur im Web-Build angezeigt, nie in der Desktop-App.
 */
export const DONATION_URL: string = import.meta.env.VITE_DONATION_URL ?? '';
