// Research queue. Each branch has one concurrent slot, so up to 6 projects
// run in parallel — one Energy, one Transport, one Industry, … Each tick,
// every active slot ticks down; on completion the activity is added to the
// researched set. Player also earns base CP per tick (plus a Net-Zero bonus).

import { EVT } from '../core/EventBus.js';
import { researchCost, incomePerTick } from '../model/Economy.js';

export class ResearchSystem {
  constructor(state, bus, mod) {
    this.state = state;
    this.bus = bus;
    this.mod = mod;
    bus.on(EVT.TICK, () => this.step());
  }

  step() {
    const s = this.state;
    const w = s.world;

    // Income (base rate × country modifier + net-zero dividend).
    w.climatePoints += incomePerTick(s);

    // Tick down the diamond-collectable research discount.
    if (w.researchDiscountTicksRemaining > 0) {
      w.researchDiscountTicksRemaining -= 1;
      if (w.researchDiscountTicksRemaining === 0) w.researchDiscountPct = 0;
    }

    // Advance in-flight research.
    const slots = w.activeResearch;
    for (const branchId of Object.keys(slots)) {
      const r = slots[branchId];
      if (!r) continue;
      r.ticksRemaining -= 1;
      if (r.ticksRemaining <= 0) {
        const a = s.activities[r.id];
        delete slots[branchId];
        if (a) {
          w.researched.add(r.id);
          this.bus.emit(EVT.RESEARCH_DONE, { activity: a });
        }
      }
    }
  }

  // Start a research project. Returns { ok, reason } so the UI can explain.
  research(id) {
    const s = this.state;
    const a = s.activities[id];
    if (!a)                                           return this._fail({ reason: 'unknown' });
    if (s.world.researched.has(id))                   return this._fail({ activity: a, reason: 'already' });
    if (s.world.activeResearch[a.branch])             return this._fail({ activity: a, reason: 'branch_busy' });
    if (!a.prereqs.every(p => s.world.researched.has(p))) return this._fail({ activity: a, reason: 'prereqs' });

    const cost = researchCost(s, a, this.mod);
    if (s.world.climatePoints < cost)                 return this._fail({ activity: a, reason: 'insufficient_cp', cost });

    s.world.climatePoints -= cost;
    const baseTicks = a.researchTicks ?? 4;
    const ticks = Math.max(1, Math.round(baseTicks * (this.mod?.researchMult ?? 1)));
    s.world.activeResearch[a.branch] = { id: a.id, ticksRemaining: ticks, totalTicks: ticks };
    this.bus.emit(EVT.RESEARCH_STARTED, { activity: a, ticks });
    return { ok: true, cost, ticks };
  }

  _fail(detail) {
    this.bus.emit(EVT.RESEARCH_FAILED, detail);
    return { ok: false, ...detail };
  }
}
