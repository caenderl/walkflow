// One step in the workout editor: amount and unit, speed, incline, and the buttons to move or remove it. Rows are metric
// (metres, km/h); the fields show the units of the settings.

import { t } from '../../i18n/i18n';
import { fromShort, fromSpeed, toShort, toSpeed } from '../../i18n/units';
import type { Row, Unit } from '../../core/training/workout-rows';
import { button, el } from '../components/elements';

export interface StepRowHost {
  /** A number changed: the total and the note about the limit are drawn again (cheap, runs on every input) */
  totalsChanged(): void;
  /** The rows were moved or removed: the editor is drawn again */
  rowsChanged(): void;
}

export function stepRow(rows: Row[], i: number, host: StepRowHost): HTMLLIElement {
  const row = rows[i]!;
  const num = (value: number, step: string, label: string, onInput: (v: number) => void, placeholder = '', min = '0') => {
    const input = el('input', { type: 'number', min, step, placeholder, value: Number.isFinite(value) ? String(value) : '' });
    input.setAttribute('aria-label', `${t.workouts.step(i + 1)}: ${label}`);
    input.setAttribute('inputmode', 'decimal');
    input.oninput = () => { onInput(input.valueAsNumber); host.totalsChanged(); };
    return input;
  };
  // Row values are metric (metres, km/h); the fields show the units of the settings. A length is metres or feet.
  const rounded = (v: number, digits: number) => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : v);
  const amount = num(row.unit === 'm' ? rounded(toShort(row.amount), 1) : row.amount, 'any', t.workouts.amount, v => { row.amount = row.unit === 'm' ? fromShort(v) : v; });
  const unit = el('select');
  unit.setAttribute('aria-label', `${t.workouts.step(i + 1)}: ${t.workouts.unit}`);
  for (const [value, text] of [['min', t.workouts.unitMin], ['s', t.workouts.unitSec], ['m', t.workouts.unitMeters]] as const) {
    unit.append(el('option', { value, textContent: text, selected: row.unit === value }));
  }
  // The number stays as it is shown when the unit changes: 5 min becomes 5 m (or 5 ft)
  unit.onchange = () => { row.unit = unit.value as Unit; row.amount = row.unit === 'm' ? fromShort(amount.valueAsNumber) : amount.valueAsNumber; host.totalsChanged(); };

  const move = (by: number) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    host.rowsChanged();
  };
  const icon = (text: string, label: string, onClick: () => void, disabled = false) => {
    const b = button(text, onClick, disabled);
    b.setAttribute('aria-label', `${t.workouts.step(i + 1)}: ${label}`);
    b.title = label;
    return b;
  };
  const incline = num(row.incline ?? NaN, '0.1', t.workouts.incline, v => { row.incline = Number.isFinite(v) ? v : undefined; }, t.workouts.inclShort, '-10');
  incline.max = '40';
  incline.classList.add('wk-incl');
  return el('li', { className: 'wk-step' },
    el('span', { className: 'wk-n', textContent: String(i + 1) }),
    amount,
    unit,
    num(rounded(toSpeed(row.speed), 2), '0.1', t.workouts.speed, v => { row.speed = rounded(fromSpeed(v), 2); }, t.u.speedUnit()),
    incline,
    el('span', { className: 'wk-move' },
      icon('↑', t.workouts.up, () => move(-1), i === 0),
      icon('↓', t.workouts.down, () => move(1), i === rows.length - 1),
      icon('✕', t.workouts.remove, () => { rows.splice(i, 1); host.rowsChanged(); })),
  );
}
