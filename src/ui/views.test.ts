import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { stopPlacement, viewFromHash, viewsFor } from './views';

const VIEWS = viewsFor(true);

describe('views', () => {
  it('view from the URL hash, training for everything unknown', () => {
    expect(viewFromHash('#history')).toBe('history');
    expect(viewFromHash('#workouts')).toBe('workouts');
    expect(viewFromHash('#routes')).toBe('routes');
    expect(viewFromHash('#community', true)).toBe('community');
    expect(viewFromHash('')).toBe('training');
    expect(viewFromHash('#')).toBe('training');
    expect(viewFromHash('#nonsense')).toBe('training');
  });
});

describe('without Community (the first release)', () => {
  it('has no Community view, and its address leads to the training view', () => {
    expect(viewsFor(false)).toEqual(['training', 'workouts', 'routes', 'history']);
    expect(viewFromHash('#community', false)).toBe('training');
    expect(viewFromHash('#routes', false)).toBe('routes');
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
    expect(stopPlacement('workouts', true)).toBe('bar');
    expect(stopPlacement('workouts', false)).toBe('none');
    expect(stopPlacement('routes', true)).toBe('bar');
    expect(stopPlacement('routes', false)).toBe('none');
    expect(stopPlacement('community', true)).toBe('bar');
    expect(stopPlacement('community', false)).toBe('none');
  });

  it('while connected, every view shows a Stop button', () => {
    for (const v of VIEWS) expect(stopPlacement(v, true)).not.toBe('none');
  });

  it('is in the order Training, Workouts, Routes, Community, History, in the code and in the navigation', () => {
    expect(VIEWS).toEqual(['training', 'workouts', 'routes', 'community', 'history']);
    const nav = [...indexHtml.matchAll(/<a href="[^"]*" data-view="(\w+)"/g)].map(m => m[1]);
    expect(nav).toEqual([...VIEWS]);
  });
});
