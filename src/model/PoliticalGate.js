// PoliticalGate — a pure check for whether a deploy is politically possible
// right now, and how much political will it costs.
//
// Design shape: a deploy has two optional knobs in its data (`willRequirement`
// for the gate and `willCost` for the drain). Most tech-incentive activities
// have neither — they pass with a signature and don't move the needle. The
// hard deploys (carbon tax, ICE phase-out, subsidy cut, loss & damage fund)
// do. Country `infra` adds a per-profile penalty on top, and a handful of
// branch-specific penalties express that, e.g., a petrostate resists *energy*
// policy even more than a generic "hard" rule would predict.
//
// Never mutates state. AdoptionSystem reads the verdict and decides.

import { BALANCE } from '../config/balance.js';
import { combineEffects, activeSynergiesFor } from '../data/synergies.js';

// What threshold does `country` actually need to clear for this deploy?
export function effectiveThreshold(country, activity) {
  const base = activity.willRequirement ?? 0;
  if (base === 0) return 0; // ungated (incentive, R&D) — no gate at all
  const infraMod  = BALANCE.willInfraModifier?.[country.infra] ?? 0;
  const branchMod = BALANCE.willBranchPenalty?.[country.infra]?.[activity.branch] ?? 0;
  return base + infraMod + branchMod;
}

// How much will does a successful deploy drain?
// Synergies (e.g. Climate Finance Pact) can reduce this.
export function effectiveWillCost(state, country, activity) {
  const base = activity.willCost ?? 0;
  if (base === 0) return 0;
  const { willCostMult } = combineEffects(activeSynergiesFor(state, activity));
  return Math.max(0, Math.round(base * willCostMult));
}

// Full gate check. Shape chosen so the UI can render a *why* even when it
// passes — e.g. "Needs Will 70, you have 62 — build political capital first."
//
// Returns:
//   {
//     allowed: bool,         // true → deploy may proceed
//     gated: bool,           // true if there is a gate at all (independent of allowed)
//     threshold: number,     // effective required will (post-modifiers)
//     have: number,          // country's current will
//     willCost: number,      // how much will deploy drains on success
//     shortfall: number,     // threshold - have, or 0
//   }
export function gate(state, country, activity) {
  const threshold = effectiveThreshold(country, activity);
  const have = country?.politicalWill ?? 0;
  const willCost = effectiveWillCost(state, country, activity);
  const gated = threshold > 0;
  const allowed = !gated || have >= threshold;
  return {
    allowed,
    gated,
    threshold,
    have,
    willCost,
    shortfall: Math.max(0, threshold - have),
  };
}
