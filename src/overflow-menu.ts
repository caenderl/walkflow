// A "⋯" button that opens a short list of less used actions, for a row of buttons where one action should stand out.
// A <details> element, so it opens and closes without script; the script only closes it on a click elsewhere, on Esc,
// and after an action was chosen.

export interface OverflowItem {
  label: string;
  run(): void;
  /** Name of an icon of the sprite in index.html (i-<name>), drawn before the label */
  icon?: string;
  /** Drawn in the colour of a destructive action */
  danger?: boolean;
}

let installed = false;
function closeOpen(except?: Node | null) {
  for (const d of document.querySelectorAll<HTMLDetailsElement>('details.overflow[open]')) if (!except || !d.contains(except)) d.open = false;
}
function install() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerdown', e => closeOpen(e.target as Node));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOpen(); });
}

export function overflowMenu(label: string, items: readonly OverflowItem[]): HTMLElement {
  install();
  const details = document.createElement('details');
  details.className = 'overflow';
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', label);
  summary.title = label;
  summary.textContent = '⋯';
  const panel = document.createElement('div');
  panel.className = 'overflow-panel';
  panel.setAttribute('role', 'menu');
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (item.icon) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#i-${item.icon}`);
      svg.append(use);
      b.append(svg);
    }
    b.append(Object.assign(document.createElement('span'), { textContent: item.label }));
    if (item.danger) b.classList.add('danger');
    b.onclick = () => { details.open = false; item.run(); };
    panel.append(b);
  }
  details.append(summary, panel);
  return details;
}
