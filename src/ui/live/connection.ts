// The connection to the treadmill as the person sees it: connecting (the real one or the demo), disconnecting, a connection
// that is lost, the header status, and which buttons need a connection. It owns the two adapters. What the treadmill reports
// while connected is live-data.ts, the commands are belt.ts.

import { type BleAdapter, type ConnectResult, TreadmillClient, WebBluetoothAdapter, type TreadmillEvents } from '../../device/ble';
import { SimulatorAdapter } from '../../device/sim';
import { cmdRequestControl } from '../../core/protocol/ftms';
import type { RunSource } from '../../core/history/runs';
import type { BeltBanner } from '../../core/safety/belt-banner';
import type { SpeedGovernor, StandstillDetector } from '../../core/safety/safety';
import type { ProgramRunner } from '../../core/training/program';
import { t, type Text } from '../../i18n/i18n';
import { APP_VERSION } from '../../platform/config';
import { choose, confirmDialog } from '../components/dialogs';
import { desktop } from '../desktop';
import { ensureDisclaimer } from '../disclaimer';
import { bindText } from '../i18n-dom';
import { $, $button, log } from '../ui';
import { stopPlacement, type View } from '../views';
import type { Session } from './session';

export interface ConnectionHost {
  session: Session;
  banner: BeltBanner;
  governor: SpeedGovernor;
  standstill: StandstillDetector;
  runner: Pick<ProgramRunner, 'abort'>;
  /** What the treadmill client calls, except the disconnect (which is handled here) */
  events: Omit<TreadmillEvents, 'disconnected'>;
  speed: {
    setDeviceRange(min: number, max: number): void;
    applyLimits(): void;
  };
  incline: {
    reset(): void;
    onConnected(info: ConnectResult, real: boolean): void;
  };
  background: { acquireWakeLock(): Promise<void>; releaseWakeLock(): void };
  recorder: { finish(): void };
  live: { setSource(s: RunSource): void };
  /** Stops the belt; the reason is shown as the end of a program */
  stop(reason: Text): Promise<boolean>;
  now(): number;
  renderStats(): void;
  renderBanner(): void;
  renderControls(): void;
  /** The settings are locked while the belt runs */
  renderSettingsLock(): void;
}

export function setupConnection(host: ConnectionHost) {
  const { session, banner, governor, standstill } = host;
  const webAdapter = new WebBluetoothAdapter();
  let sim: SimulatorAdapter | null = null;
  let view: View = 'training';
  let uiConnected = false;

  const connected = () => session.connected();
  const maybeRunning = () => session.maybeRunning();

  async function connect(kind: 'ble' | 'demo') {
    if (connected() || !(await ensureDisclaimer())) return;
    $button('connect').disabled = true;
    $button('demo').disabled = true;
    try {
      setStatus(() => kind === 'demo' ? t.connection.demoConnecting : t.connection.searching);
      let adapter: BleAdapter = webAdapter;
      if (kind === 'demo') adapter = sim ??= new SimulatorAdapter({ version: APP_VERSION });
      const c = new TreadmillClient(adapter, { ...host.events, disconnected: onDisconnected });
      session.begin(c);
      const source: RunSource = kind === 'demo' ? 'demo' : 'ble';
      host.live.setSource(source);
      host.speed.setDeviceRange(1.0, 12.0);
      host.incline.reset();
      const info = await c.connect();

      if (info.speedRange) host.speed.setDeviceRange(info.speedRange.min, info.speedRange.max);
      host.incline.onConnected(info, source === 'ble');
      host.renderStats();

      governor.reset();
      await host.background.acquireWakeLock();
      host.speed.applyLimits();
      setUi(true);
      $('alarm').hidden = true;
      $('demoBanner').hidden = kind !== 'demo';
      const name = info.deviceName;
      bindText($('deviceName'), () => name ?? t.connection.defaultDeviceName);
      setStatus(() => {
        const shown = name ?? t.connection.defaultDeviceName;
        return kind === 'demo' ? t.connection.demoConnected(shown) : t.connection.connected(shown);
      }, () => (kind === 'demo' ? t.connection.demoConnectedShort : t.connection.connectedShort));
      desktop?.connectionChanged(true);
      await c.send(cmdRequestControl());
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : String(e)}`);
      if (!connected()) {
        session.client = null;
        setStatus(() => t.connection.notConnected);
        setUi(false);
      }
    }
  }

  function onDisconnected() {
    const wasRunning = maybeRunning();
    log(t.disconnect.log);
    host.runner.abort(() => t.disconnect.programEnded);
    governor.reset();
    standstill.disarm();
    host.background.releaseWakeLock();
    desktop?.connectionChanged(false);
    session.client = null;
    session.forgetBelt();
    setStatus(() => t.connection.notConnected);
    host.renderStats();
    $('demoBanner').hidden = true;
    setUi(false);
    if (wasRunning) {
      $('alarm').hidden = false;
      $('alarm').scrollIntoView({ block: 'start' });
      log(t.disconnect.lostWhileRunning);
    }
    host.recorder.finish();
  }

  async function disconnectClicked() {
    if (!session.client) return;
    if (maybeRunning()) {
      const choice = await choose({
        title: t.disconnect.runningTitle,
        paragraphs: [t.disconnect.runningText],
        buttons: [
          { id: 'stop', label: t.disconnect.stopFirst, kind: 'primary' },
          { id: 'force', label: t.disconnect.force },
          { id: 'cancel', label: t.common.cancel },
        ],
        cancelId: 'cancel',
      });
      if (choice === 'cancel') return;
      if (choice === 'stop') {
        const ok = await host.stop(() => t.stop.beforeDisconnect);
        if (!(ok && await waitUntil(() => !maybeRunning(), 10_000))) {
          const force = await confirmDialog(t.disconnect.stillMovingTitle, [t.disconnect.stillMovingText(session.lastMeasured)], t.disconnect.force);
          if (!force) return;
        }
      }
    }
    session.client?.disconnect();
  }

  function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const t0 = host.now();
      const check = () => {
        if (cond()) resolve(true);
        else if (host.now() - t0 >= timeoutMs || !connected()) resolve(false);
        else setTimeout(check, 200);
      };
      check();
    });
  }

  function setUi(isConnected: boolean) {
    // Layout switch (style.css): connection menu content, fixed control dock on narrow screens, stop bar
    uiConnected = isConnected;
    banner.setConnected(isConnected);
    host.renderBanner();
    document.documentElement.classList.toggle('connected', isConnected);
    applyStopPlacement();
    host.renderSettingsLock();
    $button('connect').disabled = isConnected || !$('unsupported').hidden;
    $button('demo').disabled = isConnected;
    $button('disconnect').disabled = !isConnected;
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.needs-conn').forEach(el => { el.disabled = !isConnected; });
    host.renderControls();
  }

  /** Status in the header; narrow screens show the short form (the device name is in the connection menu). */
  function setStatus(text: Text, short: Text = text) {
    bindText($('status'), text);
    bindText($('statusShort'), short);
  }

  /** Controls in the training view, the stop bar elsewhere while connected (tested in views.test.ts). */
  function applyStopPlacement() {
    document.documentElement.dataset.stop = stopPlacement(view, uiConnected);
  }

  return {
    connect, disconnectClicked, setUi, setStatus,
    /** The view changed (training, history, …): the stop bar follows */
    setView(v: View) { view = v; applyStopPlacement(); },
    /** The connection menu and the layout follow the connection (as last set by setUi) */
    uiConnected: () => uiConnected,
    /** Whether the browser can do Bluetooth at all and an adapter is there (not asked in the desktop app: the macOS prompt) */
    availability: () => webAdapter.availability(),
    /** The demo treadmill, once it was used: lets the demo buttons simulate a lost connection or a pulled key */
    simulator: () => sim,
  };
}
