// Scoring orchestrator — tracks peaks, appends history, and checks end
// conditions each tick. All evaluation logic lives in src/model/Scoring.js;
// this class is a thin writer that persists peak trackers and emits WON/LOST.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import {
  evaluateOutcome,
  grade,
  worldAvgAdoption,
  worldAvgWill,
} from '../model/Scoring.js';

const HISTORY_FIELDS = [
  'tempHistory', 'co2History', 'emissionsHistory',
  'adoptionHistory', 'nzHistory', 'willHistory', 'stressHistory',
];

export class ScoringSystem {
  constructor(state, bus) {
    this.s = state;
    this.b = bus;
    // Persist peakTemp onto state so save/restore survives a reload.
    this.peakTemp = state.world.peakTempAnomalyC ?? state.world.tempAnomalyC;
    this._unsub = bus.on(EVT.TICK, () => this.check());
  }

  destroy() { this._unsub?.(); this._unsub = null; }

  check() {
    const s = this.s;
    const w = s.world;
    this.peakTemp = Math.max(this.peakTemp, w.tempAnomalyC);
    w.peakTempAnomalyC = this.peakTemp;
    w.peakCO2ppm = Math.max(w.peakCO2ppm ?? w.co2ppm, w.co2ppm);

    const nzCount = Object.values(s.countries).filter(c => c.netZero).length;
    w.tempHistory.push(w.tempAnomalyC);
    w.co2History.push(w.co2ppm);
    w.emissionsHistory.push(w.annualEmissionsGtCO2);
    w.adoptionHistory.push(worldAvgAdoption(s));
    w.nzHistory.push(nzCount);
    w.willHistory.push(worldAvgWill(s));
    w.stressHistory.push(w.societalStress ?? 0);

    const cap = BALANCE.historyLength;
    for (const key of HISTORY_FIELDS) {
      const h = w[key];
      if (h.length > cap) h.splice(0, h.length - cap);
    }

    const outcome = evaluateOutcome(s, this.peakTemp);
    if (!outcome) return;
    if (outcome.status === 'lost')      this._lose(outcome.reason);
    else if (outcome.status === 'won')  this._win(outcome.perfect);
  }

  _win(perfect) {
    if (this.s.meta.status !== 'running') return;
    this.s.meta.status = 'won';
    this.b.emit(EVT.WON, {
      grade: grade(this.s, this.peakTemp, perfect),
      peakTemp: this.peakTemp,
      perfect: !!perfect,
    });
  }

  _lose(reason) {
    if (this.s.meta.status !== 'running') return;
    this.s.meta.status = 'lost';
    this.b.emit(EVT.LOST, { reason, peakTemp: this.peakTemp });
  }

  // Preserved for code that reaches in (none currently, but UI may want it).
  grade(perfect) {
    return grade(this.s, this.peakTemp, perfect);
  }
}
