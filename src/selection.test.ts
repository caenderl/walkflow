import { describe, expect, it } from 'vitest';
import { readActive } from './selection';

describe('readActive', () => {
  it('knows a workout, a route, and everything else is free training', () => {
    expect(readActive('workout')).toBe('workout');
    expect(readActive('route')).toBe('route');
    for (const other of [null, '', 'free', 'Workout', 'workout ', '{"a":1}', 'tpl:intervals']) expect(readActive(other), String(other)).toBeNull();
  });
});
