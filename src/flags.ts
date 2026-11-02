// Flag images (flag-icons, MIT, 4:3) for the countries in src/data/countries.json. Emoji flags would show as two letters on
// Windows, so these are image files. They are separate files next to the app, not part of the page's code: the address list
// is small, and the browser fetches only the flags that are shown.

const urls = import.meta.glob<string>('./flags/*.svg', { query: '?url', import: 'default', eager: true });

const key = (code: string) => `./flags/${code.toLowerCase()}.svg`;

export const hasFlag = (code: string): boolean => /^[A-Z]{2}$/.test(code) && key(code) in urls;

/** Address of the flag file, null if there is none for this code */
export const flagUrl = (code: string): string | null => (hasFlag(code) ? urls[key(code)]! : null);
