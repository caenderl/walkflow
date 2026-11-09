// The route store in the routes view: the list of routes in the project's repository (core/store/route-index.ts), read from
// GitHub when the person opens it, never before. A route is fetched when the person picks it, compared with the hash and the
// length the list gave, read as a route package and then the person is asked before it is saved (the same question as for a
// file from outside). Everything that comes from the network is data from outside: the list is read strictly, texts are only
// ever shown as text, and none of this can reach the treadmill. Display only.

import { countryName } from '../../core/routes/country';
import { PACKAGE_MAX_CHARS } from '../../core/routes/route-package';
import { plainName } from '../../core/routes/routes';
import {
  filterRoutes, type LibraryMark, parseIndex, STORE_INDEX_MAX_CHARS, storeFacets, storeFileUrl, storeIndexUrl, storeState, verifyDownload, type StoreRoute,
} from '../../core/store/route-index';
import { fmtDistance } from '../../core/training/program';
import { lang, onLanguageChange, t } from '../../i18n/i18n';
import { button, el } from '../components/elements';
import { $, $button, $input } from '../ui';
import { flagUrl } from './flags';

export interface RouteStoreHost {
  /** The folder the store is read from; null: this build has no store, and nothing of it is shown */
  base: string | null;
  /** What of the library came from the store: tells what is new there, what is there already and what can be updated */
  library(): LibraryMark[];
  /** A route package that was downloaded and checked: the person is asked, then it is added, or `replace` (the id of a copy) is updated */
  take(file: { name: string; text: string }, opts: { storeFile: string; replace?: string }): Promise<void>;
}

const TIMEOUT_MS = 20_000;

/** The text at an address, or null: not reachable, not ok, or longer than `maxChars`. No cookies, no referrer. */
async function fetchText(url: string, maxChars: number): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > maxChars) { await reader.cancel(); return null; }
    }
    return text + decoder.decode();
  } catch {
    return null;
  }
}

export function setupRouteStore(host: RouteStoreHost) {
  const { base } = host;
  if (!base) { $('rsStore').remove(); return { refresh() { /* no store in this build */ } }; }

  const toggle = $button('rsToggle');
  const textInput = $input('rsText');
  const countrySelect = $<HTMLSelectElement>('rsCountry');
  const tagSelect = $<HTMLSelectElement>('rsTag');
  let open = false;
  let routes: StoreRoute[] | null = null;
  /** What the status line says (a function, so a change of language translates it) */
  let message: (() => string) | null = null;
  const busy = new Set<string>();

  function fillSelect(select: HTMLSelectElement, options: readonly [string, string][]) {
    const chosen = select.value;
    select.replaceChildren(...options.map(([value, text]) => el('option', { value, textContent: text })));
    select.value = options.some(([v]) => v === chosen) ? chosen : '';
  }

  function entryItem(r: StoreRoute): HTMLElement {
    const flag = r.country ? flagUrl(r.country) : null;
    const name = r.name[lang] ?? plainName(r.name) ?? r.file;
    const place = r.place && (r.place[lang] ?? plainName(r.place));
    const state = storeState(r, host.library());
    const act = state.kind === 'current'
      ? el('span', { className: 'badge rec', textContent: t.routeStore.inLibrary })
      : button(busy.has(r.file) ? t.routeStore.adding : state.kind === 'update' ? t.routeStore.update(r.revision) : t.routeStore.add, () => void take(r, state.kind === 'update' ? state.id : undefined), busy.has(r.file));
    if (state.kind !== 'current') act.classList.add('primary');
    return el('li', { className: 'wk-item' },
      el('div', { className: 'wk-info' },
        el('div', { className: 'wk-name' },
          ...(flag && r.country ? [el('img', { className: 'flag', src: flag, alt: countryName(r.country, lang), title: countryName(r.country, lang) })] : []), name),
        el('div', { className: 'rt-meta' },
          el('span', { className: 'rt-length', textContent: fmtDistance(r.length) }),
          ...(r.revision > 1 ? [el('span', { className: 'hint', textContent: t.routeStore.version(r.revision) })] : []),
          ...(place ? [el('span', { className: 'hint', textContent: place })] : []),
          ...(r.tags?.length ? [el('span', { className: 'hint', textContent: r.tags.join(', ') })] : []))),
      el('div', { className: 'wk-actions' }, act));
  }

  function render() {
    // Display only: whatever goes wrong here must not get further than this
    try {
      toggle.textContent = open ? t.routeStore.hide : t.routeStore.show;
      $('rsBody').hidden = !open;
      if (!open) return;
      const facets = storeFacets(routes ?? []);
      fillSelect(countrySelect, [['', t.routeStore.allCountries], ...facets.countries.map(c => [c.value, `${countryName(c.value, lang)} (${c.count})`] as [string, string])]);
      fillSelect(tagSelect, [['', t.routeStore.allTags], ...facets.tags.map(c => [c.value, `${c.value} (${c.count})`] as [string, string])]);
      const shown = routes ? filterRoutes(routes, { text: textInput.value, country: countrySelect.value, tag: tagSelect.value }) : [];
      $('rsList').replaceChildren(...shown.map(entryItem));
      $('rsStatus').textContent = message?.() ?? (routes && !routes.length ? t.routeStore.empty : routes && !shown.length ? t.routeStore.nothingMatches : '');
    } catch { /* the list is only what is shown */ }
  }

  async function load() {
    message = () => t.routeStore.loading;
    render();
    const text = await fetchText(storeIndexUrl(base!), STORE_INDEX_MAX_CHARS);
    if (!open) return;
    const parsed = text === null ? null : parseIndex(text);
    if (!parsed || !parsed.ok) {
      message = () => (parsed && !parsed.ok && parsed.reason === 'newer' ? t.routeStore.newer : text === null ? t.routeStore.failed : t.routeStore.invalid);
      routes = null;
    } else {
      routes = parsed.index.routes;
      message = null;
    }
    render();
  }

  async function take(r: StoreRoute, replace?: string) {
    if (busy.has(r.file)) return;
    busy.add(r.file);
    message = null;
    render();
    try {
      const text = await fetchText(storeFileUrl(base!, r.file), PACKAGE_MAX_CHARS);
      if (text === null) { message = () => t.routeStore.fileFailed; return; }
      if (!(await verifyDownload(r, text))) {
        // Most likely the list is older than the file (GitHub hands the two out from separate caches): read it again
        await load();
        message = () => t.routeStore.fileMismatch;
        return;
      }
      await host.take({ name: r.file, text }, { storeFile: r.file, ...(replace ? { replace } : {}) });
    } finally {
      busy.delete(r.file);
      render();
    }
  }

  toggle.onclick = () => {
    open = !open;
    // The list is read when it is opened for the first time, and again after a failure
    if (open && routes === null) void load(); else render();
  };
  textInput.oninput = render;
  countrySelect.onchange = render;
  tagSelect.onchange = render;
  onLanguageChange(render);
  render();
  return {
    /** The library changed (a route was added, updated or deleted): the marks in the list follow */
    refresh: render,
  };
}
