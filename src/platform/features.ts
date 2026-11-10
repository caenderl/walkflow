// Which parts of the app are in this build, and where the route store is. Community (sharing between devices, docs/P2P.md) is off in the first release: it
// has to be tested with more than one real device before it goes live. Build with WALKFLOW_COMMUNITY=on to try it (the web
// build, the dev server and the desktop build all read it). When it is off, nothing of it is shown or set up, and the content
// security policy and the request filter of the desktop app allow no connection to the relays.

declare const __COMMUNITY__: boolean;
declare const __STORE_BASE__: string;

export const COMMUNITY_ENABLED: boolean = __COMMUNITY__;
/** The address the route store is read from (platform/store-url.ts); null: this build has no store */
export const STORE_BASE: string | null = __STORE_BASE__ || null;
