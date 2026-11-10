// The site for GitHub Pages: the product page (site/) at the root and the web app under app/.
// BASE_PATH is the address of the app folder, e.g. /walkflow/app/ (the Pages workflow sets it); locally it can be /app/ for a static server in pages/.
// WALKFLOW_RELEASE is the tag of the latest release (the Pages workflow reads it from GitHub); without it the version in package.json is used.
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { fillVersion, releaseVersion } from './site-version.mjs';

const out = 'pages';
const version = releaseVersion(process.env.WALKFLOW_RELEASE || JSON.parse(readFileSync('package.json', 'utf8')).version);

rmSync(out, { recursive: true, force: true });
await build({ build: { outDir: `${out}/app`, emptyOutDir: true } });
cpSync('site', out, { recursive: true });

// The pages of the product page (the web app in app/ is built, not templated)
const pages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (e.name === 'app' || e.name === 'img' ? [] : pages(join(dir, e.name))) : e.name.endsWith('.html') ? [join(dir, e.name)] : []);
for (const file of pages(out)) writeFileSync(file, fillVersion(readFileSync(file, 'utf8'), version));

console.log(`Site written to ${out}/ (page at the root, app in ${out}/app/), downloads of version ${version}`);
