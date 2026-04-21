// Fixed-step game loop. Decouples tick rate from render rate.
//
// Differences from a naive raf loop:
//   - Sub-tick progress is exposed via fractionalTick() so UI can interpolate
//     smoothly between ticks (research countdowns, etc).
//   - dt is clamped so tab-throttling / raf-skipping can't dump a giant
//     accumulated delta into a single frame and skip-tick the simulation.
//   - visibilitychange pauses the clock's accumulator so the game doesn't
//     silently burn through ticks while the tab is hidden.

import { EVT } from './EventBus.js';
import { BALANCE } from '../config/balance.js';

const MAX_FRAME_MS = 250; // never process more than ~4 frames of backlog at once

export class GameLoop {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.acc = 0;
    this.last = 0;
    this.raf = null;
    this._onVis = this._onVis.bind(this);
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
    document.addEventListener('visibilitychange', this._onVis);
  }

  stop() {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    document.removeEventListener('visibilitychange', this._onVis);
  }

  // Fractional tick ∈ [0, 1). UI uses this to animate between discrete ticks.
  // Freezes at its last value when paused so progress bars don't rewind.
  fractionalTick() {
    return Math.max(0, Math.min(1, this.acc / BALANCE.tickIntervalMs));
  }

  setPaused(v) { this.state.meta.paused = v; }
  setSpeed(v) { this.state.meta.speed = v; }

  _onVis() {
    // Reset the frame clock when coming back so we don't inject a huge dt.
    if (!document.hidden) this.last = performance.now();
  }

  _frame(now) {
    let dt = now - this.last;
    this.last = now;
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;
    if (!this.state.meta.paused && this.state.meta.status === 'running') {
      this.acc += dt * (this.state.meta.speed ?? 1);
      while (this.acc >= BALANCE.tickIntervalMs) {
        this.acc -= BALANCE.tickIntervalMs;
        this._tick();
      }
    }
    this.raf = requestAnimationFrame(this._frame);
  }

  _tick() {
    this.state.meta.tick += 1;
    this.state.meta.quarter = (this.state.meta.tick % BALANCE.ticksPerYear) + 1;
    this.state.meta.year = BALANCE.startYear + Math.floor(this.state.meta.tick / BALANCE.ticksPerYear);
    this.bus.emit(EVT.TICK, { tick: this.state.meta.tick });
  }
}
