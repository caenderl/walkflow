// The speed in the training view and its limits: the target and the controls (slider, ±, the slow/mid/run presets, keys), the personal speed
// limit and the maximum change per command (settings → safety), stored here. The treadmill (device/treadmill.ts) owns the
// speed governor, the only thing that sends speed commands: it caps to the limit and the device range and approaches larger
// jumps in steps. The values stay km/h inside; the fields and buttons show the units of the settings.

import {
  decideLimitChange, LEGACY_LIMIT_KEY, LIMIT_CONFIRM_ABOVE,
  LIMIT_STORAGE_KEY, loadLimit, MAX_STEP_MAX, MAX_STEP_MIN, MAX_STEP_STORAGE_KEY, parseMaxStep, RAMP_INTERVAL_MS,
  serializeLimit,
} from '../../core/safety/safety';
import type { Treadmill } from '../../device/treadmill';
import { t } from '../../i18n/i18n';
import { noticeText } from './treadmill-text';
import {
  loadSpeedPresets, PRESET_KEYS, presetCommand, type PresetKey, serializeSpeedPresets, SPEED_PRESETS_STORAGE_KEY,
  type SpeedPresets,
} from '../../core/safety/speed-presets';
import { speedFieldText, speedFromInput, speedStep } from '../../i18n/units';
import { confirmDialog } from '../components/dialogs';
import { $, $button, $input, log } from '../ui';
import { store } from '../store';

export interface SpeedControlsHost {
  tm: Pick<Treadmill, 'state' | 'setSpeed' | 'changeSpeed' | 'setLimits' | 'on'>;
  /** The device range or the limit changed: what shows the limit elsewhere (the workout editor) is updated */
  limitsChanged(): void;
  /** The person changed the limit: the chart is drawn again (its axis follows the limit) */
  limitSet(): void;
}

export function setupSpeedControls(host: SpeedControlsHost) {
  const { tm } = host;
  /** The limit as stored, and whether a person confirmed it (above LIMIT_CONFIRM_ABOVE) */
  let limit = 6;
  let limitConfirmed = false;
  let sliderDragging = false;
  let presets: SpeedPresets = loadSpeedPresets(null);

  tm.on('target', () => renderSpeed());

  function effectiveMax() { return tm.state.effectiveMax; }

  /** The device range or the limit changed: the slider, the figures and the presets follow (the treadmill caps by itself) */
  function applyLimits() {
    const sl = $input('slider');
    sl.min = String(tm.state.deviceRange.min); sl.max = String(effectiveMax());
    if (parseFloat(sl.value) > parseFloat(sl.max)) sl.value = sl.max;
    if (parseFloat(sl.value) < parseFloat(sl.min)) sl.value = sl.min;
    renderRangeInfo();
    renderSpeed();
    renderPresets();
  }

  const presetButtons = () => document.querySelectorAll<HTMLButtonElement>('.preset[data-preset]');

  /**
   * The slow/mid/run buttons: icon and stored speed. A preset above the highest allowed speed (limit or device) is
   * disabled, not clamped (see speed-presets.ts), so a button never asks for more than the limit.
   */
  function renderPresets() {
    const max = effectiveMax();
    presetButtons().forEach(b => {
      const key = b.dataset.preset as PresetKey;
      if (!PRESET_KEYS.includes(key)) return;
      const allowed = presetCommand(presets, key, max) !== null;
      b.disabled = !tm.state.connected || !allowed;
      b.querySelector('.pv')!.textContent = t.u.speedValue(presets[key], 1);
      const label = allowed ? t.presets.button(t.presets[key], presets[key]) : t.presets.aboveLimitButton(t.presets[key], presets[key]);
      b.title = label;
      b.setAttribute('aria-label', label);
    });
  }

  function renderRangeInfo() {
    const { deviceRange: d, maxStep } = tm.state;
    $('rangeInfo').textContent = t.settings.range(d.min, d.max, effectiveMax(), maxStep, RAMP_INTERVAL_MS);
    $('deviceInfo').textContent = t.connection.deviceInfo(d.min, d.max, effectiveMax());
    host.limitsChanged();
  }

  function renderSpeed() {
    const sl = $input('slider');
    const { target, lastCommand: lc, ramping } = tm.state;
    if (target !== null && !sliderDragging) sl.value = String(target);
    $('target').textContent = t.control.speed(target ?? parseFloat(sl.value));
    $('rampInfo').textContent = ramping && target !== null && lc && lc.kmh !== target
      ? t.control.ramping(lc.kmh, target)
      : ' ';
  }

  function requestSpeed(kmh: number) {
    if (!tm.state.connected || !Number.isFinite(kmh)) return;
    tm.setSpeed(kmh);
    renderSpeed();
  }

  function stepSpeed(delta: number) {
    if (!tm.state.connected) return;
    tm.changeSpeed(delta);
    renderSpeed();
  }

  /** The limit and step fields and the preset buttons, in the units of the settings. The values stay km/h inside. */
  function renderLimitFields() {
    // Text fields with the language's decimal separator; decideLimitChange and parseMaxStep check the range
    $input('cap').value = speedFieldText(limit, t.number);
    $input('maxStep').value = speedFieldText(tm.state.maxStep, t.number);
    renderPresets();
    renderStepButtons();
  }

  /** − and +: a large sign, the step below it in the shown unit, and the step in the accessible name */
  function renderStepButtons() {
    const step = speedStep();
    for (const [id, label] of [['minus', t.control.minusLabel], ['plus', t.control.plusLabel]] as const) {
      const b = $button(id);
      b.querySelector('.step-val')!.textContent = t.control.stepValue(step);
      b.setAttribute('aria-label', label(step));
    }
  }

  async function limitChanged() {
    const input = $input('cap');
    const d = decideLimitChange(speedFromInput(input.value), limit);
    if (!d.ok) { log(`❌ ${noticeText(d.reason)}`); renderLimitFields(); return; }
    let confirmed = d.value > LIMIT_CONFIRM_ABOVE && limitConfirmed;
    if (d.needsConfirmation) {
      const ok = await confirmDialog(t.limit.confirmTitle(d.value), [
        t.limit.risk(LIMIT_CONFIRM_ABOVE),
        t.limit.onlyIf,
      ], t.limit.allow(d.value));
      if (!ok) { renderLimitFields(); return; }
      confirmed = true;
    }
    limit = d.value;
    limitConfirmed = confirmed;
    tm.setLimits({ speedLimit: limit, limitConfirmed });
    renderLimitFields();
    store.set(LIMIT_STORAGE_KEY, serializeLimit(limit, limitConfirmed));
    applyLimits();
    host.limitSet();
  }

  function maxStepChanged() {
    const input = $input('maxStep');
    const v = parseMaxStep(speedFromInput(input.value));
    if (v === null) { log(t.limit.maxStepRange(MAX_STEP_MIN, MAX_STEP_MAX)); renderLimitFields(); return; }
    tm.setLimits({ maxStep: v });
    renderLimitFields();
    store.set(MAX_STEP_STORAGE_KEY, String(v));
    applyLimits();
  }

  const slider = $input('slider');
  slider.addEventListener('pointerdown', () => { sliderDragging = true; });
  window.addEventListener('pointerup', () => { sliderDragging = false; });
  slider.oninput = () => { $('target').textContent = t.control.speed(parseFloat(slider.value)); };
  slider.onchange = () => { sliderDragging = false; requestSpeed(parseFloat(slider.value)); };
  $button('minus').onclick = () => stepSpeed(-speedStep());
  $button('plus').onclick = () => stepSpeed(speedStep());
  presetButtons().forEach(b => {
    // Checked again at the click: the limit may have changed since the button was drawn. The governor caps it anyway.
    b.onclick = () => {
      const v = presetCommand(presets, b.dataset.preset as PresetKey, effectiveMax());
      if (v !== null) requestSpeed(v);
    };
  });
  $input('cap').onchange = () => void limitChanged();
  $input('maxStep').onchange = maxStepChanged;

  return {
    /** The personal speed limit (settings → safety), km/h */
    limit: () => limit,
    /** The slow/mid/run presets, km/h */
    presets: (): SpeedPresets => ({ ...presets }),
    /** Stores presets that settings → treadmill has checked (checkPresetChange) and redraws the buttons */
    setPresets(p: SpeedPresets) {
      presets = { ...p };
      store.set(SPEED_PRESETS_STORAGE_KEY, serializeSpeedPresets(presets));
      renderPresets();
    },
    /** The connection changed: the preset buttons are enabled or disabled */
    renderPresets,
    /** The highest speed that can be asked for: the device's maximum, capped by the personal limit */
    effectiveMax,
    /** The range or the limit changed: slider and figures follow */
    applyLimits,
    /** Reads the saved limit and maximum change */
    load() {
      const l = loadLimit(store.get(LIMIT_STORAGE_KEY), store.get(LEGACY_LIMIT_KEY));
      limit = l.value;
      limitConfirmed = l.confirmed === true;
      if (l.note) log(noticeText(l.note));
      const ms = parseMaxStep(store.get(MAX_STEP_STORAGE_KEY) ?? '');
      tm.setLimits({ speedLimit: limit, limitConfirmed, ...(ms !== null ? { maxStep: ms } : {}) });
      presets = loadSpeedPresets(store.get(SPEED_PRESETS_STORAGE_KEY));
      renderLimitFields();
    },
    /** One step up or down (keys ↑ ↓): the size of the step follows the units */
    step(direction: 1 | -1) { stepSpeed(direction * speedStep()); },
    /** After a language or units change */
    relabel() { renderLimitFields(); renderRangeInfo(); renderSpeed(); },
  };
}
