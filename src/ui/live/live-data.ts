// What the treadmill reports while connected: the live figures, the heart rate, Machine Status and Training Status.
// It keeps the session state up to date, hands the speed to the governor and the standstill detection, ends a program when the
// treadmill stops (by its own button, or when the belt stands still), and records one sample a second for the chart and the history.
// It also reads the treadmill's answers to commands (a refused Stop, a refused speed). It sends nothing to the treadmill. Drawing goes through the host.

import type { Sample } from '../../core/history/export';
import type { RunRecorder, RunSource } from '../../core/history/runs';
import { hex, OP, parseMachineStatus, parseTrainingStatus, type ControlPointResponse, type TreadmillData } from '../../core/protocol/ftms';
import type { BeltBanner } from '../../core/safety/belt-banner';
import type { SpeedGovernor, StandstillDetector } from '../../core/safety/safety';
import type { ProgramRunner } from '../../core/training/program';
import type { TreadmillEvents } from '../../device/ble';
import { t } from '../../i18n/i18n';
import { describeControlPointResponse, describeMachineStatus, noticeText } from './treadmill-text';
import type { Session } from './session';

/** Samples kept for the chart and the export (about 5½ hours at 1 Hz) */
const MAX_SAMPLES = 20000;

export interface LiveDataHost {
  session: Session;
  banner: BeltBanner;
  governor: SpeedGovernor;
  standstill: StandstillDetector;
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
  /** true: the treadmill refused a Stop or Pause while the belt moves, so the person has to stop it on the treadmill */
  stopFailed(failed: boolean): void;
}

/** Control Point result code "Success" */
const RESULT_OK = 1;

export function setupLiveData(host: LiveDataHost) {
  const { session, banner, governor, standstill, runner } = host;
  const { cur, samples } = session;
  let lastSample = 0;
  let source: RunSource = 'ble';

  function onData(r: TreadmillData) {
    if (r.speed !== undefined) cur.speed = r.speed;
    if (r.dist !== undefined) { cur.dist = r.dist; host.distance(cur.dist); }
    if (r.incl !== undefined) cur.incl = r.incl;
    if (r.kcal !== undefined) cur.kcal = r.kcal;
    if (r.time !== undefined) cur.time = r.time;
    if (r.hr !== undefined && r.hr > 0) cur.hr = r.hr;
    host.renderStats();

    if (r.speed !== undefined) {
      banner.speed(r.speed, host.now());
      session.lastMeasured = r.speed;
      session.lastMeasuredAt = host.now();
      governor.noteMeasured(r.speed);
      if (standstill.feed(r.speed, host.now()) && runner.active) {
        host.log(t.program.standstillLog);
        runner.abort(() => t.program.standstill, true);
        governor.reset();
      }
    }
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
  }

  function onMachineStatus(dv: DataView) {
    const e = parseMachineStatus(dv);
    host.log(t.machine.status(hex(dv), e ? describeMachineStatus(e) : null));
    if (!e) return;
    switch (e.kind) {
      case 'stopped':
      case 'paused':
      case 'safety-key':
        banner.stopRequested(host.now());
        session.beltStarted = false;
        if (runner.active) runner.abort(() => t.program.endedBy(describeMachineStatus(e)));
        governor.reset();
        standstill.disarm();
        break;
      case 'started':
        session.beltStarted = true;
        break;
      case 'control-lost':
        session.controlLost = true;
        host.log(t.machine.controlLostLog);
        break;
      default:
        break;
    }
  }

  /**
   * A write that went through is not yet a command the treadmill accepted. What it refused must not count as done: a refused
   * Stop on a moving belt is told to the person, a refused speed ends the ramp, refused control is asked for again at the next stop.
   */
  function onControlResponse(r: ControlPointResponse) {
    host.log(`← ${describeControlPointResponse(r)}`);
    if (r.result === RESULT_OK) return;
    switch (r.requestOp) {
      case OP.STOP_PAUSE:
        // A belt that stands has nothing to stop: some treadmills answer "failed" then
        if ((session.lastMeasured ?? 0) > 0) host.stopFailed(true);
        break;
      case OP.SET_SPEED:
        governor.commandRefused();
        host.log(t.limit.speedRefused);
        break;
      case OP.REQUEST_CONTROL:
        session.controlLost = true;
        break;
      default:
        break;
    }
  }

  const events: Omit<TreadmillEvents, 'disconnected'> = {
    log: host.log,
    notice: n => host.log(noticeText(n)),
    data: onData,
    heartRate: bpm => { if (bpm > 0) { cur.hr = bpm; host.renderStats(); } },
    machineStatus: onMachineStatus,
    controlResponse: onControlResponse,
    trainingStatus: dv => {
      host.log(t.machine.training(hex(dv), parseTrainingStatus(dv)?.text ?? null));
    },
  };

  return {
    /** What the treadmill client calls (everything but the disconnect) */
    events,
    /** Where the samples come from; the history keeps demo runs apart */
    setSource(s: RunSource) { source = s; },
  };
}
