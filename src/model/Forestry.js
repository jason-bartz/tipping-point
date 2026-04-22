// Forestry model — pure math for forest health and the carbon-liability
// counter that sits against the current incumbent government. All functions
// take state fragments and return numbers; ForestrySystem applies them.
//
// ─── Forest health dynamics ───────────────────────────────────────────────
// Per tick, forestHealth = clamp01(
//   current
//   + adoption.land × restorationPerTick               (regeneration)
//   - max(0, temp - threshold) × tempStressPerTick × (1 - adoption.land)
// )
// High adoption both regenerates AND blunts decay — so a country that treats
// forestry seriously keeps its biomass through warming pulses a country that
// ignores it cannot.
//
// ─── Carbon liability ─────────────────────────────────────────────────────
// The incumbent accrues liability from two sources:
//   (a) passive erosion — per tick, if forestHealth < baseline × trigger,
//       add liability proportional to the gap.
//   (b) wildfire events — one-shot hits from wildfire/wildfire_local/
//       wildfire_smog, scheduled from ForestrySystem as the events fire.
// The denier tag multiplies accrual (BALANCE.government.tagMultipliers);
// a green incumbent bleeds slower.

import { BALANCE } from '../config/balance.js';
import { incumbentMultipliers } from './Government.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Quarterly forest-health delta for one country. Does not mutate — returns
// the number to add. Caller clamps to [0, 1].
export function forestHealthDelta(country, world) {
  const land = country?.adoption?.land ?? 0;
  const regen = land * BALANCE.forestry.restorationPerTick;

  const temp = world?.tempAnomalyC ?? 0;
  const over = Math.max(0, temp - BALANCE.forestry.tempStressThresholdC);
  const decay = over * BALANCE.forestry.tempStressPerTick * (1 - land);

  return regen - decay;
}

// Passive per-tick liability drip from forestHealth below baseline. Zero if
// the forest is healthy enough. Multiplied by the incumbent's liabilityRate
// so denier governments bleed faster.
export function passiveLiabilityDelta(country) {
  const health   = country?.forestHealth ?? 0;
  const baseline = country?.forestBaseline ?? 0;
  const trigger  = baseline * BALANCE.forestry.passiveLiabilityTriggerFraction;
  if (health >= trigger || baseline <= 0) return 0;

  const gap = trigger - health;
  const raw = gap * BALANCE.forestry.passiveLiabilityPerTick;
  const mult = incumbentMultipliers(country).liabilityRate ?? 1;
  return raw * mult;
}

// One-shot liability charge for a wildfire-class event. The event id is
// looked up in BALANCE.forestry.wildfireLiability; unknown ids return 0 so
// adding new fire-adjacent events doesn't accidentally charge liability.
// The incumbent's liabilityRate multiplier applies here too.
export function wildfireLiability(country, eventId) {
  const base = BALANCE.forestry.wildfireLiability[eventId] ?? 0;
  if (base === 0) return 0;
  const mult = incumbentMultipliers(country).liabilityRate ?? 1;
  return base * mult;
}

// Advance one country's forestHealth + liability by one tick. Mutates in
// place. Returns `true` if the liability cap was crossed this tick (caller
// should trigger succession), `false` otherwise.
export function step(country, world) {
  if (!country || !country.government) return false;

  // 1. Forest health.
  country.forestHealth = clamp01(
    (country.forestHealth ?? 0) + forestHealthDelta(country, world)
  );

  // 2. Passive liability drip.
  country.government.carbonLiability = Math.max(
    0,
    (country.government.carbonLiability ?? 0) + passiveLiabilityDelta(country)
  );

  // 3. Threshold check.
  return country.government.carbonLiability >= BALANCE.government.liabilityCap;
}

// Apply a one-shot wildfire liability hit. Used by ForestrySystem when it
// sees EVT.EVENT_FIRED for a wildfire-tagged event. Returns the same
// cap-crossed boolean as step().
export function chargeWildfire(country, eventId) {
  if (!country?.government) return false;
  const hit = wildfireLiability(country, eventId);
  if (!hit) return false;
  country.government.carbonLiability = (country.government.carbonLiability ?? 0) + hit;
  return country.government.carbonLiability >= BALANCE.government.liabilityCap;
}
