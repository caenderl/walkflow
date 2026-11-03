// Small DOM builders: no framework, plain functions.

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

/** A button that shows only an icon of the sprite in index.html; the label is its accessible name and its tooltip */
export function iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', className: 'icon-btn', title: label });
  b.setAttribute('aria-label', label);
  b.onclick = onClick;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${icon}`);
  svg.append(use);
  b.append(svg);
  return b;
}
