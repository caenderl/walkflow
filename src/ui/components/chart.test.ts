import { describe, expect, it } from 'vitest';
import { canvasLayout, labelStep } from './chart';

describe('canvasLayout', () => {
  it('draws at the size the page gives the canvas, in device pixels', () => {
    expect(canvasLayout(560, 240, 1)).toEqual({ W: 560, H: 240, bw: 560, bh: 240 });
    expect(canvasLayout(560, 240, 2)).toEqual({ W: 560, H: 240, bw: 1120, bh: 480 });
    expect(canvasLayout(333.4, 160.2, 1.5)).toEqual({ W: 333.4, H: 160.2, bw: 500, bh: 240 });
  });

  it('does not draw a canvas that is not on screen: its size is 0 then, and must not grow the picture each time', () => {
    expect(canvasLayout(0, 0, 2)).toBeNull();
    expect(canvasLayout(560, 0, 2)).toBeNull();
    expect(canvasLayout(0, 240, 2)).toBeNull();
    expect(canvasLayout(NaN, 240, 2)).toBeNull();
  });

  it('takes a missing or odd pixel ratio for 1', () => {
    for (const dpr of [0, -1, NaN, Infinity]) expect(canvasLayout(100, 50, dpr)).toEqual({ W: 100, H: 50, bw: 100, bh: 50 });
  });
});

describe('labelStep', () => {
  it('labels every bar when the labels fit, and every second or third one when they do not (counted back from the last)', () => {
    expect(labelStep(22, 60)).toBe(1);
    expect(labelStep(22, 28)).toBe(1);
    expect(labelStep(22, 14)).toBe(2);
    expect(labelStep(22, 10)).toBe(3);
  });

  it('never goes below one, also for a slot that is not there', () => {
    expect(labelStep(0, 50)).toBe(1);
    expect(labelStep(22, 0)).toBe(1);
    expect(labelStep(22, NaN)).toBe(1);
  });
});
