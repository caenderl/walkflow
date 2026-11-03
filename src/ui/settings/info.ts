// The texts of the Info tab in the settings and the footer: what the app is, what it was tested with, where the source is.
// Filled in from the texts and the build settings; called at the start and after a language change.

import { t } from '../../i18n/i18n';
import { BUILD_TARGET, DONATION_URL, GITHUB_REPO, APP_VERSION } from '../../platform/config';
import { $ } from '../ui';

export function renderInfo() {
  const ul = $('infoDisclaimer');
  ul.replaceChildren(...t.disclaimer.points.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  $('infoTested').textContent = t.info.tested(t.info.testedDevice, t.info.testedFeatures, t.info.untestedFeatures);
  $('infoAffiliation').textContent = t.info.notAffiliated;
  $('footerVersion').textContent = t.info.footer(APP_VERSION);

  const source = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : '';
  $('infoSource').replaceChildren(...(source ? [t.info.source, link(source, source.replace('https://', ''))] : []));
  const links: HTMLElement[] = [];
  if (BUILD_TARGET === 'web') links.push(link(t.info.imprintHref, t.info.imprint), link(t.info.privacyHref, t.info.privacyLink));
  if (source) links.push(link(source, t.info.sourceLink));
  // Web build only, and only if configured. Nothing in return, no feature depends on it.
  if (BUILD_TARGET === 'web' && DONATION_URL) links.push(link(DONATION_URL, t.info.donation));
  $('footerLinks').replaceChildren(...links.flatMap((a, i) => (i ? [' · ', a] : [a])));
}

function link(href: string, text: string) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  return a;
}
