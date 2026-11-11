// The limit and maximum-change fields in settings → safety. A type="number" field drops "4,5" when the browser's locale
// uses a decimal point (the app then reads an empty value), so these are text fields that show the language's decimal
// separator and read back either separator.

import { afterEach, describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { decideLimitChange, parseMaxStep } from '../../core/safety/safety';
import { LANGS, messagesFor } from '../../i18n/i18n';
import { setUnits, speedFieldText, speedFromInput } from '../../i18n/units';

afterEach(() => setUnits('metric'));

const inputTag = (id: string) => indexHtml.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';

describe('limit fields in index.html', () => {
  for (const id of ['cap', 'maxStep']) {
    it(`#${id} is a decimal text field, not type="number"`, () => {
      const tag = inputTag(id);
      expect(tag).not.toBe('');
      expect(tag).toMatch(/type="text"/);
      expect(tag).toMatch(/inputmode="decimal"/);
      expect(tag).not.toMatch(/type="number"/);
    });
  }
});

describe('speedFieldText', () => {
  it('writes the decimal separator of the language', () => {
    expect(speedFieldText(4.5, messagesFor('en').number)).toBe('4.5');
    expect(speedFieldText(4.5, messagesFor('de').number)).toBe('4,5');
    expect(speedFieldText(6, messagesFor('de').number)).toBe('6');
  });

  it('is read back to the same limit and step in every language and unit system', () => {
    for (const system of ['metric', 'imperial'] as const) {
      setUnits(system);
      for (const l of LANGS) {
        const n = messagesFor(l).number;
        for (const limit of [1, 4.5, 6, 12.5, 20]) {
          const d = decideLimitChange(speedFromInput(speedFieldText(limit, n)), limit);
          expect(d.ok && d.value, `${system} ${l} ${limit}`).toBeCloseTo(limit, 1);
        }
        for (const step of [0.1, 0.5, 1]) {
          expect(parseMaxStep(speedFromInput(speedFieldText(step, n))), `${system} ${l} ${step}`).toBeCloseTo(step, 1);
        }
      }
    }
  });

  it('a value typed with a comma counts, as with a point', () => {
    expect(decideLimitChange(speedFromInput('4,5'), 6)).toMatchObject({ ok: true, value: 4.5 });
    expect(parseMaxStep(speedFromInput('0,3'))).toBe(0.3);
  });
});
