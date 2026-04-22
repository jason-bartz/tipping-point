// DeployEconomy — pure calculators that turn (state, country, activity) into
// the numbers the game actually charges and applies. Spread across three
// concerns:
//
//   1. Diminishing returns per (country, activity) pair. The Nth deploy of
//      EV Subsidies in the USA yields `base^N` of its listed adoption gain.
//   2. Research synergies. Cross-branch combos boost yield and/or cut cost.
//   3. Base cost (home discount + difficulty mod) — delegates to helpers.js
//      so there's one source of truth for "what does a deploy cost".
//
// This module never mutates state. Callers (AdoptionSystem, UI) read the
// projection, decide, and apply changes themselves. That keeps the math
// trivially unit-testable and lets the UI show the *same* breakdown the
// engine will charge.

import { BALANCE } from '../config/balance.js';
import { deployCost } from './Economy.js';
import { activeSynergiesFor, combineEffects } from '../data/synergies.js';

// Number of times (countryId, activityId) has been deployed this run.
export function deployCountFor(state, countryId, activityId) {
  return state?.world?.deployCount?.[countryId]?.[activityId] ?? 0;
}

// The multiplier applied to `activity.deployAdoption` from diminishing returns.
// First deploy returns 1.0. Each subsequent one is `base^n`, floored at a
// configurable minimum so late spam is *weak* but not useless.
export function diminishingMultiplier(count) {
  const base = BALANCE.deployDiminishingBase ?? 0.65;
  const floor = BALANCE.deployDiminishingFloor ?? 0.10;
  return Math.max(floor, Math.pow(base, count));
}

// Escalation multiplier applied to the base cost for the Nth deploy.
// 1.0 for the first deploy, `deployCostEscalation^n` after that.
export function escalationMultiplier(count) {
  const e = BALANCE.deployCostEscalation ?? 1;
  if (e <= 1) return 1;
  return Math.pow(e, count);
}

// Whether another deploy of this (country, activity) pair is allowed under
// the per-pair cap. Tier above which spam becomes impossible as a hard rule.
export function pairCapReached(state, countryId, activityId) {
  const cap = BALANCE.deployMaxPerPair ?? Infinity;
  return deployCountFor(state, countryId, activityId) >= cap;
}

// Full projection of a deploy: every number the UI or engine could want,
// with a `breakdown` trail for the tooltip. No side effects.
//
// Returns:
//   {
//     baseYield, effectiveYield,         // adoption gain numbers
//     baseCost, effectiveCost,            // credit cost numbers
//     diminishingMult, synergyYieldMult,  // individual multipliers
//     escalationMult,                     // cost mult from repeat deploys
//     synergies,                          // list of active synergy defs
//     prevDeploys, capReached,            // pair-cap bookkeeping
//     costBreakdown, yieldBreakdown,      // human-readable reason lines
//   }
export function projectDeploy(state, country, activity) {
  const mod = state?.meta?.mod;
  const prevDeploys = deployCountFor(state, country.id, activity.id);
  const diminishingMult = diminishingMultiplier(prevDeploys);
  const escalationMult  = escalationMultiplier(prevDeploys);
  const synergies = activeSynergiesFor(state, activity);
  const combined = combineEffects(synergies);

  const baseYield = activity.deployAdoption;
  const effectiveYield = Math.min(1, baseYield * diminishingMult * combined.yieldMult);

  const baseCost = deployCost(state, country, activity, mod);
  const effectiveCost = Math.max(1, Math.round(baseCost * combined.costMult * escalationMult));

  const yieldBreakdown = [];
  if (prevDeploys > 0) {
    yieldBreakdown.push({
      id: 'diminishing',
      label: `Repeated deploy × ${prevDeploys}`,
      mult: diminishingMult,
    });
  }
  for (const s of synergies) {
    if (s.effect?.yieldMult != null && s.effect.yieldMult !== 1) {
      yieldBreakdown.push({
        id: s.id,
        label: s.label,
        mult: s.effect.yieldMult,
      });
    }
  }

  const costBreakdown = [];
  if (prevDeploys > 0 && escalationMult !== 1) {
    costBreakdown.push({
      id: 'escalation',
      label: `Repeat deploy × ${prevDeploys}`,
      mult: escalationMult,
    });
  }
  for (const s of synergies) {
    if (s.effect?.costMult != null && s.effect.costMult !== 1) {
      costBreakdown.push({
        id: s.id,
        label: s.label,
        mult: s.effect.costMult,
      });
    }
  }

  return {
    baseYield,
    effectiveYield,
    baseCost,
    effectiveCost,
    diminishingMult,
    escalationMult,
    synergyYieldMult: combined.yieldMult,
    synergyCostMult:  combined.costMult,
    synergyWillMult:  combined.willCostMult,
    synergies,
    prevDeploys,
    capReached: pairCapReached(state, country.id, activity.id),
    maxPerPair: BALANCE.deployMaxPerPair ?? Infinity,
    yieldBreakdown,
    costBreakdown,
  };
}

// Record that a deploy happened. Pure write on state.world.deployCount; no
// emit, no will math — AdoptionSystem owns the full transaction.
export function recordDeploy(state, countryId, activityId) {
  state.world.deployCount ||= {};
  state.world.deployCount[countryId] ||= {};
  const cur = state.world.deployCount[countryId][activityId] ?? 0;
  state.world.deployCount[countryId][activityId] = cur + 1;
}
