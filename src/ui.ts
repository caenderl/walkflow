// DOM helpers. Deliberately small, no framework.

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing in the DOM`);
  return el as T;
}

export const $input = (id: string) => $<HTMLInputElement>(id);
export const $button = (id: string) => $<HTMLButtonElement>(id);

export function log(msg: string) {
  const el = $('log');
  // HH:MM:SS regardless of language, so logs from different users look the same
  el.textContent += `[${new Date().toTimeString().slice(0, 8)}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

export function download(content: string, type: string, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** localStorage that does not throw in private mode or when storage is blocked. */
export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

export function button(text: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', { type: 'button', textContent: text });
  b.onclick = onClick;
  b.disabled = disabled;
  return b;
}
