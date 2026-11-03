// The Community view: switch it on and this device meets the others in the room of a language, sees what they share, takes what
// the person picks, and passes on what it took (docs/P2P.md). Everything that arrives is data from strangers: it is read by the
// reader of its kind, the person confirms before anything is saved, and the texts of other devices are only ever shown as text.
// None of this can reach the treadmill. Display only, so a failure here shows a message and never gets in the way of a stop.

import { countryName } from '../../core/routes/country';
import { analyzeRoute } from '../../core/routes/routes';
import { localHashes, offeredItems, readCommunityItem, type CommunityItem } from '../../core/share/community';
import type { DirectoryEntry, DirectoryFilter } from '../../core/share/directory';
import { COMMUNITY_MAX_PEERS, communityRoom } from '../../core/share/rooms';
import { fmtDistance, fmtLength, programLength } from '../../core/training/program';
import { getRouteStore } from '../../data/route-store';
import { getWorkoutStore } from '../../data/workout-store';
import { isLang, lang, LANGS, messagesFor, onLanguageChange, t, type Lang } from '../../i18n/i18n';
import type { ShareHub } from '../../net/share-hub';
import { button, el } from '../components/elements';
import { confirmDialog } from '../components/dialogs';
import { flagUrl } from '../routes/flags';
import { store } from '../store';
import { $, $button, $input } from '../ui';

const ENABLED_KEY = 'walkflow.community';
const ROOM_LANG_KEY = 'walkflow.communityLang';
const HIDDEN_KEY = 'walkflow.communityHidden';
const MAX_HIDDEN = 500;
/** Many changes to the library (a reload, a save) lead to one new offer */
const OFFER_DELAY_MS = 800;

export interface CommunityHost {
  /** Something was saved from the community: the routes and workouts views read the library again */
  libraryChanged(): void;
}

function readHidden(): string[] {
  try {
    const v: unknown = JSON.parse(store.get(HIDDEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)).slice(0, MAX_HIDDEN) : [];
  } catch { return []; }
}

export function setupCommunity(host: CommunityHost) {
  const storedLang = store.get(ROOM_LANG_KEY);
  let enabled = store.get(ENABLED_KEY) === '1';
  let roomLang: Lang = isLang(storedLang) ? storedLang : lang;
  let hub: ShareHub | null = null;
  /** Counts starts, so a start that is overtaken by a stop or a newer start does nothing */
  let generation = 0;
  let failed: string | null = null;
  const hidden = new Set(readHidden());
  /** What is already in the library, whoever offers it */
  let local = new Set<string>();
  const taking = new Set<string>();
  let message: (() => string) | null = null;
  let offerTimer: ReturnType<typeof setTimeout> | undefined;

  const kindSelect = $<HTMLSelectElement>('cmKind');
  const countrySelect = $<HTMLSelectElement>('cmCountry');
  const tagSelect = $<HTMLSelectElement>('cmTag');
  const langSelect = $<HTMLSelectElement>('cmLang');
  const textInput = $input('cmText');
  const sw = $input('cmSwitch');

  // ---------- Connection ----------
  async function start() {
    const mine = ++generation;
    failed = null;
    message = null;
    render();
    try {
      // Loaded now and not before: a person who never takes part does not load the connection
      const [{ ShareHub }, { trysteroTransport }] = await Promise.all([import('../../net/share-hub'), import('../../net/trystero-transport')]);
      if (mine !== generation) return;
      const h = new ShareHub({ transport: trysteroTransport(), room: communityRoom(roomLang), maxPeers: COMMUNITY_MAX_PEERS, items: [], hidden, onChange: render });
      await h.start();
      if (mine !== generation) { h.stop(); return; }
      hub = h;
      await rebuildOffer();
    } catch (e) {
      if (mine === generation) failed = e instanceof Error ? e.message : String(e);
    }
    render();
  }

  function stop() {
    generation++;
    clearTimeout(offerTimer);
    hub?.stop();
    hub = null;
    failed = null;
    message = null;
    render();
  }

  /** What this device offers follows the library: what the person switched on, and what was taken and is still as it arrived */
  async function rebuildOffer() {
    try {
      const routes = await (await getRouteStore()).list();
      const workouts = await (await getWorkoutStore()).list();
      local = await localHashes(routes, workouts);
      hub?.update(await offeredItems(routes, workouts, roomLang));
    } catch { /* the offer stays as it was; the next change tries again */ }
    render();
  }

  // ---------- Taking ----------
  async function take(entry: DirectoryEntry) {
    if (!hub || taking.has(entry.sha256)) return;
    taking.add(entry.sha256);
    message = null;
    render();
    try {
      const result = await hub.take(entry.sha256);
      if (!result.ok) { message = () => t.community.unavailable; return; }
      const read = await readCommunityItem(result.item.kind, result.text, Date.now());
      if (!read.ok) { message = () => (read.reason === 'newer' ? t.community.newer : t.community.invalid); return; }
      if (!(await confirm(read))) return;
      await save(read);
    } catch (e) {
      message = () => t.community.failedSave(e instanceof Error ? e.message : String(e));
    } finally {
      taking.delete(entry.sha256);
      render();
    }
  }

  /** What arrived is shown as it was read, not as it was announced: the name and the size of the file itself */
  function confirm(read: Extract<CommunityItem, { ok: true }>): Promise<boolean> {
    if (read.kind === 'route') {
      const summary = fmtDistance(analyzeRoute(read.route).total);
      return confirmDialog(t.community.takeRouteTitle, [t.community.takeText(read.route.names?.[lang] ?? read.route.name, summary)], t.community.takeConfirm);
    }
    const summary = t.program.summary(read.workout.steps.length, fmtLength(programLength(read.workout.steps)));
    return confirmDialog(t.community.takeWorkoutTitle, [t.community.takeText(read.workout.names?.[lang] ?? read.workout.name, summary)], t.community.takeConfirm);
  }

  async function save(read: Extract<CommunityItem, { ok: true }>) {
    if (read.kind === 'route') {
      await (await getRouteStore()).put(read.route);
      const name = read.route.names?.[lang] ?? read.route.name;
      message = () => t.community.saved(name);
    } else {
      await (await getWorkoutStore()).put(read.workout);
      const name = read.workout.names?.[lang] ?? read.workout.name;
      message = () => t.community.saved(name);
    }
    host.libraryChanged();
    await rebuildOffer();
  }

  // ---------- Hiding ----------
  function persistHidden() {
    store.set(HIDDEN_KEY, JSON.stringify([...hidden].slice(-MAX_HIDDEN)));
  }

  function hide(sha256: string) {
    hidden.add(sha256);
    hub?.directory.hide(sha256);
    persistHidden();
    render();
  }

  function unhideAll() {
    for (const h of [...hidden]) { hidden.delete(h); hub?.directory.unhide(h); }
    persistHidden();
    render();
  }

  // ---------- Display ----------
  function filter(): DirectoryFilter {
    return {
      ...(kindSelect.value ? { kind: kindSelect.value as 'route' | 'workout' } : {}),
      ...(countrySelect.value ? { country: countrySelect.value } : {}),
      ...(tagSelect.value ? { tag: tagSelect.value } : {}),
      text: textInput.value,
    };
  }

  /** The options of a select, keeping the chosen one if it is still there */
  function fillSelect(select: HTMLSelectElement, options: readonly [string, string][]) {
    const chosen = select.value;
    select.replaceChildren(...options.map(([value, text]) => el('option', { value, textContent: text })));
    select.value = options.some(([v]) => v === chosen) ? chosen : '';
  }

  function renderFilters() {
    const facets = hub?.directory.facets();
    fillSelect(kindSelect, [
      ['', t.community.allKinds],
      ['route', `${t.history.tagRoute} (${facets?.kinds.route ?? 0})`],
      ['workout', `${t.history.tagWorkout} (${facets?.kinds.workout ?? 0})`],
    ]);
    fillSelect(countrySelect, [['', t.community.allCountries], ...(facets?.countries ?? []).map(c => [c.value, `${countryName(c.value, lang)} (${c.count})`] as [string, string])]);
    fillSelect(tagSelect, [['', t.community.allTags], ...(facets?.tags ?? []).map(c => [c.value, `${c.value} (${c.count})`] as [string, string])]);
    fillSelect(langSelect, LANGS.map(l => [l, messagesFor(l).name] as [string, string]));
    langSelect.value = roomLang;
  }

  function entryItem(e: DirectoryEntry): HTMLElement {
    const flag = e.country ? flagUrl(e.country) : null;
    const have = local.has(e.sha256);
    const busy = taking.has(e.sha256);
    const take$ = button(busy ? t.community.taking : t.community.take, () => void take(e), busy);
    take$.classList.add('primary');
    return el('li', { className: 'wk-item' },
      el('div', { className: 'wk-info' },
        el('div', { className: 'wk-name' },
          ...(flag && e.country ? [el('img', { className: 'flag', src: flag, alt: countryName(e.country, lang), title: countryName(e.country, lang) })] : []),
          e.name, ' ', el('span', { className: 'badge', textContent: e.kind === 'route' ? t.history.tagRoute : t.history.tagWorkout })),
        el('div', { className: 'rt-meta' },
          ...(e.place ? [el('span', { className: 'hint', textContent: e.place })] : []),
          el('span', { className: 'hint', textContent: t.community.size(e.chars) }),
          el('span', { className: 'hint', textContent: t.community.devices(e.peers.length) }),
          ...(e.tags?.length ? [el('span', { className: 'hint', textContent: e.tags.join(', ') })] : []))),
      el('div', { className: 'wk-actions' },
        have ? el('span', { className: 'badge rec', textContent: t.community.have }) : take$,
        button(t.community.hide, () => hide(e.sha256))));
  }

  function render() {
    // Display only: whatever goes wrong here must not get further than this
    try {
      sw.checked = enabled;
      $('cmFinder').hidden = !enabled;
      const peers = hub?.peerCount ?? 0;
      const state = !enabled ? t.community.off
        : failed !== null ? t.community.failed(failed)
        : !hub ? t.community.connecting
        : peers === 0 ? t.community.alone : t.community.connected(peers);
      $('cmStatus').textContent = [state, message?.()].filter(Boolean).join(' ');
      if (!enabled) return;
      renderFilters();
      const entries = hub?.directory.list(filter()) ?? [];
      $('cmList').replaceChildren(...entries.map(entryItem));
      const empty = $('cmEmpty');
      empty.hidden = entries.length > 0 || !hub;
      empty.textContent = (hub?.directory.size ?? 0) === 0 ? t.community.nothingYet : t.community.nothingMatches;
      const unhide = $button('cmUnhide');
      unhide.hidden = hidden.size === 0;
      unhide.textContent = t.community.unhide(hidden.size);
    } catch { /* the view is only what is shown */ }
  }

  // ---------- Events ----------
  sw.onchange = () => {
    enabled = sw.checked;
    store.set(ENABLED_KEY, enabled ? '1' : '0');
    if (enabled) void start(); else stop();
  };
  langSelect.onchange = () => {
    if (!isLang(langSelect.value)) return;
    roomLang = langSelect.value;
    store.set(ROOM_LANG_KEY, roomLang);
    // Another language is another room
    if (enabled) { stop(); void start(); }
  };
  for (const select of [kindSelect, countrySelect, tagSelect]) select.onchange = render;
  textInput.oninput = render;
  $button('cmUnhide').onclick = unhideAll;
  onLanguageChange(render);

  render();
  if (enabled) void start();

  return {
    /** The library changed (saved, deleted, switched on or off): the offer is made again, after a short pause */
    libraryChanged() {
      if (!enabled) return;
      clearTimeout(offerTimer);
      offerTimer = setTimeout(() => void rebuildOffer(), OFFER_DELAY_MS);
    },
  };
}
