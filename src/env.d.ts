/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TARGET?: 'web' | 'desktop';
  readonly VITE_DONATION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Resolved at build time (vite.config.ts): URL of the map style, null = no map in this build */
declare const __MAP_STYLE__: string | null;
