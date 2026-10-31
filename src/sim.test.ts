import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreadmillClient, type TreadmillEvents } from './ble';
import { cmdPause, cmdRequestControl, cmdSetInclination, cmdSetSpeed, cmdStart, cmdStop, parseMachineStatus, type TreadmillData } from './ftms';
import { SimulatorAdapter } from './sim';

function setup(opts = {}) {
  const sim = new SimulatorAdapter(opts);
  const logs: string[] = [];
  const data: TreadmillData[] = [];
  const machine: string[] = [];
  const ev: TreadmillEvents = {
    log: m => logs.push(m),
    data: d => data.push(d),
    heartRate: vi.fn(),
    machineStatus: d => machine.push(parseMachineStatus(d)?.kind ?? '?'),
    trainingStatus: vi.fn(),
    disconnected: vi.fn(),
  };
  const client = new TreadmillClient(sim, ev);
  return { sim, client, logs, data, machine, ev, last: () => data.at(-1)! };
}

describe('Simulator + TreadmillClient', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('verbindet sich wie ein echtes FTMS-Band', async () => {
    const { client, logs } = setup();
    const p = client.connect();
    await vi.advanceTimersByTimeAsync(500);
    const info = await p;
    expect(info.speedRange).toEqual({ min: 1, max: 8, step: 0.1 });
    expect(info.inclRange).toEqual({ min: 0, max: 10, step: 1 });
    expect(info.features?.targetNames).toEqual(['Speed', 'Inclination']);
    expect(info.hasHeartRate).toBe(false);
    expect(logs).toContain('Hersteller: Walkflow');
  });

  it('ohne Request Control: keine Berechtigung', async () => {
    const { client, logs } = setup();
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500); await p;
    void client.send(cmdStart());
    await vi.advanceTimersByTimeAsync(100);
    expect(logs).toContain('← Start/Resume: keine Berechtigung');
  });

  it('Start → Countdown → Mindest-Speed, dann Set Speed, Stop', async () => {
    const { client, sim, last, machine, logs } = setup();
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500); await p;
    void client.send(cmdRequestControl());
    void client.send(cmdStart());
    await vi.advanceTimersByTimeAsync(2000);
    expect(sim.belt.state).toBe('countdown');
    expect(last().speed).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(last().speed).toBe(1);
    void client.send(cmdSetSpeed(3));
    await vi.advanceTimersByTimeAsync(3000);
    expect(last().speed).toBe(3);
    expect(last().dist).toBeGreaterThan(0);
    expect(logs).toContain('← Set Speed: OK');
    void client.send(cmdStop());
    await vi.advanceTimersByTimeAsync(3000);
    expect(last().speed).toBe(0);
    expect(machine).toEqual(['started', 'target-speed', 'stopped']);
  });

  it('Set Speed außerhalb der Range → ungültiger Parameter', async () => {
    const { client, logs } = setup();
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500); await p;
    void client.send(cmdRequestControl());
    void client.send(cmdSetSpeed(9));
    void client.send(cmdSetInclination(3));
    await vi.advanceTimersByTimeAsync(200);
    expect(logs).toContain('← Set Speed: ungültiger Parameter');
    expect(logs).toContain('← Set Inclination: OK');
  });

  it('Pause behält Distanz, Stop setzt beim nächsten Start zurück', async () => {
    const { client, sim } = setup();
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500); await p;
    void client.send(cmdRequestControl());
    void client.send(cmdStart());
    await vi.advanceTimersByTimeAsync(10_000);
    void client.send(cmdPause());
    await vi.advanceTimersByTimeAsync(2000);
    const d = sim.belt.dist;
    expect(sim.belt.state).toBe('paused');
    void client.send(cmdStart());
    await vi.advanceTimersByTimeAsync(5000);
    expect(sim.belt.dist).toBeGreaterThan(d);
    void client.send(cmdStop());
    await vi.advanceTimersByTimeAsync(2000);
    void client.send(cmdStart());
    await vi.advanceTimersByTimeAsync(100);
    expect(sim.belt.dist).toBe(0);
  });

  it('Verbindungsabbruch: das simulierte Band läuft weiter', async () => {
    const { client, sim, ev } = setup();
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500); await p;
    void client.send(cmdRequestControl());
    void client.send(cmdStart());
    void client.send(cmdSetSpeed(3));
    await vi.advanceTimersByTimeAsync(10_000);
    sim.simulateConnectionLoss();
    expect(ev.disconnected).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sim.belt.speed).toBe(3);
    await expect(client.send(cmdStop())).resolves.toBe(false);
    sim.dispose();
  });

  it('Sicherheitsschlüssel: Band steht sofort, Machine Status meldet es', async () => {
    const { client, sim, machine } = setup();
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500); await p;
    void client.send(cmdRequestControl());
    void client.send(cmdStart());
    await vi.advanceTimersByTimeAsync(6000);
    sim.pullSafetyKey();
    expect(sim.belt.speed).toBe(0);
    expect(machine.at(-1)).toBe('safety-key');
  });

  it('optional mit Puls-Service', async () => {
    const { client, ev } = setup({ heartRate: true });
    const p = client.connect(); await vi.advanceTimersByTimeAsync(500);
    expect((await p).hasHeartRate).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ev.heartRate).toHaveBeenCalled();
  });
});
