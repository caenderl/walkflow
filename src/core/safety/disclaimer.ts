// The safety notice on first run: accepted once per version of its text.

export const DISCLAIMER_VERSION = 1;
export const DISCLAIMER_STORAGE_KEY = 'walkflow.disclaimerAccepted';

export function isDisclaimerAccepted(stored: string | null): boolean {
  return stored === String(DISCLAIMER_VERSION);
}
