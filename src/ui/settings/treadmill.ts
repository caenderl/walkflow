// Settings → treadmill: the speeds of the slow/mid/run buttons in the training view. Each field shows its preset in the
// units of the settings with the decimal separator of the language; a value is only stored when checkPresetChange
// accepts it (2.0 km/h up to the personal limit, slow < mid < run). The checks and the guard against the limit live in
// core/safety/speed-presets.ts.

import { checkPresetChange, PRESET_KEYS, PRESET_MIN, presetCommand, type PresetKey, type SpeedPresets } from '../../core/safety/speed-presets';
import { t } from '../../i18n/i18n';
import { fromSpeed, speedUnit } from '../../i18n/units';
import { $, $input } from '../ui';

export interface TreadmillSettingsHost {
  /** The personal speed limit, km/h */
  limit(): number;
  presets(): SpeedPresets;
  /** Stores checked presets and redraws the buttons */
  save(p: SpeedPresets): void;
}

/** A number as typed: digits with one decimal point or comma, nothing else (so "3,5x" is not read as 3) */
export function parseDecimal(raw: string): number {
  const s = raw.trim();
  return /^\d+(?:[.,]\d*)?$|^[.,]\d+$/.test(s) ? parseFloat(s.replace(',', '.')) : NaN;
}

export function setupTreadmillSettings(host: TreadmillSettingsHost) {
  const field = (key: PresetKey) => $input(`preset-${key}`);
  const error = (key: PresetKey) => $(`presetErr-${key}`);

  function setError(key: PresetKey, text: string, kind: 'error' | 'warn' = 'error') {
    const input = field(key), err = error(key);
    err.textContent = text;
    err.dataset.kind = text ? kind : '';
    if (text && kind === 'error') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  /** The stored values, and a note on each one that is above the limit (its button is disabled) */
  function showStored(key: PresetKey) {
    const presets = host.presets();
    field(key).value = t.u.speedValue(presets[key], 1);
    setError(key, presetCommand(presets, key, host.limit()) === null ? t.presets.aboveLimit : '', 'warn');
  }

  function render() {
    for (const key of PRESET_KEYS) {
      showStored(key);
      document.querySelector(`#preset-${key} + .preset-unit`)!.textContent = speedUnit();
    }
    $('presetRange').textContent = t.presets.range(PRESET_MIN, host.limit());
  }

  function changed(key: PresetKey) {
    const shown = parseDecimal(field(key).value);
    const d = checkPresetChange(host.presets(), key, Number.isFinite(shown) ? fromSpeed(shown) : NaN, host.limit());
    if (!d.ok) {
      // Not stored: the typed value stays in the field with the reason, so it can be corrected
      setError(key, d.error === 'notANumber' ? t.presets.notANumber
        : d.error === 'range' ? t.presets.rangeError(PRESET_MIN, host.limit())
        : d.error === 'notAbovePrevious' ? t.presets.notAbovePrevious
        : t.presets.notBelowNext);
      return;
    }
    host.save(d.presets);
    render();
  }

  for (const key of PRESET_KEYS) {
    const input = field(key);
    // Also fires on Enter
    input.onchange = () => changed(key);
  }

  return {
    /** After loading, a language, units or limit change: the fields show the stored presets again */
    render,
  };
}
