// Adoption model — pure math for how clean-tech spreads between countries
// and how political will moves over time.
//
// ─── Spread ────────────────────────────────────────────────────────────────
// A country's adoption in a branch leaks to its neighbors proportional to the
// adoption gap. Four multipliers gate the rate:
//   - adjacencySpreadRate    (global constant, BALANCE)
//   - profile.spreadMult     (home-country-directional: caller passes this
//                             mod ONLY when donor.isHome, so Nordic's +25%
//                             applies only to spread FROM the Nordic bloc)
//   - resistance(recipient)  (petrostates resist energy/policy, agricultural
//                             economies welcome land reform)
//   - will / 100             (political appetite — a 30-will country absorbs
//                             slower than an 80-will country)
// Output is the per-tick fraction of the gap that moves.
//
// ─── Political will drift ──────────────────────────────────────────────────
// Every tick, each country's will drifts toward 50 at a base rate. The rate
// accelerates past +1.4°C: climate anxiety polarizes the public, which
// paradoxically reduces governmental appetite for action (stall-out mode).
// Above +2.5°C the decay doubles.
//
// Societal stress (event-driven) pulls will down linearly when it's high.
//
// All functions pure; callers write to state.

import { BALANCE } from '../config/balance.js';

// Resistance multiplier for a country receiving a spread of branch `b`.
// > 1 welcomes, < 1 resists, 1 is neutral.
export function resistanceFor(country, branch) {
  if (!country) return 1;
  if (country.infra === 'petrostate'  && (branch === 'energy' || branch === 'policy')) return 0.3;
  if (country.infra === 'industrial'  && branch === 'industry') return 0.5;
  if (country.infra === 'agricultural' && branch === 'land')    return 1.5;
  return 1;
}

// Fraction of the donor→recipient adoption gap that transfers this tick.
// Callers apply: recipient.adoption[branch] += gap × rate, clamped to [0,1].
export function spreadFraction(recipient, branch, mod) {
  const rate    = BALANCE.adjacencySpreadRate * (mod?.spreadMult ?? 1);
  const resist  = resistanceFor(recipient, branch);
  const will    = (recipient?.politicalWill ?? 0) / 100;
  return rate * resist * will;
}

// Climate-anxiety stress boost to the will-decay rate. 1.0 at or below
// +1.4°C; grows linearly after. Past +2.5°C the multiplier is ~1.66.
export function willDecayStressBoost(tempAnomalyC) {
  return 1 + Math.max(0, (tempAnomalyC ?? 0) - 1.4) * 0.6;
}

// Project this tick's political-will change for a country, before clamping.
// Caller clamps to [8, 100] and writes back.
//
// Two forces:
//   1. Drift toward 50 at `politicalWillDecay × stressBoost`
//   2. Societal-stress penalty: if world stress > 20, bleed a small amount
//      per-tick proportional to excess
export function willDeltaFor(country, world) {
  const decay = BALANCE.politicalWillDecay * willDecayStressBoost(world?.tempAnomalyC ?? 0);
  let delta = (50 - (country?.politicalWill ?? 50)) * decay;

  const stress = world?.societalStress ?? 0;
  if (stress > 20) {
    delta -= 0.04 * ((stress - 20) / 80);
  }
  return delta;
}

// Clamp helper so systems don't reimplement the bounds.
export function clampWill(w) {
  return Math.max(8, Math.min(100, w));
}

// Net-zero threshold check for a single country. Uses BALANCE value so a
// rebalance updates win conditions everywhere.
export function meetsNetZero(country) {
  if (!country?.adoption) return false;
  const keys = ['energy', 'transport', 'industry', 'land', 'capture', 'policy'];
  let s = 0;
  for (const k of keys) s += country.adoption[k] ?? 0;
  return (s / keys.length) >= BALANCE.netZeroThresholdAdoption;
}
