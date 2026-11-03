// Example routes that come with the app, so the routes view is not empty on the first start. Each one is put into the
// person's own library once (with a new id, like a GPX import) and is an ordinary route from then on: it can be
// deleted, and a deleted one does not come back.
// Track data is from OpenStreetMap, so it carries the attribution the licence asks for. A track in OpenStreetMap has no
// elevations, so these routes have none either. Where OpenStreetMap has no single way for the loop (the three after Central
// Park), the track was computed along footpaths and streets of OpenStreetMap through points on the loop; the comment at
// each example says what it follows.

import type { Lang } from './i18n';
import { analyzeRoute, type Route } from './routes';

export interface RouteExample {
  key: string;
  /** The plain name: the English one */
  name: string;
  names: Record<Lang, string>;
  place: Record<Lang, string>;
  /** ISO 3166-1 alpha-2 */
  country: string;
  /** Walking speed in km/h; the duration of the route follows from it */
  defaultSpeed: number;
  /** A line or two about the route, in each language of the app. The route keeps only the key; the text is shown in the language of the app (routeDescription). */
  description: Record<Lang, string>;
  /** Texts this example was saved with in earlier versions, so a copy that still has one counts as unchanged */
  previousDescriptions: readonly string[];
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
    names: { en: 'Central Park Reservoir Loop', de: 'Central-Park-Reservoir-Runde', fr: 'Tour du réservoir de Central Park' },
    place: { en: 'New York, USA', de: 'New York, USA', fr: 'New York, États-Unis' },
    country: 'US',
    defaultSpeed: 4,
    description: {
      en: 'The Stephanie and Fred Shuman Running Track, 2.54 km (1.58 miles) around the Jacqueline Kennedy Onassis Reservoir in Central Park, between 86th and 96th Street. The reservoir was built from 1858 to 1862 and taken out of service as a water supply in 1993. It was renamed in 1994 after Jacqueline Kennedy Onassis, who jogged here.',
      de: 'Die Stephanie and Fred Shuman Running Track, 2,54 km (1,58 Meilen) rund um das Jacqueline Kennedy Onassis Reservoir im Central Park, zwischen der 86. und der 96. Straße. Das Becken wurde von 1858 bis 1862 gebaut und 1993 als Wasserspeicher außer Betrieb genommen. 1994 wurde es nach Jacqueline Kennedy Onassis benannt, die hier joggte.',
      fr: 'Le Stephanie and Fred Shuman Running Track, 2,54 km (1,58 mile) autour du réservoir Jacqueline Kennedy Onassis, dans Central Park, entre la 86e et la 96e Rue. Le réservoir a été construit de 1858 à 1862 et mis hors service comme réserve d’eau en 1993. Il porte depuis 1994 le nom de Jacqueline Kennedy Onassis, qui y faisait son jogging.',
    },
    previousDescriptions: [
      'The well-known loop around the Jacqueline Kennedy Onassis Reservoir in Central Park, New York, about 2.5 km.',
      'Die bekannte Runde um das Jacqueline Kennedy Onassis Reservoir im Central Park in New York, rund 2,5 km.',
      'Le célèbre tour du réservoir Jacqueline Kennedy Onassis dans Central Park, à New York, environ 2,5 km.',
    ],
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
  {
    key: 'hamburg-aussenalster',
    name: 'Außenalster Loop',
    names: { en: 'Außenalster Loop', de: 'Außenalster-Runde', fr: 'Tour de l’Außenalster' },
    place: { en: 'Hamburg, Germany', de: 'Hamburg, Deutschland', fr: 'Hambourg, Allemagne' },
    country: 'DE',
    defaultSpeed: 4,
    description: {
      en: 'The Außenalster is the larger of the two artificial lakes the Alster river forms in Hamburg: 1.64 km² and on average only about 2.5 m deep. Almost all of its banks are public, and the path around the lake is popular with joggers.',
      de: 'Die Außenalster ist der größere der beiden künstlichen Seen, die die Alster in Hamburg bildet: 1,64 km² groß und im Mittel nur etwa 2,5 m tief. Fast alle Ufer sind öffentlich zugänglich, und der Weg um den See ist bei Joggern beliebt.',
      fr: 'L’Außenalster est le plus grand des deux lacs artificiels que forme l’Alster à Hambourg : 1,64 km² et seulement environ 2,5 m de profondeur en moyenne. Presque toutes ses rives sont publiques, et le chemin qui en fait le tour est très prisé des joggeurs.',
    },
    previousDescriptions: [],
    // Computed along footpaths and streets near the shore of the Außenalster (OpenStreetMap lake outline 51218), simplified to within 1.5 m
    source: OSM,
    points: [
      [53.557064, 9.997940], [53.557282, 9.997081], [53.557402, 9.996742], [53.557621, 9.996380],
      [53.557639, 9.996223], [53.557738, 9.995851], [53.558011, 9.995118], [53.558077, 9.994966],
      [53.558349, 9.994528], [53.558428, 9.994513], [53.558754, 9.994604], [53.558744, 9.994651],
      [53.558771, 9.994812], [53.558826, 9.994846], [53.558912, 9.995399], [53.558992, 9.995719],
      [53.559121, 9.995887], [53.559272, 9.995988], [53.559197, 9.996278], [53.559404, 9.996418],
      [53.559433, 9.996299], [53.559452, 9.996312], [53.559492, 9.996129], [53.560850, 9.996997],
      [53.561050, 9.997202], [53.561365, 9.997407], [53.561470, 9.996961], [53.562355, 9.997487],
      [53.562654, 9.997535], [53.562675, 9.997573], [53.563320, 9.997649], [53.563628, 9.997761],
      [53.564049, 9.998039], [53.564417, 9.998394], [53.564573, 9.998796], [53.564732, 9.999107],
      [53.564994, 9.999431], [53.565798, 10.000033], [53.565850, 10.000041], [53.566363, 10.000657],
      [53.566557, 10.000845], [53.566897, 10.001026], [53.567312, 10.001096], [53.567477, 10.001069],
      [53.567509, 10.001276], [53.572609, 9.999797], [53.573808, 9.999610], [53.574247, 9.999563],
      [53.575785, 9.999725], [53.576510, 9.999857], [53.576591, 9.999941], [53.576762, 10.000017],
      [53.577486, 9.999837], [53.577597, 9.999772], [53.577729, 9.999565], [53.577882, 10.000102],
      [53.578658, 9.999530], [53.579055, 9.999005], [53.579168, 9.998777], [53.579201, 9.998626],
      [53.579271, 9.998507], [53.579508, 9.998680], [53.579708, 9.998938], [53.580132, 9.999565],
      [53.580162, 9.999676], [53.580315, 9.999880], [53.580511, 10.000242], [53.580620, 10.000520],
      [53.580737, 10.001037], [53.580791, 10.001492], [53.580792, 10.001884], [53.580699, 10.003054],
      [53.580663, 10.003146], [53.580631, 10.003367], [53.580648, 10.003410], [53.580449, 10.004589],
      [53.580053, 10.006472], [53.579626, 10.008122], [53.579659, 10.008286], [53.578353, 10.009269],
      [53.578416, 10.009480], [53.578393, 10.009553], [53.578304, 10.009661], [53.578234, 10.009609],
      [53.575558, 10.011440], [53.575535, 10.011347], [53.571497, 10.014114], [53.571440, 10.014028],
      [53.571253, 10.013939], [53.571088, 10.013812], [53.570836, 10.013486], [53.570681, 10.013111],
      [53.570590, 10.012762], [53.570476, 10.012834], [53.570185, 10.013786], [53.569804, 10.013411],
      [53.569732, 10.013627], [53.569734, 10.013786], [53.569628, 10.014124], [53.568965, 10.013505],
      [53.568916, 10.013633], [53.568830, 10.013558], [53.568694, 10.013946], [53.568597, 10.014039],
      [53.568016, 10.015033], [53.567719, 10.015359], [53.567658, 10.015495], [53.567568, 10.015588],
      [53.567540, 10.015800], [53.567474, 10.015987], [53.567422, 10.016065], [53.567051, 10.016223],
      [53.566117, 10.016435], [53.566008, 10.016528], [53.566035, 10.016847], [53.565236, 10.017014],
      [53.565220, 10.016739], [53.565130, 10.016731], [53.565007, 10.016329], [53.564872, 10.016059],
      [53.564970, 10.016089], [53.564872, 10.016059], [53.564770, 10.015896], [53.564767, 10.015931],
      [53.564692, 10.015852], [53.563877, 10.015550], [53.563788, 10.015650], [53.563731, 10.015624],
      [53.563508, 10.015910], [53.563298, 10.015732], [53.562947, 10.015247], [53.562978, 10.015186],
      [53.563099, 10.015356], [53.563099, 10.015238], [53.563030, 10.015105], [53.562852, 10.014898],
      [53.562538, 10.014611], [53.562048, 10.014246], [53.561621, 10.013700], [53.561165, 10.012947],
      [53.561006, 10.012853], [53.560906, 10.012739], [53.560524, 10.012190], [53.560440, 10.011936],
      [53.560422, 10.011790], [53.560419, 10.011154], [53.560260, 10.010637], [53.560126, 10.010331],
      [53.559786, 10.010661], [53.558663, 10.007819], [53.558861, 10.007590], [53.558602, 10.006768],
      [53.558272, 10.005929], [53.558084, 10.005285], [53.557717, 10.004309], [53.557596, 10.003516],
      [53.557548, 10.000882], [53.557604, 10.000099], [53.557643, 9.999893], [53.557597, 9.999040],
      [53.557762, 9.998545], [53.557497, 9.998326], [53.557302, 9.998364], [53.557241, 9.998325],
      [53.557145, 9.998211], [53.557126, 9.998148], [53.557084, 9.998126], [53.557011, 9.998381],
      [53.557064, 9.997940],
    ],
  },
  {
    key: 'vienna-ringstrasse',
    name: 'Vienna Ringstraße Loop',
    names: { en: 'Vienna Ringstraße Loop', de: 'Wiener-Ringstraße-Runde', fr: 'Tour du Ring de Vienne' },
    place: { en: 'Vienna, Austria', de: 'Wien, Österreich', fr: 'Vienne, Autriche' },
    country: 'AT',
    defaultSpeed: 4,
    description: {
      en: 'The Ringstraße is a grand boulevard around Vienna’s Innere Stadt, built where the city walls once stood: begun in 1857 on the order of Emperor Franz Joseph I and opened in 1865. The loop closes along the Franz-Josefs-Kai by the Donaukanal.',
      de: 'Die Ringstraße ist ein Boulevard rund um die Wiener Innere Stadt, gebaut dort, wo einst die Stadtmauern standen: 1857 auf Anordnung von Kaiser Franz Joseph I. begonnen und 1865 eröffnet. Die Runde schließt sich über den Franz-Josefs-Kai am Donaukanal.',
      fr: 'Le Ring est un grand boulevard autour de l’Innere Stadt de Vienne, construit à l’emplacement des anciens remparts : commencé en 1857 sur ordre de l’empereur François-Joseph Ier et inauguré en 1865. La boucle se ferme par le Franz-Josefs-Kai, le long du Donaukanal.',
    },
    previousDescriptions: [],
    // Computed along footpaths and streets through the Ringstraße (OpenStreetMap ways of Universitätsring to Stubenring) and the Franz-Josefs-Kai, simplified to within 1.5 m
    source: OSM,
    points: [
      [48.214552, 16.363800], [48.214520, 16.363731], [48.214437, 16.363820], [48.214032, 16.362932],
      [48.213867, 16.362838], [48.213791, 16.362669], [48.213656, 16.362558], [48.213653, 16.362462],
      [48.213444, 16.361982], [48.213358, 16.361870], [48.212438, 16.361577], [48.212445, 16.361519],
      [48.211091, 16.361110], [48.211097, 16.361044], [48.210941, 16.361004], [48.210765, 16.360886],
      [48.210502, 16.360797], [48.210558, 16.360337], [48.208638, 16.359746], [48.208505, 16.359730],
      [48.208493, 16.359814], [48.206974, 16.359393], [48.206938, 16.359484], [48.206893, 16.359433],
      [48.206824, 16.359620], [48.206558, 16.359980], [48.206503, 16.359919], [48.206438, 16.359942],
      [48.206312, 16.360065], [48.205137, 16.361651], [48.205429, 16.362033], [48.205253, 16.362272],
      [48.205311, 16.362356], [48.204069, 16.363993], [48.204002, 16.363965], [48.203713, 16.364357],
      [48.203755, 16.364413], [48.203416, 16.365920], [48.203324, 16.366006], [48.203287, 16.366153],
      [48.203295, 16.366257], [48.203344, 16.366286], [48.202976, 16.367941], [48.202628, 16.367786],
      [48.202570, 16.368068], [48.202436, 16.368084], [48.202191, 16.369166], [48.202146, 16.369690],
      [48.202075, 16.369697], [48.201403, 16.372770], [48.201618, 16.372871], [48.201482, 16.373513],
      [48.201489, 16.373693], [48.201541, 16.373922], [48.201728, 16.373816], [48.201953, 16.374678],
      [48.201993, 16.374769], [48.202896, 16.375682], [48.202767, 16.375968], [48.202855, 16.376059],
      [48.202985, 16.375777], [48.204533, 16.377352], [48.204463, 16.377514], [48.204999, 16.378067],
      [48.205070, 16.377913], [48.208354, 16.381279], [48.208905, 16.381819], [48.209108, 16.381917],
      [48.209108, 16.381840], [48.209728, 16.380061], [48.211274, 16.380113], [48.211283, 16.379885],
      [48.211577, 16.379910], [48.211720, 16.378891], [48.211798, 16.378597], [48.211947, 16.378320],
      [48.212015, 16.378023], [48.212179, 16.377528], [48.212204, 16.377430], [48.212212, 16.376996],
      [48.212407, 16.376563], [48.212314, 16.376490], [48.212436, 16.376211], [48.212884, 16.375466],
      [48.213314, 16.374922], [48.213249, 16.374683], [48.213189, 16.374569], [48.213257, 16.374508],
      [48.213015, 16.374131], [48.212918, 16.374015], [48.212799, 16.373945], [48.212969, 16.372889],
      [48.212987, 16.372879], [48.213025, 16.372683], [48.212957, 16.372643], [48.213578, 16.370270],
      [48.213512, 16.370245], [48.213621, 16.369972], [48.213393, 16.369480], [48.213277, 16.369335],
      [48.213338, 16.369238], [48.214514, 16.368020], [48.214628, 16.367325], [48.214314, 16.366623],
      [48.214391, 16.366539], [48.214357, 16.366387], [48.214313, 16.366301], [48.215174, 16.365416],
      [48.214437, 16.363820], [48.214520, 16.363731], [48.214552, 16.363800],
    ],
  },
  {
    key: 'tokyo-imperial-palace',
    name: 'Imperial Palace Loop',
    names: { en: 'Imperial Palace Loop', de: 'Kaiserpalast-Runde Tokio', fr: 'Tour du palais impérial de Tokyo' },
    place: { en: 'Tokyo, Japan', de: 'Tokio, Japan', fr: 'Tokyo, Japon' },
    country: 'JP',
    defaultSpeed: 4,
    description: {
      en: 'The streets around the grounds of the Imperial Palace in Chiyoda, Tokyo. The palace is the main residence of the emperor of Japan and stands on the site of the former Edo Castle.',
      de: 'Die Straßen rund um das Gelände des Kaiserpalasts in Chiyoda, Tokio. Der Palast ist die Hauptresidenz des japanischen Kaisers und steht an der Stelle der früheren Burg Edo.',
      fr: 'Les rues autour des terrains du palais impérial, dans l’arrondissement de Chiyoda à Tokyo. Le palais est la résidence principale de l’empereur du Japon et se trouve sur le site de l’ancien château d’Edo.',
    },
    previousDescriptions: [],
    // Computed along footpaths and streets next to the Uchibori-dori (OpenStreetMap ways named 内堀通り) around the palace grounds, simplified to within 1.5 m
    source: OSM,
    points: [
      [35.693532, 139.753408], [35.692797, 139.755273], [35.692743, 139.755367], [35.692052, 139.755786],
      [35.691721, 139.755940], [35.691394, 139.756021], [35.691134, 139.756172], [35.690868, 139.756285],
      [35.690728, 139.756367], [35.690660, 139.756443], [35.690623, 139.756237], [35.690580, 139.756260],
      [35.690240, 139.758525], [35.690131, 139.759054], [35.690224, 139.759082], [35.690131, 139.759054],
      [35.689958, 139.759831], [35.689195, 139.760758], [35.689209, 139.760841], [35.688362, 139.761119],
      [35.687289, 139.761517], [35.687111, 139.761503], [35.687129, 139.761403], [35.685855, 139.761064],
      [35.685317, 139.760816], [35.685092, 139.760599], [35.684692, 139.760343], [35.683211, 139.759837],
      [35.679294, 139.757314], [35.679261, 139.757408], [35.676932, 139.755952], [35.676996, 139.755788],
      [35.676986, 139.755733], [35.677010, 139.755643], [35.677955, 139.753429], [35.677959, 139.753315],
      [35.677884, 139.753312], [35.677878, 139.753151], [35.677904, 139.753145], [35.677935, 139.753200],
      [35.677959, 139.753141], [35.677937, 139.753091], [35.677596, 139.753166], [35.677563, 139.752932],
      [35.677537, 139.752903], [35.677278, 139.750927], [35.677266, 139.750704], [35.677291, 139.750653],
      [35.677257, 139.750141], [35.677348, 139.750138], [35.677344, 139.750238], [35.677379, 139.750243],
      [35.677474, 139.749574], [35.677557, 139.749354], [35.677657, 139.749179], [35.678164, 139.748630],
      [35.678611, 139.748293], [35.679012, 139.747908], [35.679350, 139.747511], [35.679476, 139.747335],
      [35.679558, 139.747155], [35.679860, 139.746178], [35.679971, 139.745991], [35.680118, 139.745865],
      [35.680089, 139.745786], [35.680129, 139.745746], [35.681941, 139.744657], [35.682411, 139.744410],
      [35.682767, 139.744302], [35.683328, 139.744200], [35.683626, 139.744194], [35.684150, 139.744247],
      [35.684183, 139.744036], [35.685295, 139.744294], [35.687948, 139.745011], [35.687913, 139.745196],
      [35.687092, 139.744981], [35.688253, 139.745275], [35.688241, 139.745360], [35.689141, 139.745559],
      [35.689145, 139.745579], [35.689261, 139.745597], [35.689284, 139.745570], [35.689851, 139.745718],
      [35.691327, 139.746039], [35.691359, 139.745821], [35.692270, 139.746000], [35.692829, 139.746076],
      [35.694122, 139.746333], [35.694140, 139.746295], [35.694217, 139.746616], [35.694250, 139.746631],
      [35.694818, 139.748577], [35.694835, 139.748568], [35.695012, 139.749280], [35.695269, 139.751198],
      [35.695261, 139.751241], [35.695045, 139.751304], [35.694442, 139.751705], [35.693714, 139.752925],
      [35.693755, 139.752960], [35.693532, 139.753408],
    ],
  },
];

/** A route for the library: its own copy of the points, a new id. Its description is the example's, in the language of the app, until the person writes their own. */
export function exampleRoute(example: RouteExample, id: string, now: number): Route {
  return { id, name: example.name, updated: now, country: example.country, defaultSpeed: example.defaultSpeed, example: example.key, points: example.points.map(([lat, lon]) => ({ lat, lon })) };
}

/** The translations a route shows: those of its example, or those it brought with a package */
function textsOf(r: Route, examples: readonly RouteExample[]): Readonly<Record<string, string>> | null {
  if (r.example) return examples.find(e => e.key === r.example)?.description ?? null;
  return r.texts ?? null;
}

/** The name of a route in the language of the app: an example's or a package's names, else its plain name */
export function routeName(r: Route, lang: Lang, examples: readonly RouteExample[] = ROUTE_EXAMPLES): string {
  const names = r.names ?? (r.example ? examples.find(e => e.key === r.example)?.names : undefined);
  return (names && (names[lang] ?? names.en)) || r.name;
}

/** The language of the app, else English, else any language there is */
function pickText(texts: Readonly<Record<string, string>>, lang: Lang): { text: string; lang: string } | null {
  const key = [lang, 'en', ...Object.keys(texts).sort()].find(k => texts[k]);
  return key ? { text: texts[key]!, lang: key } : null;
}

/**
 * The text to show for a route. A text the person wrote is shown as it is (it has no language we know); the text of an
 * example route or an installed package follows the language of the app, and says which one it is, for the lang
 * attribute of the element.
 */
export function routeDescription(r: Route, lang: Lang, examples: readonly RouteExample[] = ROUTE_EXAMPLES): { text: string; lang: string | null } | null {
  if (r.description) return { text: r.description, lang: null };
  const texts = textsOf(r, examples);
  return texts ? pickText(texts, lang) : null;
}

/**
 * What to store after the description was edited. A route with translations (an example, a package) whose field was
 * left as shown keeps them (its text keeps following the language); any other text, or an empty one, is the person's
 * own from then on.
 */
export function descriptionAfterEdit(r: Route, typed: string, lang: Lang, examples: readonly RouteExample[] = ROUTE_EXAMPLES): { description?: string; example?: string; texts?: Record<string, string> } {
  const shown = !r.description ? routeDescription(r, lang, examples) : null;
  if (shown && typed.trim() === shown.text.trim()) return r.example ? { example: r.example } : { texts: r.texts! };
  return typed.trim() ? { description: typed } : {};
}

/**
 * A route in the library that is a copy of an example made before routes knew their example (the person copied it by
 * hand, or an earlier version saved it with a text): it becomes that example, so its text follows the language and it
 * has the example's walking speed. Recognised by name, start and length. A text the person wrote stays; one speed the
 * person has set stays. null = nothing to change.
 */
export function adoptExample(r: Route, example: RouteExample): Route | null {
  if (r.example !== undefined || r.name !== example.name) return null;
  const first = example.points[0]!, start = r.points[0]!;
  if (Math.abs(start.lat - first[0]) > 0.001 || Math.abs(start.lon - first[1]) > 0.001) return null;
  const total = analyzeRoute(exampleRoute(example, r.id, r.updated)).total;
  if (Math.abs(analyzeRoute(r).total - total) > total * 0.02) return null;
  const own = r.description !== undefined && ![...Object.values(example.description), ...example.previousDescriptions].includes(r.description);
  const { description: _old, ...rest } = r;
  return { ...rest, ...(own ? { description: r.description } : {}), example: example.key, defaultSpeed: r.defaultSpeed ?? example.defaultSpeed };
}

/** localStorage key: the keys of the examples that were put into the library already */
export const SEEDED_STORAGE_KEY = 'walkflow.exampleRoutes';

/** The stored list of keys; anything else (missing, damaged) counts as empty */
export function readSeeded(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
}

/** The examples to put into the library now: not seeded before, and not already there under the same name */
export function examplesToSeed(seeded: readonly string[], existingNames: readonly string[], examples: readonly RouteExample[] = ROUTE_EXAMPLES): RouteExample[] {
  return examples.filter(e => !seeded.includes(e.key) && !existingNames.includes(e.name));
}

/** The list to store afterwards: every current example counts as seeded, whether it was added or already there */
export function markSeeded(seeded: readonly string[], examples: readonly RouteExample[] = ROUTE_EXAMPLES): string[] {
  return [...new Set([...seeded, ...examples.map(e => e.key)])];
}
