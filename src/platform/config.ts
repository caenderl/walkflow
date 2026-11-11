// Build configuration. Values come from vite.config.ts (define) or VITE_* environment variables.

declare const __APP_VERSION__: string;
declare const __GITHUB_REPO__: string;

export const APP_NAME = 'Walkflow';
export const APP_VERSION: string = __APP_VERSION__;
/** "owner/repo", or empty if unknown at build time */
export const GITHUB_REPO: string = __GITHUB_REPO__;
/** 'web' (GitHub Pages) or 'desktop' (Electron) */
export const BUILD_TARGET: 'web' | 'desktop' = import.meta.env.VITE_TARGET === 'desktop' ? 'desktop' : 'web';
