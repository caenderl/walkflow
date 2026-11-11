/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TARGET?: 'web' | 'desktop';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Resolved at build time (vite.config.ts): URLs of the map styles for the light and the dark theme, null = no map in this build */
declare const __MAP_STYLES__: { light: string; dark: string } | null;
