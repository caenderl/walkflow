// The map itself. Loaded on demand (src/ui/routes/route-map.ts), because the library is large and most sessions never open a
// map. Display only: it takes a route and a position and sends nothing to the treadmill.

import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { routeBounds, routeLine } from '../../core/routes/map-geo';
import { applyTint, mapTint } from '../../core/routes/map-tint';
import type { Route } from '../../core/routes/routes';

export interface RouteMap {
  /** Draw the route and fit it into the view */
  show(route: Route): void;
  /** The position marker; null removes it */
  mark(pos: { lat: number; lon: number } | null): void;
  destroy(): void;
}

export interface RouteMapOptions {
  style: string;
  /** The style is a dark one: the route is drawn in a light colour then */
  dark: boolean;
  /** Give the style's main layers more colour (only for the built-in styles, see src/core/routes/map-tint.ts) */
  tint: boolean;
  /** Texts of the map's own controls and gesture hints */
  locale: Record<string, string>;
  /** The style, a tile or the WebGL context failed to load */
  onError(): void;
}

const SOURCE = 'route';
/** Route line and the edge around it, for a light and for a dark map */
const COLORS = { light: { line: '#15803d', casing: '#ffffff' }, dark: { line: '#4ade80', casing: '#0b1f12' } } as const;
const FIT_PADDING = 28;

export function createRouteMap(box: HTMLElement, opts: RouteMapOptions): RouteMap {
  // The worker is a file of its own next to the app (the policy allows workers from the app's origin only)
  setWorkerUrl(new URL(workerUrl, document.baseURI).href);

  const map = new MapLibreMap({
    container: box,
    style: opts.style,
    locale: opts.locale,
    cooperativeGestures: true,
    dragRotate: false,
    touchPitch: false,
    pitchWithRotate: false,
    maxPitch: 0,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false, showZoom: true }), 'top-right');
  map.on('error', () => opts.onError());

  let loaded = false;
  let pending: Route | null = null;
  /** The route on show, and whether the person has moved or zoomed the map since it was fitted */
  let shown: Route | null = null;
  let touched = false;
  let marker: Marker | null = null;

  function draw(route: Route) {
    const data = routeLine(route.points);
    const source = map.getSource(SOURCE);
    if (source && 'setData' in source) {
      (source as unknown as { setData(d: unknown): void }).setData(data);
    } else {
      map.addSource(SOURCE, { type: 'geojson', data: data as never });
      const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
      map.addLayer({ id: 'route-casing', type: 'line', source: SOURCE, layout, paint: { 'line-color': COLORS[opts.dark ? 'dark' : 'light'].casing, 'line-width': 8, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-line', type: 'line', source: SOURCE, layout, paint: { 'line-color': COLORS[opts.dark ? 'dark' : 'light'].line, 'line-width': 4 } });
    }
    fit(route);
    shown = route;
    touched = false;
  }

  function fit(route: Route) {
    map.fitBounds(routeBounds(route.points), { padding: FIT_PADDING, animate: false, maxZoom: 18 });
  }

  // The map's size changes (window, phone turned): fit the route again, unless the person has set the view themselves
  map.on('dragstart', () => { touched = true; });
  map.on('zoomstart', e => { if ((e as { originalEvent?: unknown }).originalEvent) touched = true; });
  map.on('resize', () => { if (loaded && shown && !touched) fit(shown); });

  map.on('load', () => {
    loaded = true;
    if (opts.tint) applyTint({ getLayer: id => map.getLayer(id), setPaintProperty: (id, p, v) => map.setPaintProperty(id, p as never, v as never), addLayer: (l, before) => map.addLayer(l as never, before) }, mapTint(opts.dark));
    if (pending) { draw(pending); pending = null; }
  });

  return {
    show(route) {
      if (loaded) draw(route); else pending = route;
    },
    mark(pos) {
      if (!pos) { marker?.remove(); marker = null; return; }
      if (!marker) {
        const dot = document.createElement('div');
        dot.className = 'map-dot';
        marker = new Marker({ element: dot }).setLngLat([pos.lon, pos.lat]).addTo(map);
      } else {
        marker.setLngLat([pos.lon, pos.lat]);
      }
    },
    destroy() {
      marker?.remove();
      marker = null;
      map.remove();
    },
  };
}
