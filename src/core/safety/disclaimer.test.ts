import { describe, expect, it } from 'vitest';
import { DISCLAIMER_VERSION, isDisclaimerAccepted } from './disclaimer';

describe('first-run notice', () => {
  it('only counts for the current version', () => {
    expect(isDisclaimerAccepted(String(DISCLAIMER_VERSION))).toBe(true);
    expect(isDisclaimerAccepted(String(DISCLAIMER_VERSION - 1))).toBe(false);
    expect(isDisclaimerAccepted(null)).toBe(false);
    expect(isDisclaimerAccepted('yes')).toBe(false);
  });
});
