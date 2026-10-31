// Modale Dialoge auf Basis von <dialog>. Inhalte werden per textContent gesetzt, nie als HTML.

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
  /** Ergebnis bei Esc/Schließen */
  cancelId: T;
  /** Checkbox, die vor dem ersten Button angehakt sein muss */
  requireCheckbox?: string;
  /** Esc schließt nicht */
  blocking?: boolean;
}

let queue: Promise<unknown> = Promise.resolve();

/** Zeigt einen Dialog; mehrere Aufrufe werden nacheinander angezeigt. */
export function choose<T extends string>(o: DialogOptions<T>): Promise<T> {
  const p = queue.then(() => show(o));
  queue = p.catch(() => undefined);
  return p;
}

export async function confirmDialog(title: string, paragraphs: string[], okLabel = 'OK', kind: 'primary' | 'stop' = 'primary'): Promise<boolean> {
  const r = await choose({
    title, paragraphs, cancelId: 'cancel',
    buttons: [{ id: 'ok', label: okLabel, kind }, { id: 'cancel', label: 'Abbrechen' }],
  });
  return r === 'ok';
}

function show<T extends string>(o: DialogOptions<T>): Promise<T> {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    const h = document.createElement('h2');
    h.textContent = o.title;
    dlg.append(h);
    for (const t of o.paragraphs ?? []) {
      const p = document.createElement('p');
      p.textContent = t;
      dlg.append(p);
    }
    if (o.list?.length) {
      const ul = document.createElement('ul');
      for (const t of o.list) {
        const li = document.createElement('li');
        li.textContent = t;
        ul.append(li);
      }
      dlg.append(ul);
    }
    let check: HTMLInputElement | null = null;
    if (o.requireCheckbox) {
      const label = document.createElement('label');
      label.className = 'check';
      check = document.createElement('input');
      check.type = 'checkbox';
      label.append(check, ` ${o.requireCheckbox}`);
      dlg.append(label);
    }
    const row = document.createElement('div');
    row.className = 'row';
    const buttons = o.buttons.map((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      if (b.kind) btn.classList.add(b.kind);
      if (i === 0 && check) {
        btn.disabled = true;
        check.addEventListener('change', () => { btn.disabled = !check!.checked; });
      }
      btn.addEventListener('click', () => done(b.id));
      row.append(btn);
      return btn;
    });
    dlg.append(row);

    const done = (id: T) => {
      dlg.close();
      dlg.remove();
      resolve(id);
    };
    dlg.addEventListener('cancel', e => {
      e.preventDefault();
      if (!o.blocking) done(o.cancelId);
    });
    document.body.append(dlg);
    dlg.showModal();
    // Fokus nicht auf den ersten (bestätigenden) Button legen
    (buttons.find((_, i) => o.buttons[i]!.id === o.cancelId) ?? check ?? buttons[0])?.focus();
  });
}
