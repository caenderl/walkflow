// The map itself. Loaded on demand (src/route-map.ts), because the library is large and most sessions never open a
// map. Display only: it takes a route and a position and sends nothing to the treadmill.

import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { routeBounds, routeLine } from './map-geo';
import type { Route } from './routes';

export interface RouteMap {
  /** Draw the route and fit it into the view */
  show(route: Route): void;
  /** The position marker; null removes it */
  mark(pos: { lat: number; lon: number } | null): void;
  destroy(): void;
}

export interface RouteMapOptions {
  style: string;
  /** Texts of the map's own controls and gesture hints */
  locale: Record<string, string>;
  /** The style, a tile or the WebGL context failed to load */
  onError(): void;
}

const SOURCE = 'route';
const LINE_COLOR = '#15803d';
const CASING_COLOR = '#ffffff';
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
  let marker: Marker | null = null;

  function draw(route: Route) {
    const data = routeLine(route.points);
    const source = map.getSource(SOURCE);
    if (source && 'setData' in source) {
      (source as unknown as { setData(d: unknown): void }).setData(data);
    } else {
      map.addSource(SOURCE, { type: 'geojson', data: data as never });
      const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
      map.addLayer({ id: 'route-casing', type: 'line', source: SOURCE, layout, paint: { 'line-color': CASING_COLOR, 'line-width': 8, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-line', type: 'line', source: SOURCE, layout, paint: { 'line-color': LINE_COLOR, 'line-width': 4 } });
    }
    map.fitBounds(routeBounds(route.points), { padding: FIT_PADDING, animate: false, maxZoom: 18 });
  }

  map.on('load', () => {
    loaded = true;
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
