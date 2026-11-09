// The route store (docs/ROUTE-STORE.md): store/routes/*.walkflow are route packages, store/index.json names them.
//   npm run store:build   writes store/index.json from the files
//   npm run store:check   fails if a file is not a valid package or the index is not what the build would write (CI runs it)
// The logic is src/core/store/route-index.ts; it is bundled on the fly because it is TypeScript with imports Node cannot resolve.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const check = process.argv.includes('--check');
const DIR = 'store/routes';
const INDEX = 'store/index.json';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/core/store/route-index.ts';",
      "export { readPackage } from './src/core/routes/route-package.ts';",
      "export { analyzeRoute } from './src/core/routes/routes.ts';",
      "export { placeWaypoints, WAYPOINT_MAX_OFFSET } from './src/core/routes/route-waypoints.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'warning',
});
const { entryFromPackage, serializeIndex, parseIndex, STORE_MAX_ROUTES, readPackage, analyzeRoute, placeWaypoints, WAYPOINT_MAX_OFFSET } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const files = readdirSync(DIR).filter(f => !f.startsWith('.')).sort();
const problems = [];
const entries = [];
const seen = new Map();
for (const file of files) {
  const text = readFileSync(`${DIR}/${file}`, 'utf8');
  const r = await entryFromPackage(file, text);
  if (!r.ok) { problems.push(`${DIR}/${file}: ${r.reason === 'fileName' ? 'the file name must be lower-case letters, digits, "." "_" "-" and end in .walkflow' : `not a valid route package (${r.reason})`}`); continue; }
  // A public repository: whoever contributes a route says under which terms it may be used
  if (!String(JSON.parse(text).license ?? '').trim()) problems.push(`${DIR}/${file}: the package needs a "license" (e.g. "CC0-1.0"), see store/README.md`);
  // Every waypoint has to be on the route, or the app would leave it out
  const { route } = readPackage(text, 'x', 0);
  const lost = (route.waypoints?.length ?? 0) - placeWaypoints(route, analyzeRoute(route)).length;
  if (lost > 0) problems.push(`${DIR}/${file}: ${lost} waypoint${lost === 1 ? ' is' : 's are'} more than ${WAYPOINT_MAX_OFFSET} m from the route`);
  if (seen.has(r.entry.sha256)) problems.push(`${DIR}/${file}: the same file as ${seen.get(r.entry.sha256)}`);
  seen.set(r.entry.sha256, file);
  entries.push(r.entry);
}
if (entries.length > STORE_MAX_ROUTES) problems.push(`more than ${STORE_MAX_ROUTES} routes`);

const indexText = serializeIndex(entries);
if (!parseIndex(indexText).ok) problems.push('the index written for these files would not be accepted by the app');

if (check) {
  const have = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : null;
  if (have !== indexText) problems.push(`${INDEX} is not up to date: run "npm run store:build" and commit the result`);
}
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
if (!check) writeFileSync(INDEX, indexText);
console.log(`${check ? 'Store is in order' : `Wrote ${INDEX}`}: ${entries.length} route${entries.length === 1 ? '' : 's'}`);
