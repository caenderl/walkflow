import { describe, expect, it } from 'vitest';
import { installState } from './install';

const base = { web: true, standalone: false, installed: false, promptReady: false };

describe('installState', () => {
  it('the desktop app has nothing to install', () => {
    expect(installState({ ...base, web: false, promptReady: true })).toBe('none');
  });

  it('running as an installed app, or just installed: it says so, no button', () => {
    expect(installState({ ...base, standalone: true, promptReady: true })).toBe('installed');
    expect(installState({ ...base, installed: true, promptReady: true })).toBe('installed');
  });

  it('the browser offers the install: the button', () => {
    expect(installState({ ...base, promptReady: true })).toBe('offer');
  });

  it('the browser does not offer it (Safari, Firefox, dismissed, not yet): how to do it by hand', () => {
    expect(installState(base)).toBe('manual');
  });
});
