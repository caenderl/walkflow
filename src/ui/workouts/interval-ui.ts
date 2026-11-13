// The workout panel of the training view: the current step (target speed, what is left), a strip of all steps with the
// current one marked, and the next steps. Display only; it reads the runner's progress and changes nothing.

import { t } from '../../i18n/i18n';
import { endingSoon, stepBars, upcoming } from '../../core/training/interval';
import { fmtDistance, fmtLength, fmtTime, programLength, type ProgramProgress, type ProgramStep } from '../../core/training/program';
import { $ } from '../ui';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STRIP_W = 400;
const STRIP_H = 60;
const STRIP_GAP = 1;
const NEXT_COUNT = 3;

export function setupInterval() {
  const strip = $('ivStrip') as unknown as SVGSVGElement;
  let drawn: readonly ProgramStep[] | null = null;
  let rects: SVGRectElement[] = [];

  function drawStrip(steps: readonly ProgramStep[]) {
    if (drawn === steps) return;
    drawn = steps;
    let x = 0;
    rects = stepBars(steps).map(b => {
      const r = document.createElementNS(SVG_NS, 'rect');
      const w = Math.max(1, b.width * STRIP_W - STRIP_GAP), h = b.height * STRIP_H;
      r.setAttribute('x', x.toFixed(2)); r.setAttribute('y', (STRIP_H - h).toFixed(2));
      r.setAttribute('width', w.toFixed(2)); r.setAttribute('height', h.toFixed(2));
      r.setAttribute('rx', '2');
      x += b.width * STRIP_W;
      return r;
    });
    strip.replaceChildren(...rects);
  }

  const describe = (s: ProgramStep) => `${fmtLength({ sec: s.sec ?? 0, meters: s.meters ?? 0 })} · ${t.control.speed(s.speed)}`;

  return {
    /** A chosen workout that has not started: its steps and total length */
    renderPreview(steps: readonly ProgramStep[]) {
      // The name and the summary are in the stage's heading already
      $('ivSpeed').textContent = steps[0] ? t.u.speedValue(steps[0].speed, 1) : '–';
      $('ivLeft').textContent = fmtLength(programLength(steps));
      $('ivLeftLabel').textContent = t.interval.total;
      $('ivLeft').classList.remove('iv-ending');
      $<HTMLProgressElement>('ivBar').value = 0;
      drawStrip(steps);
      rects.forEach(r => r.setAttribute('class', 'iv-todo'));
      $('ivNext').replaceChildren(...upcoming(steps, -1, NEXT_COUNT).map(s => Object.assign(document.createElement('li'), { textContent: describe(s) })));
    },
    /**
     * @param target the speed the belt is asked for now (capped to the limit), null if there is none yet
     */
    render(p: ProgramProgress, target: number | null) {
      const step = p.index >= 0 ? p.steps[p.index] : undefined;
      $('ivSpeed').textContent = step ? t.u.speedValue(target ?? step.speed, 1) : '–';
      const left = p.left;
      $('ivLeft').textContent = !left ? '–' : 'sec' in left ? fmtTime(left.sec) : fmtDistance(left.meters);
      $('ivLeftLabel').textContent = !left ? '' : 'sec' in left ? t.interval.timeLeft : t.interval.distanceLeft;
      $<HTMLProgressElement>('ivBar').value = Math.round(p.fraction * 1000);
      $('ivLeft').classList.toggle('iv-ending', step !== undefined && endingSoon(left));

      drawStrip(p.steps);
      rects.forEach((r, i) => r.setAttribute('class', i < p.index ? 'iv-done' : i === p.index ? 'iv-now-bar' : 'iv-todo'));

      const next = upcoming(p.steps, p.index, NEXT_COUNT);
      $('ivNext').replaceChildren(...(next.length ? next : []).map(s => Object.assign(document.createElement('li'), { textContent: describe(s) })));
      if (!next.length && step) $('ivNext').replaceChildren(Object.assign(document.createElement('li'), { textContent: t.interval.lastStep, className: 'none' }));
    },
    /** A new workout starts: draw its strip again */
    reset() { drawn = null; },
  };
}
