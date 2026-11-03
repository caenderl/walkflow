// The map slots of the route views: one place where a route is drawn on a map, loaded only when the person asks for
// it. Everything here is display only. A failure only shows a message; it never touches the treadmill's control path.

import { t } from '../../i18n/i18n';
import { isDefaultMapStyle } from '../../core/routes/map-config';
import type { RouteMap } from './map-view';
import type { Route } from '../../core/routes/routes';
import { isDark } from '../theme';

/** The map styles of this build (light and dark); null = no map in this build */
export const mapStyles = __MAP_STYLES__;
/** The style for the current theme */
export const pickStyle = () => { const dark = isDark(); return { url: dark ? mapStyles!.dark : mapStyles!.light, dark }; };

export interface MapSlot {
  /** The route to draw; null = none */
  setRoute(route: Route | null): void;
  /** The current position on the route; null = none */
  mark(pos: { lat: number; lon: number } | null): void;
  setEnabled(on: boolean): void;
  /** The language or the theme changed: the map's own texts and its style are set when it is created */
  rebuild(): void;
}

/** Texts of the map library's controls, in the language of the app */
function mapLocale(): Record<string, string> {
  return {
    'Map.Title': t.routes.mapLabel,
    'NavigationControl.ZoomIn': t.routes.mapZoomIn,
    'NavigationControl.ZoomOut': t.routes.mapZoomOut,
    'AttributionControl.ToggleAttribution': t.routes.mapAttribution,
    'CooperativeGesturesHandler.WindowsHelpText': t.routes.mapGestureDesktop,
    'CooperativeGesturesHandler.MacHelpText': t.routes.mapGestureMac,
    'CooperativeGesturesHandler.MobileHelpText': t.routes.mapGestureMobile,
  };
}

/**
 * @param box where the map goes; shown while a route is drawn and the map is on
 * @param style the map style for the current theme (the build's, see src/core/routes/map-config.ts), asked for whenever a map is made
 * @param onProblem a message to show, or null when there is nothing to report
 */
export function createMapSlot(box: HTMLElement, style: () => { url: string; dark: boolean }, onProblem: (message: string | null) => void): MapSlot {
  let enabled = false;
  let route: Route | null = null;
  let pos: { lat: number; lon: number } | null = null;
  let map: RouteMap | null = null;
  let loading = false;
  /** Raised whenever the map is thrown away, so a creation that is still under way notices */
  let generation = 0;
  let shown = '';

  const wanted = () => enabled && route !== null;
  const key = (r: Route) => `${r.id}:${r.updated}`;

  function drop() {
    generation++;
    shown = '';
    try { map?.destroy(); } catch { /* display only */ }
    map = null;
    box.replaceChildren();
  }

  async function create() {
    // Without a size (the view is not on screen) the map would be laid out for nothing; the observer calls sync later
    if (map || loading || box.clientWidth === 0) return;
    loading = true;
    const gen = generation;
    try {
      const { createRouteMap } = await import('./map-view');
      if (gen !== generation || !wanted()) return;
      const chosen = style();
      map = createRouteMap(box, { style: chosen.url, dark: chosen.dark, tint: isDefaultMapStyle(chosen.url, chosen.dark), locale: mapLocale(), onError: () => onProblem(t.routes.mapFailed) });
      map.show(route!);
      shown = key(route!);
      map.mark(pos);
      onProblem(null);
    } catch {
      map = null;
      onProblem(t.routes.mapFailed);
    } finally {
      loading = false;
    }
    if (gen !== generation) sync();
  }

  function sync() {
    box.hidden = !wanted();
    if (!wanted()) {
      if (map || loading) drop();
      onProblem(null);
      return;
    }
    if (!map) { void create(); return; }
    try {
      if (shown !== key(route!)) { map.show(route!); shown = key(route!); }
      map.mark(pos);
    } catch { /* display only */ }
  }

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (!map && wanted()) sync(); }).observe(box);

  return {
    setRoute(r) { route = r; sync(); },
    mark(p) {
      pos = p;
      try { map?.mark(p); } catch { /* display only */ }
    },
    setEnabled(on) { enabled = on; sync(); },
    rebuild() { if (map) { drop(); sync(); } },
  };
}
