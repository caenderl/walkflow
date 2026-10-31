// DOM-Helfer. Bewusst klein, kein Framework.

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt im DOM`);
  return el as T;
}

export const $input = (id: string) => $<HTMLInputElement>(id);
export const $button = (id: string) => $<HTMLButtonElement>(id);

export function log(msg: string) {
  const el = $('log');
  el.textContent += `[${new Date().toLocaleTimeString('de-DE')}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

export function download(content: string, type: string, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** localStorage, das im privaten Modus oder bei blockiertem Speicher nicht wirft. */
export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* privater Modus */ }
  },
};
