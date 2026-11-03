// The speed in the training view and its limits: the target and the controls (slider, ±, presets, keys), the personal speed
// limit and the maximum change per command (settings → safety). It owns the speed governor, which is the only thing that
// sends speed commands: it caps to the limit and the device range and approaches larger jumps in steps. The values stay km/h
// inside; the fields and buttons show the units of the settings.

import { cmdSetSpeed } from '../../core/protocol/ftms';
import {
  decideLimitChange, effectiveMax as calcEffectiveMax, LEGACY_LIMIT_KEY, LIMIT_CONFIRM_ABOVE, LIMIT_MAX, LIMIT_MIN,
  LIMIT_STORAGE_KEY, loadLimit, MAX_STEP_MAX, MAX_STEP_MIN, MAX_STEP_STORAGE_KEY, parseMaxStep, RAMP_INTERVAL_MS,
  serializeLimit, SpeedGovernor,
} from '../../core/safety/safety';
import { t } from '../../i18n/i18n';
import { fromSpeed, speedFromInput, speedPresets, speedStep, toSpeed } from '../../i18n/units';
import { confirmDialog } from '../components/dialogs';
import { $, $button, $input, log } from '../ui';
import { store } from '../store';

export interface SpeedControlsHost {
  /** Sends a command to the treadmill; false if there is no connection or it failed */
  send(bytes: Uint8Array): Promise<boolean>;
  connected(): boolean;
  now(): number;
  /** The device range or the limit changed: what shows the limit elsewhere (the workout editor) is updated */
  limitsChanged(): void;
  /** The person changed the limit: the chart is drawn again (its axis follows the limit) */
  limitSet(): void;
}

export function setupSpeedControls(host: SpeedControlsHost) {
  let devMin = 1.0, devMax = 12.0;
  let limit = 6;
  let sliderDragging = false;

  const governor = new SpeedGovernor({
    send: kmh => host.send(cmdSetSpeed(kmh)),
    now: host.now,
    log,
    onChange: renderSpeed,
  });

  function effectiveMax() { return calcEffectiveMax(devMax, limit); }

  function applyLimits() {
    const sl = $input('slider');
    sl.min = String(devMin); sl.max = String(effectiveMax());
    if (parseFloat(sl.value) > parseFloat(sl.max)) sl.value = sl.max;
    if (parseFloat(sl.value) < parseFloat(sl.min)) sl.value = sl.min;
    renderRangeInfo();
    const before = governor.target;
    governor.setRange({ min: devMin, max: effectiveMax() });
    if (host.connected() && governor.target !== before && governor.target !== null) log(t.limit.lowered(governor.target));
    renderSpeed();
  }

  function renderRangeInfo() {
    $('rangeInfo').textContent = t.settings.range(devMin, devMax, effectiveMax(), governor.maxStep, RAMP_INTERVAL_MS);
    $('deviceInfo').textContent = t.connection.deviceInfo(devMin, devMax, effectiveMax());
    host.limitsChanged();
  }

  function renderSpeed() {
    const sl = $input('slider');
    const target = governor.target;
    if (target !== null && !sliderDragging) sl.value = String(target);
    $('target').textContent = t.control.speed(target ?? parseFloat(sl.value));
    const lc = governor.lastCommand;
    $('rampInfo').textContent = governor.ramping && target !== null && lc && lc.kmh !== target
      ? t.control.ramping(lc.kmh, target)
      : ' ';
  }

  function requestSpeed(kmh: number) {
    if (!host.connected() || !Number.isFinite(kmh)) return;
    governor.request(kmh);
    renderSpeed();
  }

  function stepSpeed(delta: number) {
    requestSpeed((governor.target ?? governor.base()) + delta);
  }

  /** The limit and step fields and the quick-select buttons, in the units of the settings. The values stay km/h inside. */
  function renderLimitFields() {
    const shown = (kmh: number) => String(Math.round(toSpeed(kmh) * 100) / 100);
    const metric = toSpeed(1) === 1;
    const cap = $input('cap'), step = $input('maxStep');
    cap.min = shown(LIMIT_MIN); cap.max = shown(LIMIT_MAX); cap.step = metric ? '0.5' : '0.1'; cap.value = shown(limit);
    step.min = shown(MAX_STEP_MIN); step.max = shown(MAX_STEP_MAX); step.step = metric ? '0.1' : '0.01'; step.value = shown(governor.maxStep);
    const presets = speedPresets();
    document.querySelectorAll<HTMLButtonElement>('.preset').forEach((b, i) => {
      const v = presets[i];
      if (v === undefined) return;
      b.dataset.speed = String(v);
      b.textContent = t.number(v);
    });
  }

  async function limitChanged() {
    const input = $input('cap');
    const d = decideLimitChange(speedFromInput(input.value), limit);
    if (!d.ok) { log(`❌ ${d.reason}`); renderLimitFields(); return; }
    if (d.needsConfirmation) {
      const ok = await confirmDialog(t.limit.confirmTitle(d.value), [
        t.limit.risk(LIMIT_CONFIRM_ABOVE),
        t.limit.onlyIf,
      ], t.limit.allow(d.value));
      if (!ok) { renderLimitFields(); return; }
    }
    limit = d.value;
    renderLimitFields();
    store.set(LIMIT_STORAGE_KEY, serializeLimit(limit, limit > LIMIT_CONFIRM_ABOVE));
    applyLimits();
    host.limitSet();
  }

  function maxStepChanged() {
    const input = $input('maxStep');
    const v = parseMaxStep(speedFromInput(input.value));
    if (v === null) { log(t.limit.maxStepRange(MAX_STEP_MIN, MAX_STEP_MAX)); renderLimitFields(); return; }
    governor.maxStep = v;
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
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach(b => {
    b.onclick = () => requestSpeed(fromSpeed(parseFloat(b.dataset.speed ?? '')));
  });
  $input('cap').onchange = () => void limitChanged();
  $input('maxStep').onchange = maxStepChanged;

  return {
    governor,
    /** The highest speed that can be asked for: the device's maximum, capped by the personal limit */
    effectiveMax,
    /** What the treadmill reported about its speed range (before it did: the defaults) */
    setDeviceRange(min: number, max: number) { devMin = min; devMax = max; },
    /** The range or the limit changed: slider, governor and the figures follow */
    applyLimits,
    /** Reads the saved limit and maximum change */
    load() {
      const l = loadLimit(store.get(LIMIT_STORAGE_KEY), store.get(LEGACY_LIMIT_KEY));
      limit = l.value;
      if (l.note) log(l.note);
      const ms = parseMaxStep(store.get(MAX_STEP_STORAGE_KEY) ?? '');
      if (ms !== null) governor.maxStep = ms;
      renderLimitFields();
    },
    /** One step up or down (keys ↑ ↓): the size of the step follows the units */
    step(direction: 1 | -1) { stepSpeed(direction * speedStep()); },
    /** After a language or units change */
    relabel() { renderLimitFields(); renderRangeInfo(); renderSpeed(); },
  };
}
