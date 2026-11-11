// Two values go into the product page when it is built: the version of the latest release (so the download links name the files
// of that release directly, Walkflow-<version>-<system>.<ext>) and the address of the site (canonical links, link previews, sitemap).
// The pages carry {{version}} and {{site}} where they belong.

/** "v0.2.0" or "0.2.0" → "0.2.0"; anything else throws, so nothing odd ends up in a link */
export function releaseVersion(tag) {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(String(tag).trim());
  if (!m) throw new Error(`Not a release version: ${JSON.stringify(tag)} (expected v1.2.3)`);
  return m[1];
}

/** The address of the site: secure, no query, no anchor, no password, no trailing slash. Anything else throws. */
export function siteUrl(url) {
  const m = /^(https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~-]+)*)\/?$/i.exec(String(url).trim());
  if (!m) throw new Error(`Not a usable site address: ${JSON.stringify(url)} (expected https://host/path)`);
  return m[1];
}

/** Replaces {{version}} and {{site}}; any other {{…}} left in the page is a typo and fails the build */
export function fillPage(text, { version, site }) {
  const out = text.replaceAll('{{version}}', version).replaceAll('{{site}}', site);
  const left = out.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`Unknown placeholder in the page: ${left[0]}`);
  return out;
}

/** A page that sends visitors of an old address on to the new one, keeping the query (e.g. ?lang=fr) and the anchor */
export function redirectPage(target) {
  const to = siteUrl(target.replace(/\/$/, '')) + (target.endsWith('/') ? '/' : '');
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Walkflow has moved</title>
<link rel="canonical" href="${to}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash)</script>
</head><body><p>Walkflow has moved to <a href="${to}">${to}</a>.</p></body></html>
`;
}

/** A service worker for an old address of the app: it clears its caches and unregisters itself, so an installed copy reaches the redirect */
export const retiredServiceWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) await caches.delete(key);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
})()));
`;
