// What the treadmill reports, as the app uses it: the live figures, one sample a second for the chart and the history, the
// log lines, the banner, and a running program that ends when the belt ends. The treadmill itself (device/treadmill.ts)
// has already acted on it for the belt: the governor, the standstill detection, the belt phase. Nothing here sends anything.

import type { Sample } from '../../core/history/export';
import type { RunRecorder, RunSource } from '../../core/history/runs';
import type { ProgramRunner } from '../../core/training/program';
import type { EndReason, Treadmill } from '../../device/treadmill';
import { t, type Text } from '../../i18n/i18n';
import type { BeltBanner } from './belt-banner';
import { describeControlPointResponse, describeMachineStatus, noticeText } from './treadmill-text';

/** Samples kept for the chart and the export (about 5½ hours at 1 Hz) */
const MAX_SAMPLES = 20000;

/** The latest figures and the recording since the page was opened (1 Hz), for the chart and the export */
export interface Figures {
  readonly cur: Omit<Sample, 'ts'>;
  readonly samples: Sample[];
}

export const newFigures = (): Figures => ({ cur: {}, samples: [] });

export interface LiveDataHost {
  tm: Pick<Treadmill, 'on'>;
  figures: Figures;
  banner: Pick<BeltBanner, 'startRequested' | 'stopRequested' | 'speed'>;
  runner: Pick<ProgramRunner, 'active' | 'abort' | 'tick'>;
  recorder: Pick<RunRecorder, 'feed'>;
  now(): number;
  log(msg: string): void;
  /** The route follows the treadmill's distance */
  distance(meters: number): void;
  /** The figures are drawn again */
  renderStats(): void;
  /** The chart is drawn again */
  redrawChart(): void;
  /** true: a Stop or Pause did not get through, so the person has to stop the belt on the treadmill */
  stopFailed(failed: boolean): void;
}

/** What a program shows as its end when the belt ended for this reason */
function endText(reason: Exclude<EndReason, 'standstill'>): Text {
  switch (reason) {
    case 'stop': return () => t.stop.stopped;
    case 'pause': return () => t.stop.paused;
    case 'console': return () => t.console.stopped;
    case 'machine-stopped': return () => t.program.endedBy(describeMachineStatus({ kind: 'stopped' }));
    case 'machine-paused': return () => t.program.endedBy(describeMachineStatus({ kind: 'paused' }));
    case 'safety-key': return () => t.program.endedBy(describeMachineStatus({ kind: 'safety-key' }));
  }
}

export function setupLiveData(host: LiveDataHost) {
  const { tm, figures, banner, runner } = host;
  const { cur, samples } = figures;
  let lastSample = 0;
  let source: RunSource = 'ble';

  tm.on('data', r => {
    if (r.speed !== undefined) { cur.speed = r.speed; banner.speed(r.speed, host.now()); }
    if (r.dist !== undefined) { cur.dist = r.dist; host.distance(cur.dist); }
    if (r.incl !== undefined) cur.incl = r.incl;
    if (r.kcal !== undefined) cur.kcal = r.kcal;
    if (r.time !== undefined) cur.time = r.time;
    if (r.hr !== undefined && r.hr > 0) cur.hr = r.hr;
    host.renderStats();
    // Notifications also arrive in throttled background tabs
    runner.tick();

    const ts = Date.now();
    if (ts - lastSample >= 1000) {
      lastSample = ts;
      const sample: Sample = { ts, ...cur };
      samples.push(sample);
      if (samples.length > MAX_SAMPLES) samples.shift();
      host.redrawChart();
      host.recorder.feed(sample, source);
    }
  });

  tm.on('heartRate', bpm => { if (bpm > 0) { cur.hr = bpm; host.renderStats(); } });

  tm.on('ended', ({ reason }) => {
    if (reason === 'standstill') {
      if (!runner.active) return;
      host.log(t.program.standstillLog);
      runner.abort(() => t.program.standstill, true);
      return;
    }
    runner.abort(endText(reason));
  });

  // The banner shows what the belt does: a start under way, a stop under way
  tm.on('phase', p => { if (p === 'starting') banner.startRequested(host.now()); else banner.stopRequested(host.now()); });
  tm.on('stopFailed', host.stopFailed);

  tm.on('machineStatus', ({ event, hex }) => {
    host.log(t.machine.status(hex, event ? describeMachineStatus(event) : null));
    if (event?.kind === 'control-lost') host.log(t.machine.controlLostLog);
  });
  tm.on('trainingStatus', ({ hex, text }) => host.log(t.machine.training(hex, text)));
  tm.on('controlResponse', r => host.log(`← ${describeControlPointResponse(r)}`));
  tm.on('notice', n => host.log(noticeText(n)));
  tm.on('log', host.log);

  return {
    /** Where the samples come from; the history keeps demo runs apart */
    setSource(s: RunSource) { source = s; },
  };
}
