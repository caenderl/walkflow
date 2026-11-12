// The banner over the live figures: green while the belt gets ready to start (and fading out), red while it stops (and
// getting stronger), a grey "not connected" overlay without a connection. Display only: nothing here sends anything or
// holds anything back, it follows the belt phase of the treadmill (core/safety/belt-phase.ts) and the measured speed. No DOM.

import { MOVING_KMH, STANDING_KMH, START_MS, STOP_MAX_MS } from '../../core/safety/belt-phase';

export { START_MS } from '../../core/safety/belt-phase';

/** How long the red stays after the belt stands */
export const STOP_HOLD_MS = 3000;

export type BannerKind = 'none' | 'start' | 'stopping' | 'stopped' | 'offline';
export interface BannerState {
  kind: BannerKind;
  /** 0 (not to be seen) to 1 (full colour) */
  opacity: number;
}

const NONE: BannerState = { kind: 'none', opacity: 0 };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class BeltBanner {
  private isConnected = false;
  private speedNow: number | undefined;
  private startAt: number | null = null;
  private stop: { at: number; from: number; strongest: number; standingAt: number | null } | null = null;

  setConnected(connected: boolean): void {
    this.isConnected = connected;
    if (!connected) { this.startAt = null; this.stop = null; this.speedNow = undefined; }
  }

  /** A start was sent: the treadmill counts down now */
  startRequested(nowMs: number): void {
    this.stop = null;
    this.startAt = nowMs;
  }

  /** A stop or pause was sent, or the treadmill says it stopped. Nothing to show if the belt does not move. */
  stopRequested(nowMs: number): void {
    if (this.stop) return;
    this.startAt = null;
    const v = this.speedNow;
    if (v === undefined || v < STANDING_KMH) return;
    this.stop = { at: nowMs, from: v, strongest: 0, standingAt: null };
  }

  /** The measured speed of the belt in km/h */
  speed(kmh: number, nowMs: number): void {
    this.speedNow = kmh;
    if (this.startAt !== null && kmh >= MOVING_KMH) this.startAt = null;
    const s = this.stop;
    if (s) {
      s.strongest = Math.max(s.strongest, clamp01(1 - kmh / s.from));
      if (kmh < STANDING_KMH && s.standingAt === null) s.standingAt = nowMs;
    }
  }

  state(nowMs: number): BannerState {
    if (!this.isConnected) return { kind: 'offline', opacity: 1 };
    if (this.startAt !== null) {
      const left = 1 - (nowMs - this.startAt) / START_MS;
      if (left <= 0) { this.startAt = null; return NONE; }
      return { kind: 'start', opacity: clamp01(left) };
    }
    const s = this.stop;
    if (s) {
      if (s.standingAt !== null) {
        if (nowMs - s.standingAt >= STOP_HOLD_MS) { this.stop = null; return NONE; }
        return { kind: 'stopped', opacity: 1 };
      }
      if (nowMs - s.at >= STOP_MAX_MS) { this.stop = null; return NONE; }
      return { kind: 'stopping', opacity: s.strongest };
    }
    return NONE;
  }
}
