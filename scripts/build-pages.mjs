// The site for GitHub Pages: the product page (site/) at the root and the web app under app/.
// BASE_PATH is the address of the app folder, e.g. /walkflow/app/ (the Pages workflow sets it); locally it can be /app/ for a static server in pages/.
// WALKFLOW_RELEASE is the tag of the latest release (the Pages workflow reads it from GitHub); without it the version in package.json is used.
// SITE_URL is the address of the site, e.g. https://walkflow-app.github.io (the Pages workflow sets it); the default is the address of this project.
// OLD_PATH is a former folder of the site on the same host, e.g. /walkflow: its page, German page and app forward to the new address.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { fillPage, redirectPage, releaseVersion, retiredServiceWorker, siteUrl } from './site-version.mjs';

const out = 'pages';
const version = releaseVersion(process.env.WALKFLOW_RELEASE || JSON.parse(readFileSync('package.json', 'utf8')).version);
const site = siteUrl(process.env.SITE_URL || 'https://walkflow-app.github.io');

rmSync(out, { recursive: true, force: true });
await build({ build: { outDir: `${out}/app`, emptyOutDir: true } });
cpSync('site', out, { recursive: true });
// Served as it is, without Jekyll
writeFileSync(join(out, '.nojekyll'), '');
// For agents working in a clone of the site repository: everything there is replaced by the next deploy
writeFileSync(join(out, 'CLAUDE.md'), `# walkflow-app.github.io: build output, do not edit

Everything in this repository is written by the Pages workflow of
[walkflow-app/walkflow](https://github.com/walkflow-app/walkflow) (\`.github/workflows/pages.yml\`, \`scripts/build-pages.mjs\`)
and replaced, as one commit, on every deploy. A change made here is lost with the next release.

Change the product page in \`site/\` of walkflow-app/walkflow (commit type \`docs(site)\` or \`chore(site)\`), and the web app
in its \`src/\`. A ruleset lets only the deploy key push here.
`);

// The pages and the sitemap of the product page (the web app in app/ is built, not templated)
const pages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (e.name === 'app' || e.name === 'img' ? [] : pages(join(dir, e.name))) : /\.(html|xml|txt)$/.test(e.name) ? [join(dir, e.name)] : []);
for (const file of pages(out)) writeFileSync(file, fillPage(readFileSync(file, 'utf8'), { version, site }));

// The former address of the site (the project page of the repository) forwards here
const old = process.env.OLD_PATH?.replace(/^\/+|\/+$/g, '');
if (old) {
  if (!/^[A-Za-z0-9._~-]+$/.test(old)) throw new Error(`Not a usable old path: ${JSON.stringify(process.env.OLD_PATH)}`);
  for (const sub of ['', 'de/', 'app/']) {
    mkdirSync(join(out, old, sub), { recursive: true });
    writeFileSync(join(out, old, sub, 'index.html'), redirectPage(`${site}/${sub}`));
  }
  writeFileSync(join(out, old, 'app', 'sw.js'), retiredServiceWorker);
}

console.log(`Site written to ${out}/ (page at the root, app in ${out}/app/), downloads of version ${version}, address ${site}`);
