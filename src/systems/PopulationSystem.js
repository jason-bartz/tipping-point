// PopulationSystem — the one writer for `country.populationM` and
// `country.populationDeltaM`. Reads the pure model (src/model/Population.js),
// pushes results onto state, emits POPULATION_CHANGED so the UI ticker can
// reset its interpolation.
//
// Per-tick cost: O(countries) = 31 iterations. Each iteration is a few
// multiplications. Calling this 4x/second at 4x speed is trivial.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { projectQuarter, worldPopulationM, worldQuarterlyDeltaM } from '../model/Population.js';
import { select } from '../core/GameState.js';

export class PopulationSystem {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this._unsub = bus.on(EVT.TICK, () => this.step());
    // On construction, compute + emit an initial snapshot so the UI ticker
    // doesn't have to wait one tick before showing real data.
    this._emitSnapshot();
  }

  destroy() {
    this._unsub?.();
    this._unsub = null;
  }

  step() {
    const s = this.state;
    const temp = s.world.tempAnomalyC;

    for (const c of Object.values(s.countries)) {
      const avgAdoption = select.avgAdoption(c);
      const { populationM, deltaM } = projectQuarter(c, temp, avgAdoption);
      c.populationM = populationM;
      c.populationDeltaM = deltaM;
    }

    // Append to the rolling history window so StatsModal can sparkline it.
    // ScoringSystem trims its own windows; we trim ours here to keep writers
    // self-contained.
    const totalM = worldPopulationM(s);
    s.world.populationHistory ||= [];
    s.world.populationHistory.push(totalM);
    const cap = BALANCE.historyLength;
    if (s.world.populationHistory.length > cap) {
      s.world.populationHistory.splice(0, s.world.populationHistory.length - cap);
    }

    this._emitSnapshot();
  }

  _emitSnapshot() {
    this.bus.emit(EVT.POPULATION_CHANGED, {
      totalM: worldPopulationM(this.state),
      deltaM: worldQuarterlyDeltaM(this.state),
    });
  }
}
