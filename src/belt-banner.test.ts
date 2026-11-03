import { describe, expect, it } from 'vitest';
import { BeltBanner, START_MS, STOP_HOLD_MS } from './belt-banner';

const connected = () => { const b = new BeltBanner(); b.setConnected(true); return b; };

describe('BeltBanner: connection', () => {
  it('shows the "not connected" overlay without a connection, nothing with one', () => {
    const b = new BeltBanner();
    expect(b.state(0)).toEqual({ kind: 'offline', opacity: 1 });
    b.setConnected(true);
    expect(b.state(0)).toEqual({ kind: 'none', opacity: 0 });
  });

  it('forgets a start or stop in progress when the connection is lost', () => {
    const b = connected();
    b.startRequested(0);
    b.setConnected(false);
    expect(b.state(100).kind).toBe('offline');
    b.setConnected(true);
    expect(b.state(200)).toEqual({ kind: 'none', opacity: 0 });
  });
});

describe('BeltBanner: start', () => {
  it('is fully there at the start and fades out evenly over the countdown', () => {
    const b = connected();
    b.startRequested(1000);
    expect(b.state(1000)).toEqual({ kind: 'start', opacity: 1 });
    expect(b.state(1000 + START_MS / 2)).toEqual({ kind: 'start', opacity: 0.5 });
    expect(b.state(1000 + START_MS)).toEqual({ kind: 'none', opacity: 0 });
    expect(b.state(1000 + START_MS + 10_000)).toEqual({ kind: 'none', opacity: 0 });
  });

  it('is gone as soon as the belt moves', () => {
    const b = connected();
    b.startRequested(0);
    b.speed(0, 1000);
    expect(b.state(1000).kind).toBe('start');
    b.speed(0.5, 2000);
    expect(b.state(2000)).toEqual({ kind: 'none', opacity: 0 });
  });

  it('never goes below 0 or above 1, whatever the clock does', () => {
    const b = connected();
    b.startRequested(1000);
    expect(b.state(500).opacity).toBe(1);
  });
});

describe('BeltBanner: stop', () => {
  it('starts without colour and gets more red the slower the belt is', () => {
    const b = connected();
    b.speed(4, 0);
    b.stopRequested(1000);
    expect(b.state(1000)).toEqual({ kind: 'stopping', opacity: 0 });
    b.speed(3, 1500);
    expect(b.state(1500)).toEqual({ kind: 'stopping', opacity: 0.25 });
    b.speed(1, 2500);
    expect(b.state(2500)).toEqual({ kind: 'stopping', opacity: 0.75 });
  });

  it('is fully red when the belt stands, stays for 3 seconds, then is gone', () => {
    const b = connected();
    b.speed(4, 0);
    b.stopRequested(0);
    b.speed(0, 3000);
    expect(b.state(3000)).toEqual({ kind: 'stopped', opacity: 1 });
    expect(b.state(3000 + STOP_HOLD_MS - 1)).toEqual({ kind: 'stopped', opacity: 1 });
    expect(b.state(3000 + STOP_HOLD_MS)).toEqual({ kind: 'none', opacity: 0 });
  });

  it('does not go back to less red when the reading jumps up a little', () => {
    const b = connected();
    b.speed(4, 0);
    b.stopRequested(0);
    b.speed(1, 1000);
    b.speed(1.6, 1500);
    expect(b.state(1500).opacity).toBe(0.75);
  });

  it('has nothing to show when the belt is not moving or its speed is not known', () => {
    const idle = connected();
    idle.speed(0, 0);
    idle.stopRequested(100);
    expect(idle.state(100).kind).toBe('none');
    const unknown = connected();
    unknown.stopRequested(100);
    expect(unknown.state(100).kind).toBe('none');
  });

  it('gives up when the treadmill never reports that the belt stands', () => {
    const b = connected();
    b.speed(4, 0);
    b.stopRequested(0);
    expect(b.state(5000).kind).toBe('stopping');
    expect(b.state(60_000).kind).toBe('none');
  });

  it('ends the stop when a start follows, and the start when a stop follows', () => {
    const b = connected();
    b.speed(4, 0);
    b.stopRequested(0);
    b.startRequested(500);
    expect(b.state(500).kind).toBe('start');
    b.speed(4, 600);
    b.stopRequested(1000);
    expect(b.state(1000).kind).toBe('stopping');
  });

  it('a second stop while stopping does not start the red over', () => {
    const b = connected();
    b.speed(4, 0);
    b.stopRequested(0);
    b.speed(2, 1000);
    b.stopRequested(1100);
    expect(b.state(1100).opacity).toBe(0.5);
  });
});
