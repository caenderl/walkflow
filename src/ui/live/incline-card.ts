// The incline in the training view: the card with the slider or the level buttons, the figure for the settings ("incline
// levels") and what the treadmill said about the incline. It asks the treadmill (features and range) and shows only what it
// supports; the value that is sent is always inside the range the treadmill reported.

import { cmdSetInclination, type Features, type Range } from '../../core/protocol/ftms';
import { clampIncline, inclineSupport, levelsFromCount, parseLevelCount, type InclineSupport } from '../../core/safety/incline';
import { t } from '../../i18n/i18n';
import { $, $input, log } from '../ui';
import { store } from '../store';

const INCLINE_LEVELS_KEY = 'walkflow.inclineLevelCount';
/** 'no' once a real treadmill reported no incline: then nothing about the incline is shown */
const INCLINE_SEEN_KEY = 'walkflow.inclineSupport';

export interface InclineCardHost {
  /** Sends a command to the treadmill; false if there is no connection or it failed */
  send(bytes: Uint8Array): Promise<boolean>;
  /** The page shows a connection (the buttons can be pressed) */
  uiConnected(): boolean;
}

export function setupInclineCard(host: InclineCardHost) {
  let range: Range | null = null;
  let shown = 0;
  let support: InclineSupport = { settable: false, reported: false };
  /** How many levels the person says the treadmill's incline has; 0 = the slider over the range the treadmill reports */
  let levelCount = parseLevelCount(store.get(INCLINE_LEVELS_KEY));

  /** The setting "incline levels": the slider and the number beside it */
  function renderLevelCountField() {
    $input('inclLevelsInput').value = String(levelCount);
    $('inclLevelsValue').textContent = levelCount === 0 ? t.incline.levelsNone : String(levelCount);
  }

  function render() {
    $('inclCard').hidden = !support.settable;
    $('inclTarget').textContent = t.incline.value(shown);
    const levels = levelsFromCount(levelCount, range ?? undefined);
    const box = $('inclLevels');
    box.hidden = levels.length === 0;
    $input('inclSlider').hidden = levels.length > 0;
    box.replaceChildren(...levels.map((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'needs-conn';
      b.disabled = !host.uiConnected();
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(Math.abs(l - shown) < 0.05));
      b.textContent = String(i + 1);
      b.title = b.ariaLabel = t.incline.levelButton(i + 1, l);
      b.onclick = () => void set(l);
      return b;
    }));
    $('inclInfo').textContent = range ? t.incline.range(range.min, range.max, range.step) : t.incline.unknown;
  }

  function set(requested: number): Promise<boolean> {
    const pct = clampIncline(requested, range ?? undefined);
    if (!support.settable || Number.isNaN(pct)) return Promise.resolve(false);
    $input('inclSlider').value = String(pct);
    shown = pct;
    render();
    return host.send(cmdSetInclination(pct));
  }

  /** What the last real treadmill said about the incline: remembered so that the editor can hide it while disconnected. */
  function applyInclineSeen() {
    if (store.get(INCLINE_SEEN_KEY) === 'no') document.documentElement.dataset.incline = 'no';
    else delete document.documentElement.dataset.incline;
  }

  $input('inclLevelsInput').oninput = e => {
    levelCount = parseLevelCount((e.target as HTMLInputElement).value);
    store.set(INCLINE_LEVELS_KEY, String(levelCount));
    renderLevelCountField();
    render();
  };
  $input('inclSlider').oninput = e => { $('inclTarget').textContent = t.incline.value(parseFloat((e.target as HTMLInputElement).value)); };
  $input('inclSlider').onchange = e => void set(parseFloat((e.target as HTMLInputElement).value));

  renderLevelCountField();
  applyInclineSeen();

  return {
    render,
    /** After a language change */
    relabel() { renderLevelCountField(); render(); },
    /** A connection starts: forget what the last treadmill said */
    reset() {
      const sl = $input('inclSlider');
      sl.min = '0'; sl.max = '15'; sl.step = '1'; sl.value = '0';
      range = null;
      shown = 0;
      support = { settable: false, reported: false };
      render();
    },
    /** Connected: what the treadmill supports, and its range. `real`: a real treadmill (the demo is not remembered). */
    onConnected(info: { features?: Features; inclRange?: Range }, real: boolean) {
      support = inclineSupport(info.features, info.inclRange);
      if (!support.settable && !support.reported) log(t.incline.unsupportedLog);
      if (real) {
        store.set(INCLINE_SEEN_KEY, support.settable || support.reported ? 'yes' : 'no');
        applyInclineSeen();
      }
      if (info.inclRange) {
        const { min, max, step } = info.inclRange;
        const sl = $input('inclSlider');
        sl.min = String(min); sl.max = String(max); sl.step = String(step || 0.5); sl.value = String(Math.max(min, 0));
        range = info.inclRange;
        shown = parseFloat(sl.value);
      }
      render();
    },
    /** The treadmill reports the incline in its data (the figure is shown) */
    supportReported: () => support.reported,
  };
}
