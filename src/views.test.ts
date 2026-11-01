import { describe, expect, it } from 'vitest';
import { stopPlacement, VIEWS, viewFromHash } from './views';

describe('views', () => {
  it('view from the URL hash, training for everything unknown', () => {
    expect(viewFromHash('#history')).toBe('history');
    expect(viewFromHash('')).toBe('training');
    expect(viewFromHash('#')).toBe('training');
    expect(viewFromHash('#nonsense')).toBe('training');
  });
});

describe('where Stop is shown', () => {
  it('training: the full controls, connected or not (disabled without a connection)', () => {
    expect(stopPlacement('training', true)).toBe('controls');
    expect(stopPlacement('training', false)).toBe('controls');
  });

  it('other views: the stop bar while connected, nothing to stop without a connection', () => {
    expect(stopPlacement('history', true)).toBe('bar');
    expect(stopPlacement('history', false)).toBe('none');
  });

  it('while connected, every view shows a Stop button', () => {
    for (const v of VIEWS) expect(stopPlacement(v, true)).not.toBe('none');
  });
});
