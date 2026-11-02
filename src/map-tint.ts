// More colour for the map. OpenFreeMap's built-in light and dark styles are nearly grey; after the style has loaded
// the app sets the colours of its main layers (water, green areas, roads, buildings). Only paint colours change, no
// request is made, and a layer the style does not have is skipped. The route line has its own colours (map-view.ts).

export interface TintRule {
  layers: readonly string[];
  prop: 'background-color' | 'fill-color' | 'fill-outline-color' | 'line-color' | 'text-color';
  color: string;
}

const rule = (prop: TintRule['prop'], color: string, ...layers: string[]): TintRule => ({ layers, prop, color });

const LIGHT: readonly TintRule[] = [
  rule('background-color', '#f4f1e8', 'background'),
  rule('fill-color', '#a6cfe8', 'water'),
  rule('line-color', '#a6cfe8', 'waterway'),
  rule('fill-color', '#cde6bd', 'park', 'landuse_park'),
  rule('fill-color', '#bddcab', 'landcover_wood'),
  rule('fill-color', '#efebe0', 'landuse_residential'),
  rule('fill-color', '#e7e1d5', 'building'),
  rule('fill-outline-color', '#d6cfc0', 'building'),
  rule('line-color', '#e0b995', 'highway_path'),
  rule('line-color', '#ffffff', 'highway_minor'),
  rule('line-color', '#fff1c4', 'highway_major_inner', 'highway_major_subtle'),
  rule('line-color', '#e6c982', 'highway_major_casing'),
  rule('line-color', '#ffd59a', 'highway_motorway_inner', 'highway_motorway_bridge_inner', 'highway_motorway_subtle'),
  rule('line-color', '#e2a965', 'highway_motorway_casing', 'highway_motorway_bridge_casing'),
  rule('text-color', '#2f6a9f', 'water_name_point_label', 'water_name_line_label'),
];

const DARK: readonly TintRule[] = [
  rule('background-color', '#14181d', 'background'),
  rule('fill-color', '#12324d', 'water'),
  rule('line-color', '#12324d', 'waterway'),
  rule('fill-color', '#1d4d35', 'landuse_park', 'park'),
  rule('fill-color', '#235a3e', 'landcover_wood'),
  rule('fill-color', '#191e25', 'landuse_residential'),
  rule('fill-color', '#1f2630', 'building'),
  rule('fill-outline-color', '#2a3340', 'building'),
  rule('line-color', '#56493a', 'highway_path'),
  rule('line-color', '#323c48', 'highway_minor'),
  rule('line-color', '#454f5c', 'highway_major_inner', 'highway_major_subtle'),
  rule('line-color', '#1d242d', 'highway_major_casing'),
  rule('line-color', '#6a5030', 'highway_motorway_inner', 'highway_motorway_subtle'),
  rule('line-color', '#2b2118', 'highway_motorway_casing'),
  rule('text-color', '#6fa8d8', 'water_name'),
];

export const mapTint = (dark: boolean): readonly TintRule[] => (dark ? DARK : LIGHT);

/** The part of a map the tint needs */
export interface TintTarget {
  getLayer(id: string): unknown;
  setPaintProperty(id: string, prop: string, value: string): unknown;
  addLayer(layer: Record<string, unknown>, before?: string): unknown;
}

const PARK_LAYER = 'tint-park';

export function applyTint(map: TintTarget, rules: readonly TintRule[]) {
  for (const r of rules) {
    for (const id of r.layers) {
      try { if (map.getLayer(id)) map.setPaintProperty(id, r.prop, r.color); } catch { /* cosmetic: keep the style's own colour */ }
    }
  }
  addParks(map, rules.find(r => r.prop === 'fill-color' && r.layers.includes('park'))?.color);
}

/**
 * The dark style draws no layer for the "park" data (big city parks), only small park areas: the park would stay as
 * dark as the streets around it. A fill layer of its own, below the water, takes care of that.
 */
function addParks(map: TintTarget, color: string | undefined) {
  try {
    const small = map.getLayer('landuse_park') as { source?: string } | undefined;
    if (!color || map.getLayer('park') || map.getLayer(PARK_LAYER) || !small?.source || !map.getLayer('water')) return;
    map.addLayer({ id: PARK_LAYER, type: 'fill', source: small.source, 'source-layer': 'park', paint: { 'fill-color': color } }, 'water');
  } catch { /* cosmetic */ }
}
