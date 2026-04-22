// Scoring orchestrator — tracks peaks, appends history, and checks end
// conditions each tick. All evaluation logic lives in src/model/Scoring.js;
// this class is a thin writer that persists peak trackers and emits WON/LOST.

import { BALANCE } from '../config/balance.js';
// Sum of pre-adoption country emissions — the "BAU baseline" we compare
// against to compute what clean deployment has prevented. Pulled out for
// clarity; CarbonSystem already applies BAU drift each tick, so reading
// baseEmissionsGtCO2 here gives the correct current-BAU baseline.
function bauBaselineGt(state) {
  let t = 0;
  for (const c of Object.values(state.countries)) t += c.baseEmissionsGtCO2 ?? 0;
  return t;
}
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
  'co2AvoidedHistory',
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

    const avoidedAnnualGt = Math.max(0, bauBaselineGt(s) - (w.annualEmissionsGtCO2 ?? 0));
    w.cumulativeCO2AvoidedGt = (w.cumulativeCO2AvoidedGt ?? 0) + avoidedAnnualGt / BALANCE.ticksPerYear;
    w.co2AvoidedHistory.push(w.cumulativeCO2AvoidedGt);

    const cap = BALANCE.historyLength;
    for (const key of HISTORY_FIELDS) {
      const h = w[key];
      if (h.length > cap) h.splice(0, h.length - cap);
    }

    // 1.5°C breach milestone — fires exactly once, the first time the world
    // crosses the Paris target. Wakes up political will (the threshold was
    // always rhetorical; crossing it makes it real) and adds a small stress
    // spike. Narrative beat lands on the ticker and in the dispatch log via
    // the standard EVENT_FIRED payload.
    if (!s.meta.breached1_5 && (w.tempAnomalyC ?? 0) >= 1.5) {
      s.meta.breached1_5 = true;
      w.societalStress = (w.societalStress ?? 0) + 3;
      for (const c of Object.values(s.countries)) {
        c.politicalWill = Math.min(100, (c.politicalWill ?? 50) + 4);
      }
      this.b.emit(EVT.EVENT_FIRED, {
        event: { id: 'breach_1_5', title: '1.5°C Breached' },
        headline: 'The world crosses +1.5°C for the first time. The Paris target, as a target, is gone. Politicians stop using the past tense.',
        tone: 'bad',
      });
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
