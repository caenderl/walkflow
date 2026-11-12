// The incline in the training view: the card with the slider or the level buttons, the figure for the settings ("incline
// levels") and what the treadmill said about the incline. It asks the treadmill (features and range) and shows only what it
// supports; the value that is sent is always inside the range the treadmill reported. It can only be set while the belt
// moves (a treadmill ignores Set Inclination while it stands, a sPad 500 does), and it follows the incline the treadmill
// reports, so that a change on the treadmill's own buttons shows here too.

import { clampIncline, inclineSupport, type Features, type InclineSupport, type Range } from 'ftms-treadmill';
import { followReportedIncline, type InclineChoice, levelCountFromSlider, levelsFromCount, parseLevelCount, sliderFromLevelCount } from '../../core/safety/incline-levels';
import { t } from '../../i18n/i18n';
import { $, $input, log } from '../ui';
import { store } from '../store';

const INCLINE_LEVELS_KEY = 'walkflow.inclineLevelCount';
/** 'no' once a real treadmill reported no incline: then nothing about the incline is shown */
const INCLINE_SEEN_KEY = 'walkflow.inclineSupport';

export interface InclineCardHost {
  /** Sets the incline on the treadmill (it clamps to its range again); false if not settable, not connected or failed */
  setIncline(pct: number): Promise<boolean>;
  /** The page shows a connection (the buttons can be pressed) */
  uiConnected(): boolean;
  now(): number;
  /** The incline levels setting changed: the figures redraw (the incline figure follows it) */
  levelsChanged(): void;
}

export function setupInclineCard(host: InclineCardHost) {
  let range: Range | null = null;
  let shown = 0;
  let support: InclineSupport = { settable: false, reported: false };
  /** The belt moves: only then does the treadmill take an incline */
  let moving = false;
  /** Chosen here and not yet reported back by the treadmill */
  let choice: InclineChoice | null = null;
  /** How many levels the person says the treadmill's incline has; 0 = none: the incline is not shown in the training view */
  let levelCount = parseLevelCount(store.get(INCLINE_LEVELS_KEY));

  /** The setting "incline levels": the slider and the number beside it */
  function renderLevelCountField() {
    $input('inclLevelsInput').value = sliderFromLevelCount(levelCount);
    $('inclLevelsValue').textContent = levelCount === 0 ? t.incline.levelsNone : String(levelCount);
  }

  function render() {
    $('inclCard').hidden = !support.settable || levelCount === 0;
    const usable = host.uiConnected() && moving;
    $input('inclSlider').disabled = !usable;
    const levels = levelsFromCount(levelCount, range ?? undefined);
    const box = $('inclLevels');
    box.hidden = levels.length === 0;
    // With levels the card shows only the level buttons: the percent of a level is not known (a sPad 500 shows levels)
    $input('inclSlider').hidden = levels.length > 0;
    $('inclTarget').hidden = $('inclInfo').hidden = levels.length > 0;
    $('inclTarget').textContent = t.incline.value(shown);
    box.replaceChildren(...levels.map((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = !usable;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(Math.abs(l - shown) < 0.05));
      b.textContent = String(i);
      b.title = b.ariaLabel = t.incline.levelButton(i);
      b.onclick = () => void set(l);
      return b;
    }));
    $('inclInfo').textContent = range ? t.incline.range(range.min, range.max, range.step) : t.incline.unknown;
  }

  function set(requested: number): Promise<boolean> {
    const pct = clampIncline(requested, range ?? undefined);
    if (!support.settable || !moving || Number.isNaN(pct)) return Promise.resolve(false);
    $input('inclSlider').value = String(pct);
    shown = pct;
    choice = { pct, at: host.now() };
    render();
    return host.setIncline(pct);
  }

  /** What the last real treadmill said about the incline: remembered so that the editor can hide it while disconnected. */
  function applyInclineSeen() {
    if (store.get(INCLINE_SEEN_KEY) === 'no') document.documentElement.dataset.incline = 'no';
    else delete document.documentElement.dataset.incline;
  }

  $input('inclLevelsInput').oninput = e => {
    levelCount = levelCountFromSlider((e.target as HTMLInputElement).value);
    store.set(INCLINE_LEVELS_KEY, String(levelCount));
    renderLevelCountField();
    render();
    host.levelsChanged();
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
      moving = false;
      choice = null;
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
    /** Whether the belt moves; the incline can only be set then */
    beltMoving(m: boolean) {
      if (m === moving) return;
      moving = m;
      render();
    },
    /** The incline the treadmill reports: the card follows it (a choice made here first gets a few seconds to arrive) */
    reported(pct: number) {
      if (!Number.isFinite(pct)) return;
      const next = followReportedIncline(pct, choice, host.now());
      choice = next.choice;
      if (Math.abs(next.shown - shown) < 0.05) return;
      shown = next.shown;
      if (document.activeElement !== $input('inclSlider')) $input('inclSlider').value = String(shown);
      render();
    },
    /** The treadmill reports the incline in its data (the figure is shown) */
    supportReported: () => support.reported,
    /** Incline levels are set ("none" hides the incline in the training view) */
    wanted: () => levelCount > 0,
  };
}
