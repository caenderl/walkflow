import { describe, expect, it } from 'vitest';
import { devToolsAllowed, readDevMode } from './dev-mode';

describe('readDevMode', () => {
  it('is on only for the exact stored value "1"', () => {
    expect(readDevMode('1')).toBe(true);
  });

  it('is off for everything else: missing, "0", damaged', () => {
    for (const raw of [null, '', '0', 'true', 'yes', '11', ' 1']) expect(readDevMode(raw), String(raw)).toBe(false);
  });
});

describe('devToolsAllowed', () => {
  it('lets the developer tools be opened in developer mode and when the app runs from the dev server', () => {
    expect(devToolsAllowed(true, false)).toBe(true);
    expect(devToolsAllowed(false, true)).toBe(true);
    expect(devToolsAllowed(true, true)).toBe(true);
  });

  it('keeps them closed otherwise', () => {
    expect(devToolsAllowed(false, false)).toBe(false);
  });
});
