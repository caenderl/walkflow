// The site for GitHub Pages: the product page (site/) at the root and the web app under app/.
// BASE_PATH is the address of the app folder, e.g. /walkflow/app/ (the Pages workflow sets it); locally it can be /app/ for a static server in pages/.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'vite';

const out = 'pages';
rmSync(out, { recursive: true, force: true });
await build({ build: { outDir: `${out}/app`, emptyOutDir: true } });
cpSync('site', out, { recursive: true });
console.log(`Site written to ${out}/ (page at the root, app in ${out}/app/)`);
