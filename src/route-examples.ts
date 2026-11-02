// Example routes that come with the app, so the routes view is not empty on the first start. They are copied into the
// person's own library on request (with a new id), like a GPX import; nothing here is shared or changed afterwards.
// Track data is from OpenStreetMap, so it carries the attribution the licence asks for. A track in OpenStreetMap has no
// elevations, so these routes have none either.

import type { Route } from './routes';

export interface RouteExample {
  key: string;
  name: string;
  place: string;
  /** Where the track comes from, shown next to it */
  source: string;
  /** [latitude, longitude] */
  points: readonly (readonly [number, number])[];
}

const OSM = '© OpenStreetMap contributors (ODbL)';

export const ROUTE_EXAMPLES: readonly RouteExample[] = [
  {
    key: 'central-park-reservoir',
    name: 'Central Park Reservoir Loop',
    place: 'New York, USA',
    // OpenStreetMap way 179679714 "Stephanie and Fred Shuman Reservoir Running Track", simplified to within 1 m
    source: OSM,
    points: [
      [40.782163, -73.962538], [40.782071, -73.962314], [40.782008, -73.962056], [40.781989, -73.961865],
      [40.782002, -73.961569], [40.78204, -73.961366], [40.782125, -73.961126], [40.782232, -73.96094],
      [40.78232, -73.960834], [40.782436, -73.96072], [40.786376, -73.957851], [40.786505, -73.957776],
      [40.786695, -73.957733], [40.78702, -73.957758], [40.787622, -73.95772], [40.788067, -73.957575],
      [40.788361, -73.957444], [40.788439, -73.957436], [40.78862, -73.957465], [40.788764, -73.957549],
      [40.788851, -73.957649], [40.788938, -73.957802], [40.788998, -73.958044], [40.788998, -73.958242],
      [40.788973, -73.958378], [40.788849, -73.958673], [40.788759, -73.958952], [40.788696, -73.959258],
      [40.788675, -73.959573], [40.788686, -73.959831], [40.788733, -73.96011], [40.78879, -73.960332],
      [40.78895, -73.960777], [40.788972, -73.961057], [40.788959, -73.961292], [40.788916, -73.961491],
      [40.788854, -73.961655], [40.788737, -73.961852], [40.788581, -73.962013], [40.788466, -73.962164],
      [40.78839, -73.962307], [40.788333, -73.96249], [40.788307, -73.962772], [40.788335, -73.963035],
      [40.788337, -73.963229], [40.78829, -73.963661], [40.788274, -73.964022], [40.788292, -73.964235],
      [40.788349, -73.964576], [40.788349, -73.964825], [40.788325, -73.965019], [40.788288, -73.965192],
      [40.78822, -73.965406], [40.788092, -73.965673], [40.787985, -73.965828], [40.787749, -73.966063],
      [40.787537, -73.966191], [40.7874, -73.966242], [40.785346, -73.966717], [40.785127, -73.966707],
      [40.784955, -73.96658], [40.784828, -73.966432], [40.784587, -73.966097], [40.784303, -73.965533],
      [40.784142, -73.965088], [40.783987, -73.96447], [40.783929, -73.964302], [40.783823, -73.964057],
      [40.783678, -73.963809], [40.783483, -73.963569], [40.783276, -73.963383], [40.783158, -73.9633],
      [40.782901, -73.963176], [40.782612, -73.963087], [40.782469, -73.962999], [40.782358, -73.962893],
      [40.782306, -73.962816], [40.782163, -73.962538],
    ],
  },
];

/** A route for the library: its own copy of the points, a new id */
export function exampleRoute(example: RouteExample, id: string, now: number): Route {
  return { id, name: example.name, updated: now, points: example.points.map(([lat, lon]) => ({ lat, lon })) };
}
