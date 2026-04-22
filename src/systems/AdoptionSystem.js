// Activity diffusion (country-to-country) + political will drift.
//
// All math lives in pure model modules:
//   model/Adoption.js      — spread fraction, resistance, will drift, net-zero
//   model/DeployEconomy.js — diminishing returns + synergies for player deploys
//   model/PoliticalGate.js — will gates on "hard" player deploys
// This class orchestrates — reads model numbers, writes state, emits events.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { BRANCHES } from '../data/activities.js';
import {
  spreadFraction,
  willDeltaFor,
  clampWill,
  meetsNetZero,
} from '../model/Adoption.js';
import { projectDeploy, recordDeploy, pairCapReached } from '../model/DeployEconomy.js';
import { gate as politicalGate } from '../model/PoliticalGate.js';
import { incumbentMultipliers } from '../model/Government.js';
import { previewAdvisorDeployCost, commitAdvisorDeployCost } from './AdvisorSystem.js';

export class AdoptionSystem {
  constructor(state, bus, mod) {
    this.state = state;
    this.bus = bus;
    this.mod = mod;
    this._unsub = bus.on(EVT.TICK, () => this.step());
  }

  destroy() { this._unsub?.(); this._unsub = null; }

  step() {
    const countries = Object.values(this.state.countries);

    // Cross-border diffusion — one pass per branch over the adjacency graph.
    // The home country's spreadMult is directional: it applies only when the
    // donor is home, so "tech you deploy at home spreads 25% faster to
    // neighbors" is literally what happens. Non-home spreads run at base rate.
    for (const branch of Object.keys(BRANCHES)) {
      for (const donor of countries) {
        if ((donor.adoption[branch] ?? 0) <= 0) continue;
        const donorMod = donor.isHome ? this.mod : null;
        // Incumbent tag multiplier — green governments export their policies
        // faster, deniers drag their feet. Sits on top of the home-country
        // spreadMult, so a green home multiplies both.
        const incMult = incumbentMultipliers(donor).spreadMult ?? 1;
        for (const nId of donor.neighbors ?? []) {
          const recipient = this.state.countries[nId];
          if (!recipient) continue;
          const gap = donor.adoption[branch] - (recipient.adoption[branch] ?? 0);
          if (gap <= 0) continue;
          const fraction = spreadFraction(recipient, branch, donorMod) * incMult;
          recipient.adoption[branch] = Math.min(1, (recipient.adoption[branch] ?? 0) + gap * fraction);
        }
      }
    }

    // Will drift + net-zero detection + stress decay. Incumbent tag adds a
    // small standing bonus/malus — a green government props will up a couple
    // of points above the drift floor; a denier actively erodes it.
    const w = this.state.world;
    for (const c of countries) {
      const willBonus = incumbentMultipliers(c).willBonus ?? 0;
      // Applied as a gentle per-tick nudge (÷ 10) so the standing effect
      // compounds over many ticks instead of slamming in at once.
      c.politicalWill = clampWill((c.politicalWill ?? 50) + willDeltaFor(c, w) + willBonus * 0.1);
      if (!c.netZero && meetsNetZero(c)) {
        c.netZero = true;
        w.climatePoints += BALANCE.milestoneBonusCP;
        this.bus.emit(EVT.NET_ZERO, { country: c });
      }
    }

    if (w.societalStress > 0) w.societalStress = Math.max(0, w.societalStress - 0.2);
  }

  // Player deployment. Three-stage pipeline:
  //   1. Basic validation (country/activity exist, activity researched)
  //   2. Political-will gate (hard policies need a coalition)
  //   3. Economy projection → charge cost, apply (diminished + synergized)
  //      yield, drain will, record the deploy for future diminishing returns.
  // Every failure path emits DEPLOY_FAILED so the UI can explain *why*.
  deploy(countryId, activity) {
    const s = this.state;
    const c = s.countries[countryId];
    if (!c)                                   return this._fail({ reason: 'no_country' });
    if (!activity)                            return this._fail({ reason: 'no_activity' });
    if (!s.world.researched.has(activity.id)) return this._fail({ country: c, activity, reason: 'not_researched' });

    // Per-pair hard cap. Blocks infinite spam once a country has absorbed
    // the max number of this activity — the cost escalation still biases
    // against repeat deploys on the way up to the cap.
    if (pairCapReached(s, c.id, activity.id)) {
      return this._fail({ country: c, activity, reason: 'pair_cap', cap: BALANCE.deployMaxPerPair });
    }

    const verdict = politicalGate(s, c, activity);
    if (!verdict.allowed) {
      return this._fail({
        country: c, activity,
        reason: 'will_gate',
        threshold: verdict.threshold,
        have: verdict.have,
      });
    }

    const projection = projectDeploy(s, c, activity);
    const preview = previewAdvisorDeployCost(s, projection.effectiveCost);
    const cost = preview.cost;
    if (s.world.climatePoints < cost) {
      return this._fail({ country: c, activity, reason: 'insufficient_cp', cost });
    }

    s.world.climatePoints -= cost;
    commitAdvisorDeployCost(s, preview.tag);
    c.adoption[activity.branch] = Math.min(1, c.adoption[activity.branch] + projection.effectiveYield);
    const willGain = 4;
    const willLoss = verdict.willCost;
    c.politicalWill = clampWill((c.politicalWill ?? 50) + willGain - willLoss);
    recordDeploy(s, c.id, activity.id);

    this.bus.emit(EVT.DEPLOYED, {
      country: c, activity,
      cost,
      appliedYield: projection.effectiveYield,
      diminishingMult: projection.diminishingMult,
      synergies: projection.synergies,
      willDelta: willGain - willLoss,
    });
    return { ok: true, cost };
  }

  _fail(detail) {
    this.bus.emit(EVT.DEPLOY_FAILED, detail);
    return { ok: false, ...detail };
  }
}
