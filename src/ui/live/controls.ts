// What the person presses to start, pause and stop: the buttons, the stop bar in the other views, and the keys (Space and Esc
// stop at once, ↑ ↓ change the speed). Stop is never held back: no question, no waiting for anything but the command itself.

import type { Active } from '../../core/training/selection';
import type { ProgramRunner } from '../../core/training/program';
import { $button } from '../ui';

export interface ControlsHost {
  connected(): boolean;
  runner: Pick<ProgramRunner, 'active'>;
  /** What Start starts: a workout, a route or nothing (free training) */
  stage: {
    effectiveActive(): Active;
    runProgram(): Promise<void>;
    runRoute(): Promise<void>;
    setActive(kind: Active): void;
  };
  belt: { start(): Promise<boolean>; stop(): Promise<boolean>; pause(): Promise<boolean> };
  speed: { step(direction: 1 | -1): void };
  /** The question before a start */
  confirmStart(): Promise<boolean>;
}

export function setupControls(host: ControlsHost) {
  $button('start').onclick = async () => {
    // A program that is running is not started again; stop it first
    if (host.runner.active) return;
    const kind = host.stage.effectiveActive();
    if (kind === 'workout') { await host.stage.runProgram(); return; }
    if (kind === 'route') { await host.stage.runRoute(); return; }
    if (!(await host.confirmStart())) return;
    if (host.connected()) await host.belt.start();
  };
  $button('shClear').onclick = () => host.stage.setActive(null);
  $button('pause').onclick = () => void host.belt.pause();
  $button('stop').onclick = () => void host.belt.stop();
  $button('sbStop').onclick = () => void host.belt.stop();

  document.addEventListener('keydown', e => {
    if (!host.connected()) return;
    const el = e.target as HTMLElement;
    const tag = el.tagName;
    const isText = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range');
    if (isText) return;
    if (e.code === 'Space' || e.key === 'Escape') {
      e.preventDefault();
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the focus may be on an element without blur(); nothing here may throw before the stop below
      (document.activeElement as HTMLElement | null)?.blur?.();
      void host.belt.stop();
    } else if (tag !== 'INPUT' && e.key === 'ArrowUp') {
      e.preventDefault(); host.speed.step(1);
    } else if (tag !== 'INPUT' && e.key === 'ArrowDown') {
      e.preventDefault(); host.speed.step(-1);
    }
  });
}
