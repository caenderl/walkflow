// Modal dialogs based on <dialog>. Content is set via textContent, never as HTML.

import { onLanguageChange, t } from './i18n';
import { languageSelect } from './i18n-dom';

export interface DialogButton<T extends string> {
  id: T;
  label: string;
  kind?: 'primary' | 'stop';
}

export interface DialogOptions<T extends string> {
  title: string;
  paragraphs?: string[];
  list?: string[];
  buttons: DialogButton<T>[];
  /** Result on Esc/close */
  cancelId: T;
  /** Checkbox that must be ticked before the first button can be used */
  requireCheckbox?: string;
  /** Esc does not close */
  blocking?: boolean;
  /** Shows a language picker. Pass the options as a function so the dialog can re-render. */
  languagePicker?: boolean;
}

let queue: Promise<unknown> = Promise.resolve();

/** Shows a dialog; several calls are shown one after another. */
export function choose<T extends string>(o: DialogOptions<T> | (() => DialogOptions<T>)): Promise<T> {
  const p = queue.then(() => show(typeof o === 'function' ? o : () => o));
  queue = p.catch(() => undefined);
  return p;
}

export async function confirmDialog(title: string, paragraphs: string[], okLabel = t.common.ok, kind: 'primary' | 'stop' = 'primary'): Promise<boolean> {
  const r = await choose({
    title, paragraphs, cancelId: 'cancel',
    buttons: [{ id: 'ok', label: okLabel, kind }, { id: 'cancel', label: t.common.cancel }],
  });
  return r === 'ok';
}

function show<T extends string>(get: () => DialogOptions<T>): Promise<T> {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    let checked = false;
    let off = () => {};

    const done = (id: T) => {
      off();
      dlg.close();
      dlg.remove();
      resolve(id);
    };

    const render = () => {
      const o = get();
      const nodes: Node[] = [];
      const h = document.createElement('h2');
      h.textContent = o.title;
      if (o.languagePicker) {
        const head = document.createElement('div');
        head.className = 'dlg-head';
        const picker = languageSelect();
        picker.classList.add('dlg-lang');
        head.append(h, picker);
        nodes.push(head);
      } else {
        nodes.push(h);
      }
      for (const text of o.paragraphs ?? []) {
        const p = document.createElement('p');
        p.textContent = text;
        nodes.push(p);
      }
      if (o.list?.length) {
        const ul = document.createElement('ul');
        for (const text of o.list) {
          const li = document.createElement('li');
          li.textContent = text;
          ul.append(li);
        }
        nodes.push(ul);
      }
      let check: HTMLInputElement | null = null;
      if (o.requireCheckbox) {
        const label = document.createElement('label');
        label.className = 'check';
        check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = checked;
        check.addEventListener('change', () => { checked = check!.checked; });
        label.append(check, ` ${o.requireCheckbox}`);
        nodes.push(label);
      }
      const row = document.createElement('div');
      row.className = 'row';
      const buttons = o.buttons.map((b, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = b.label;
        if (b.kind) btn.classList.add(b.kind);
        if (i === 0 && check) {
          btn.disabled = !checked;
          check.addEventListener('change', () => { btn.disabled = !check!.checked; });
        }
        btn.addEventListener('click', () => done(b.id));
        row.append(btn);
        return btn;
      });
      nodes.push(row);
      dlg.replaceChildren(...nodes);
      return { o, buttons, check };
    };

    const first = render();
    dlg.addEventListener('cancel', e => {
      e.preventDefault();
      const o = get();
      if (!o.blocking) done(o.cancelId);
    });
    document.body.append(dlg);
    dlg.showModal();
    // Do not put the focus on the first (confirming) button
    const { o, buttons, check } = first;
    (buttons.find((_, i) => o.buttons[i]!.id === o.cancelId) ?? check ?? buttons[0])?.focus();
    if (o.languagePicker) {
      off = onLanguageChange(() => {
        render();
        dlg.querySelector<HTMLSelectElement>('.dlg-lang')?.focus();
      });
    }
  });
}
