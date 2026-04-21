// Population model — the pure "calculation engine" for people on the planet.
//
// This module exports zero side effects. Give it a country and a world-temp
// reading, it gives back annualized growth, quarterly multiplier, and the
// natural/climate breakdown. A system (PopulationSystem) is the thing that
// actually writes back to state. Keeping the math pure means:
//   - we can unit-test it without booting the game
//   - the UI and the engine read the *exact same number*
//   - future sensitivity analysis (what if vulnerability were 2.0 not 3.0?)
//     is a one-line experiment
//
// ─── Scientific calibration ────────────────────────────────────────────────
// The climate-mortality curve mirrors the rough shape IPCC AR6 projects for
// excess mortality under high-emission pathways in exposed regions:
//   - Below +1.5°C: effectively zero net effect (current baseline anomaly).
//   - +1.5 → +2.5°C: linear-ish rise in heat + crop stress; measurable.
//   - +2.5 → +3.5°C: steep nonlinear rise as agricultural zones fail,
//     migration surges, water scarcity bites. Tropical/arid populations feel
//     this first.
//   - Beyond +3.5°C: runaway territory — the game-over threshold at +4.0°C
//     is not arbitrary, it's the Lenton/Steffen "Hothouse Earth" commit.
//
// The per-country `climateVulnerability` multiplier scales this curve.
// 3.0 = tropical megadeltas + Gulf heat (IND, EGY, GLF, SAU, SEA…)
// 1.0 = temperate developed (DEU, GBR, FRA…)
// 0.8 = high-latitude (NDC, CAN) — a small early benefit from warming is
//       overwhelmed later, but the curve stays gentler than equatorial.
//
// Adoption is a *local* shield: a country that has decarbonized its own
// sectors experiences less climate stress (cooler cities, water security,
// resilient agriculture). It doesn't undo global warming but it caps how
// much damage any given anomaly does. Capped at 60% so you can never
// completely firewall yourself from a failing planet.

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
};

// Per-tick natural birth/death drift. Deterministic, small, gives the ticker
// something to do even when climate is idle.
export function naturalQuarterlyMultiplier(baseGrowthPerYear) {
  return 1 + (baseGrowthPerYear ?? 0) / 4;
}

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

// Full annualized growth rate for a country given the current world temp and
// the country's own adoption profile. Base growth minus shielded climate drag.
// Output is a decimal: 0.008 = +0.8%/yr, -0.015 = -1.5%/yr.
export function annualGrowthRate(country, tempAnomalyC, avgAdoption) {
  const base = country?.baseGrowthPerYear ?? 0;
  const drag = climateMortalityRate(tempAnomalyC, country?.climateVulnerability)
             * adoptionShield(avgAdoption);
  return base - drag;
}

// Project one quarter forward. Returns the new population (millions) and the
// delta we just added/subtracted (millions). Pure: the caller writes it back.
export function projectQuarter(country, tempAnomalyC, avgAdoption) {
  const rate = annualGrowthRate(country, tempAnomalyC, avgAdoption);
  const multiplier = 1 + rate / 4;
  const before = country?.populationM ?? 0;
  const after = Math.max(0, before * multiplier);
  return {
    populationM: after,
    deltaM: after - before,
    annualRatePct: rate * 100,
    naturalRatePct: (country?.baseGrowthPerYear ?? 0) * 100,
    climateDragPct: (rate - (country?.baseGrowthPerYear ?? 0)) * 100 * -1, // positive = harm
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
export function formatDelta(deltaM) {
  const d = deltaM ?? 0;
  const sign = d >= 0 ? '+' : '−';
  const abs = Math.abs(d);
  if (abs >= 1)    return `${sign}${abs.toFixed(2)}M`;
  if (abs >= 0.01) return `${sign}${Math.round(abs * 1000)}K`;
  return `${sign}0`;
}

// Silence linter if BALANCE import becomes unused after a refactor.
void BALANCE;
