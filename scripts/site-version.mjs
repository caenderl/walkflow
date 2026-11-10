// The version of the latest release goes into the product page when it is built, so its download links name the files of that
// release directly (Walkflow-<version>-<system>.<ext>). The pages carry {{version}} where it belongs.

/** "v0.2.0" or "0.2.0" → "0.2.0"; anything else throws, so nothing odd ends up in a link */
export function releaseVersion(tag) {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(String(tag).trim());
  if (!m) throw new Error(`Not a release version: ${JSON.stringify(tag)} (expected v1.2.3)`);
  return m[1];
}

/** Replaces {{version}}; any other {{…}} left in the page is a typo and fails the build */
export function fillVersion(html, version) {
  const out = html.replaceAll('{{version}}', version);
  const left = out.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`Unknown placeholder in the page: ${left[0]}`);
  return out;
}
