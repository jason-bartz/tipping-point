// Population model — the pure "calculation engine" for people on the planet.
//
// This module exports zero side effects. Give it a country and a world-temp
// reading, it gives back effective birth/death rates, annualized net growth,
// and the natural/climate breakdown. A system (PopulationSystem) is the thing
// that actually writes back to state. Keeping the math pure means:
//   - we can unit-test it without booting the game
//   - the UI and the engine read the *exact same number*
//   - future sensitivity analysis (what if vulnerability were 2.0 not 3.0?)
//     is a one-line experiment
//
// ─── Scientific calibration ────────────────────────────────────────────────
// Birth and death rates are modeled separately, both calibrated to UN 2024
// crude-rate data. Each responds to different world inputs:
//
//   BIRTH RATE is reduced by:
//     - Societal stress (observed baby-bust during major crises — the Great
//       Depression, 2008, COVID-era fertility dips). Capped at −25% so even
//       peak stress can't drive a country to zero births in a single year.
//     - Climate anxiety + heat stress on fertility (published effects in
//       exposed populations above +1.5°C). Scales with climateVulnerability.
//       Capped at −30% so the worst-case compounded hit is bounded.
//     - Durable event modifiers (Gen Z fewer children, carbon-bank policy).
//       Applied as an additive delta; decayable by PopulationSystem.
//
//   DEATH RATE is increased by:
//     - Climate mortality (heat waves, crop failure, water scarcity, migration
//       collapse). Uses the AR6-calibrated power curve — zero below +1.5°C,
//       steep above +2.5°C. Adoption shields locally: up to 60% reduction on
//       deep decarbonizers.
//     - Transient event modifiers (pandemic, war, famine). Decayable.
//
// The per-country `climateVulnerability` multiplier scales both the anxiety
// drag on birth rate and the mortality drag on death rate:
//   3.0 = tropical megadeltas + Gulf heat (IND, EGY, GLF, SAU, SEA…)
//   1.0 = temperate developed (DEU, GBR, FRA…)
//   0.8 = high-latitude (NDC, CAN) — small early benefit, gentler curve.

import { BALANCE } from '../config/balance.js';

// Tunables. Declared here (not in balance.js) because they form a tightly
// coupled curve — moving one without moving the others breaks realism fast.
// Treat as a single unit when rebalancing.
export const POP = {
  // Climate mortality starts kicking in at this temperature anomaly (°C).
  mortalityTempThreshold: 1.5,

  // Power-curve exponent. 1.6 gives a gentle shoulder up to +2°C then a
  // sharp climb. Lower = flatter; higher = cliff.
  mortalityCurveExponent: 1.6,

  // Scaling so the curve lands at realistic numbers. At excess=2.5°C and
  // vulnerability=3, annual mortality rate ≈ 3.3%/yr (severe but sub-lethal
  // for the species). Match against AR6 excess-mortality charts.
  mortalityScale: 0.0025,

  // Adoption caps the local climate drag at 1 - shieldStrength * avgAdoption.
  // Max 60% — deep decarbonization buys resilience, not invulnerability.
  shieldStrength: 0.75,
  shieldMax: 0.6,

  // Birth-rate penalty from societal stress. stress/100, capped at 0.25.
  // Matches observed crisis-era fertility dips (5–25% drops in severe years).
  stressBirthCapFraction: 0.25,
  stressBirthScale: 0.01,          // stress units → fraction (100 stress = 1.0 pre-cap)

  // Birth-rate penalty from climate anxiety + heat stress. Scales with
  // (tempAnomaly − 1.5)² × vulnerability. Capped at 0.30. The quadratic
  // mirrors Gen-Z-effect polling + heat-stress fertility research.
  climateAnxietyCapFraction: 0.30,
  climateAnxietyScale: 0.05,
};

// Pure climate mortality rate (annualized fraction of population lost) given
// a temperature anomaly and a country's exposure multiplier. Returns 0 until
// the threshold; grows as a power curve beyond it.
export function climateMortalityRate(tempAnomalyC, climateVulnerability = 1) {
  const excess = Math.max(0, (tempAnomalyC ?? 0) - POP.mortalityTempThreshold);
  if (excess === 0) return 0;
  return Math.pow(excess, POP.mortalityCurveExponent)
       * POP.mortalityScale
       * (climateVulnerability ?? 1);
}

// How much of the climate drag a country shields with its own decarbonization.
// Returns a factor in [shieldMax-complement, 1]: 1.0 = no shield, 0.4 = max.
export function adoptionShield(avgAdoption) {
  const a = Math.max(0, Math.min(1, avgAdoption ?? 0));
  return 1 - Math.min(POP.shieldMax, a * POP.shieldStrength);
}

// Stress-driven birth-rate suppression. Returns a fraction in [0, cap].
// At stress=0 returns 0; at stress=25 returns 0.25 (hits the cap early so
// moderate crises already dent birthrates).
export function stressBirthPenalty(societalStress) {
  const raw = Math.max(0, (societalStress ?? 0) * POP.stressBirthScale);
  return Math.min(POP.stressBirthCapFraction, raw);
}

// Climate-anxiety birth-rate suppression. Quadratic above +1.5°C, scaled by
// country vulnerability. Returns a fraction in [0, cap].
export function climateAnxietyPenalty(tempAnomalyC, climateVulnerability = 1) {
  const excess = Math.max(0, (tempAnomalyC ?? 0) - POP.mortalityTempThreshold);
  if (excess === 0) return 0;
  const raw = excess * excess * POP.climateAnxietyScale * (climateVulnerability ?? 1);
  return Math.min(POP.climateAnxietyCapFraction, raw);
}

// Effective annualized birth rate given world temp and world stress. Applies
// the stress penalty and climate-anxiety penalty multiplicatively (they
// compound — a fertility-depressing crisis under a warming sky hits harder
// than either alone), then adds any durable event modifier (Gen Z, carbon
// bank). Floored at zero; no country can have negative births.
export function effectiveBirthRate(country, tempAnomalyC, societalStress) {
  const base = country?.birthRatePerYear ?? 0;
  const stressMult  = 1 - stressBirthPenalty(societalStress);
  const anxietyMult = 1 - climateAnxietyPenalty(tempAnomalyC, country?.climateVulnerability);
  const modifier    = country?.birthRateModifier ?? 0;
  return Math.max(0, base * stressMult * anxietyMult + modifier);
}

// Effective annualized death rate. Intrinsic death rate plus shielded climate
// mortality plus any transient event modifier (pandemic, war, famine).
export function effectiveDeathRate(country, tempAnomalyC, avgAdoption) {
  const base = country?.deathRatePerYear ?? 0;
  const climateDrag = climateMortalityRate(tempAnomalyC, country?.climateVulnerability)
                    * adoptionShield(avgAdoption);
  const modifier = country?.deathRateModifier ?? 0;
  return Math.max(0, base + climateDrag + modifier);
}

// Full annualized net growth rate. Kept as a thin wrapper so callers that
// only need the scalar get a cheap one-liner.
export function annualGrowthRate(country, tempAnomalyC, avgAdoption, societalStress = 0) {
  return effectiveBirthRate(country, tempAnomalyC, societalStress)
       - effectiveDeathRate(country, tempAnomalyC, avgAdoption);
}

// Project one quarter forward. Returns the new population (millions) and a
// full breakdown: net rate, effective birth, effective death, the intrinsic
// baseline, and the attributed climate drag for UI display. Pure: the caller
// writes it back.
export function projectQuarter(country, tempAnomalyC, avgAdoption, societalStress = 0) {
  const birth = effectiveBirthRate(country, tempAnomalyC, societalStress);
  const death = effectiveDeathRate(country, tempAnomalyC, avgAdoption);
  const rate = birth - death;
  const multiplier = 1 + rate / 4;
  const before = country?.populationM ?? 0;
  const after = Math.max(0, before * multiplier);
  const intrinsicBirth = country?.birthRatePerYear ?? 0;
  const intrinsicDeath = country?.deathRatePerYear ?? 0;
  return {
    populationM: after,
    deltaM: after - before,
    annualRatePct: rate * 100,
    birthRatePct: birth * 100,
    deathRatePct: death * 100,
    // Intrinsic (pre-modifier) baseline — gives the UI "what growth would be
    // without climate drag" as a clean comparison point.
    naturalRatePct: (intrinsicBirth - intrinsicDeath) * 100,
    climateDragPct: (rate - (intrinsicBirth - intrinsicDeath)) * 100 * -1, // positive = harm
  };
}

// Selector: total world population across all countries (millions).
// Pure on state — cheap enough to call per-frame.
export function worldPopulationM(state) {
  const cs = Object.values(state?.countries ?? {});
  let total = 0;
  for (const c of cs) total += c.populationM ?? 0;
  return total;
}

// Selector: total per-tick delta across all countries (millions / quarter).
// Summed per-tick state, not recomputed from scratch — keeps the HUD stable.
export function worldQuarterlyDeltaM(state) {
  const cs = Object.values(state?.countries ?? {});
  let total = 0;
  for (const c of cs) total += c.populationDeltaM ?? 0;
  return total;
}

// Display helper. Population in millions → nicely formatted string.
//   1_430 (million)     → "1,430,000,000"
//   275.4 (million)     → "275,400,000"
// Keeps six-ish significant figures for the ticker; the UI slots a unit.
export function formatPopulationFull(millions) {
  const people = Math.round((millions ?? 0) * 1_000_000);
  return people.toLocaleString('en-US');
}

// Compact form for tight spaces. "7.89B", "340M", "1.43K" (thousands).
export function formatPopulationCompact(millions) {
  const m = millions ?? 0;
  if (m >= 1000) return `${(m / 1000).toFixed(2)}B`;
  if (m >= 1)    return `${m.toFixed(1)}M`;
  return `${Math.round(m * 1000)}K`;
}

// Formatter for a quarterly delta (millions, can be negative). Prefixes with
// sign and scales the unit so small swings still read ("+420K" beats "+0.42M").
// Millions are rounded to whole numbers so the HUD reads "+30M/yr" rather
// than the spuriously-precise "+29.63M/yr".
export function formatDelta(deltaM) {
  const d = deltaM ?? 0;
  const sign = d >= 0 ? '+' : '−';
  const abs = Math.abs(d);
  if (abs >= 1)    return `${sign}${Math.round(abs)}M`;
  if (abs >= 0.01) return `${sign}${Math.round(abs * 1000)}K`;
  return `${sign}0`;
}

// Silence linter if BALANCE import becomes unused after a refactor.
void BALANCE;
