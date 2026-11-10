// Two small conveniences, both optional: the download button names the visitor's system and the matching card is marked (on a
// Mac the web app: there is no macOS app for now),
// and a first visit from a German browser lands on the German page. Nothing is sent anywhere and nothing is stored.
(() => {
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  let os = null;
  if (/android|iphone|ipad|ipod/i.test(ua)) os = null; // the installers are for computers
  else if (/mac/i.test(platform) || /Macintosh/.test(ua)) os = 'mac';
  else if (/win/i.test(platform) || /Windows/.test(ua)) os = 'windows';
  else if (/linux|x11/i.test(platform) || /Linux/.test(ua)) os = 'linux';

  if (os === 'mac') {
    // No macOS app for now (it is not notarized): on a Mac the main button opens the web app, and the card says so
    const card = document.querySelector('.dl[data-os="mac"]');
    if (card) card.classList.add('recommended');
    const main = document.getElementById('dl-main');
    if (main && main.dataset.macLabel) { main.textContent = main.dataset.macLabel; main.href = main.dataset.macHref; }
    const second = document.getElementById('dl-second');
    if (second && 'macHide' in second.dataset) second.hidden = true;
  } else if (os) {
    const card = document.querySelector('.dl[data-os="' + os + '"]');
    const main = document.getElementById('dl-main');
    if (card) {
      card.classList.add('recommended');
      if (main) {
        const name = card.querySelector('strong').textContent;
        main.textContent = (main.dataset.label || 'Download').replace('{os}', name);
      }
    }
  }

  // The German page is the one in the folder de/; ?lang=en (the language switch) keeps the English one
  const here = document.documentElement.lang;
  const asked = new URLSearchParams(location.search).get('lang');
  const german = (navigator.languages && navigator.languages[0] || navigator.language || '').toLowerCase().startsWith('de');
  if (here === 'en' && german && !asked && !/\/de\//.test(location.pathname)) location.replace('de/');
})();
