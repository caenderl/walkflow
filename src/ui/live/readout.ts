// What the training view shows of the belt: the figures (and the stop bar of the other views), the banner over them, which
// of Start and Pause are available, and the speed chart. Display only: nothing here sends anything, and nothing here may get in
// the way of a stop (the drawing of banner and buttons swallows its own errors).

import { drawChart } from '../components/chart';
import type { BeltBanner } from '../../core/safety/belt-banner';
import { controlAvailability } from '../../core/safety/safety';
import { fmtTime } from '../../core/training/program';
import { t } from '../../i18n/i18n';
import { toDist, toSpeed } from '../../i18n/units';
import { $, $button } from '../ui';
import type { Session } from './session';

export interface ReadoutHost {
  session: Session;
  banner: BeltBanner;
  now(): number;
  /** A workout or route is running */
  programActive(): boolean;
  /** The treadmill said it can change its incline (the figure is hidden until then) */
  inclineReported(): boolean;
  /** The highest speed that may be sent: the chart's axis follows it */
  effectiveMax(): number;
  /** The speed the belt is being regulated to, if any */
  target(): number | null;
}

export function setupReadout(host: ReadoutHost) {
  const { session, banner } = host;
  const { cur, samples } = session;

  /**
   * Start waits while the belt moves, a start was just sent or a program runs; Pause is there while the belt may be running.
   * Stop is not touched here: the connection enables it, and nothing takes it away (controlAvailability).
   */
  function renderControls() {
    try {
      const a = controlAvailability({
        connected: session.connected(),
        measuredKmh: session.lastMeasured,
        measuredAgeMs: host.now() - session.lastMeasuredAt,
        startedByApp: session.beltStarted,
        startingNow: banner.state(host.now()).kind === 'start',
        programActive: host.programActive(),
      });
      $button('start').disabled = !a.start;
      $button('pause').disabled = !a.pause;
    } catch { /* display only */ }
  }

  /** Follows the banner state: kind, colour, text and how strong it is */
  function renderBanner() {
    try {
      const { kind, opacity } = banner.state(host.now());
      const el = $('beltBanner');
      el.hidden = kind === 'none';
      if (kind === 'none') return;
      el.className = `belt-banner ${kind === 'start' ? 'bb-start' : kind === 'offline' ? 'bb-offline' : 'bb-stop'}`;
      el.style.opacity = kind === 'offline' ? '' : String(opacity);
      $('bbText').textContent = kind === 'start' ? t.banner.start : kind === 'stopping' ? t.banner.stopping : kind === 'stopped' ? t.banner.stopped : t.connection.offlineHint;
    } catch { /* display only */ }
  }

  function renderStats() {
    const f = (v: number | undefined, digits: number) => (v === undefined ? '–' : t.number(v, digits));
    const connected = session.connected();
    // Without a connection the current speed is unknown; do not leave the last value standing
    $('vSpeed').textContent = connected ? f(cur.speed === undefined ? undefined : toSpeed(cur.speed), 1) : '–';
    $('vDist').textContent = f(cur.dist === undefined ? undefined : toDist(cur.dist), 2);
    $('vIncl').textContent = f(cur.incl, 1);
    $('statIncl').hidden = !host.inclineReported() && cur.incl === undefined;
    $('vTime').textContent = cur.time === undefined ? '–' : fmtTime(cur.time);
    $('vHr').textContent = cur.hr === undefined ? '–' : String(cur.hr);
    $('vKcal').textContent = cur.kcal === undefined ? '–' : String(cur.kcal);
    // Stop bar (views other than training)
    $('sbSpeed').textContent = connected && cur.speed !== undefined ? t.control.speed(cur.speed) : '–';
    $('sbMore').textContent = connected && cur.time !== undefined ? t.stopBar.more(fmtTime(cur.time), cur.dist ?? 0) : '';
    $('sbState').textContent = (session.lastMeasured ?? 0) > 0 ? t.stopBar.running : t.stopBar.idle;
  }

  function redrawChart() {
    drawChart($<HTMLCanvasElement>('chart'), samples, { now: Date.now(), limit: host.effectiveMax(), target: host.target() ?? 0 });
  }

  return { renderControls, renderBanner, renderStats, redrawChart };
}
