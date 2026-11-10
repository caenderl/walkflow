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
