// Global carbon cycle + temperature response. Thin orchestrator — all math
// lives in src/model/Climate.js. This class is now the *only* writer to
// world.annualEmissionsGtCO2, world.co2ppm, and world.tempAnomalyC.

import { EVT } from '../core/EventBus.js';
import {
  applyBAUDrift,
  computeGlobalEmissionsGt,
  nextCO2ppm,
  nextTempC,
} from '../model/Climate.js';

export class CarbonSystem {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this._unsub = bus.on(EVT.TICK, () => this.step());
  }

  destroy() { this._unsub?.(); this._unsub = null; }

  step() {
    const s = this.state;
    const w = s.world;

    // BAU drift (per-country baseline creep) happens *before* we read the
    // global emissions so the read reflects this tick's state.
    for (const c of Object.values(s.countries)) applyBAUDrift(c);

    w.annualEmissionsGtCO2 = computeGlobalEmissionsGt(s);
    w.co2ppm = nextCO2ppm(w.co2ppm, w.annualEmissionsGtCO2, s);
    w.tempAnomalyC = nextTempC(w.tempAnomalyC, w.co2ppm);
  }
}
