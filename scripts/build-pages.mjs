// The site for GitHub Pages: the product page (site/) at the root and the web app under app/.
// BASE_PATH is the address of the app folder, e.g. /walkflow/app/ (the Pages workflow sets it); locally it can be /app/ for a static server in pages/.
// WALKFLOW_RELEASE is the tag of the latest release (the Pages workflow reads it from GitHub); without it the version in package.json is used.
// SITE_URL is the address of the site, e.g. https://walkflow-app.github.io/walkflow (the Pages workflow sets it); the default is the address of this project.
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { fillPage, releaseVersion, siteUrl } from './site-version.mjs';

const out = 'pages';
const version = releaseVersion(process.env.WALKFLOW_RELEASE || JSON.parse(readFileSync('package.json', 'utf8')).version);
const site = siteUrl(process.env.SITE_URL || 'https://walkflow-app.github.io/walkflow');

rmSync(out, { recursive: true, force: true });
await build({ build: { outDir: `${out}/app`, emptyOutDir: true } });
cpSync('site', out, { recursive: true });

// The pages and the sitemap of the product page (the web app in app/ is built, not templated)
const pages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (e.name === 'app' || e.name === 'img' ? [] : pages(join(dir, e.name))) : /\.(html|xml)$/.test(e.name) ? [join(dir, e.name)] : []);
for (const file of pages(out)) writeFileSync(file, fillPage(readFileSync(file, 'utf8'), { version, site }));

console.log(`Site written to ${out}/ (page at the root, app in ${out}/app/), downloads of version ${version}, address ${site}`);
