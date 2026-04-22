// Climate model — pure carbon-cycle + temperature math.
//
// This is a simplified but physically motivated model:
//   1. Emissions ⟶ atmospheric CO₂ via the airborne fraction (~42% of CO₂ we
//      emit stays in the atmosphere over centennial timescales; the rest is
//      absorbed by oceans and biosphere).
//   2. Oceans also continuously take up a fraction of excess CO₂ above
//      pre-industrial (the "ocean sink" — slow, steady, eventually saturates
//      in real life but we keep it linear for tractability).
//   3. Nature-based removal (land + capture adoption) pulls CO₂ back
//      out — modeled per-country so decarbonizing the Amazon matters.
//   4. Equilibrium temperature follows the log-CO₂ relationship:
//      ΔT_eq = S × log₂(CO₂ / CO₂_preindustrial),
//      where S is the climate sensitivity (~3°C per doubling — IPCC "likely"
//      central estimate).
//   5. Actual temperature tracks equilibrium with a first-order lag — the
//      ocean heat sink delays realized warming. We run a faster lag than
//      reality so in-game feedback is visible to the player.
//
// Sources:
//   - Airborne fraction: Canadell et al. 2007; Le Quéré et al. Global Carbon
//     Budget annual updates.
//   - Climate sensitivity S = 3°C: IPCC AR6 "likely" range 2.5–4.0°C.
//   - Log-CO₂ forcing: Myhre et al. 1998, ΔF = 5.35 × ln(C/C₀).
//
// All functions are pure — they read country/world state and return numbers.
// CarbonSystem applies those numbers to state.

import { BALANCE } from '../config/balance.js';

// Sum of country baseEmissions × (1 - avgAdoption × reduction factor). Used
// to compute global annual emissions (GtCO₂/yr) from the current country mix.
//
// `avgAdoption` already exists as select.avgAdoption; we re-implement inline
// to avoid coupling to the selectors module from the pure model layer.
export function computeGlobalEmissionsGt(state) {
  let total = 0;
  for (const c of Object.values(state?.countries ?? {})) {
    const avg = avgAdoption(c);
    const reduction = avg * BALANCE.baseEmissionReductionPerAdoption;
    total += Math.max(0, c.baseEmissionsGtCO2 * (1 - reduction));
  }
  return total;
}

// Business-as-usual drift — low-adoption, non-net-zero countries grow their
// baseline emissions. High-adoption countries damp the growth toward zero.
// Mutates `country.baseEmissionsGtCO2` in place; returns nothing.
// (This is the one "impure" helper in the module — every other function is
// pure. BAU drift is paired to the emissions read and it's awkward to keep
// them apart.)
export function applyBAUDrift(country) {
  if (country.netZero) return;
  const bauPerTick = BALANCE.bauEmissionGrowthPerYear / BALANCE.ticksPerYear;
  const avg = avgAdoption(country);
  const dampen = Math.min(1, avg * 1.2); // avg ≥ 0.83 fully dampens growth
  country.baseEmissionsGtCO2 *= 1 + bauPerTick * (1 - dampen);
}

// Atmospheric CO₂ gain this quarter from the airborne fraction of fresh
// emissions. Inputs are annualized GtCO₂; we convert to quarterly ppm.
export function quarterlyPpmGainFromEmissions(annualGtCO2) {
  const quarterly = (annualGtCO2 ?? 0) / BALANCE.ticksPerYear;
  return quarterly * BALANCE.ppmPerGtCO2 * BALANCE.airborneFraction;
}

// Ocean sink — continuously absorbs a slice of the excess above
// preindustrial. Linear in the excess; tiny coefficient per quarter.
export function quarterlyOceanSinkPpm(currentCO2ppm) {
  const excess = Math.max(0, (currentCO2ppm ?? 0) - BALANCE.preindustrialCO2ppm);
  return excess * BALANCE.oceanUptakeRate * 0.01;
}

// Nature-based removal: land-use restoration + direct capture adoption,
// weighted by the country's own emissions share (a big country's forests
// matter more than a small one's). Brazil-style natureBonus amplifies.
export function quarterlyNatureRemovalPpm(state) {
  let total = 0;
  for (const c of Object.values(state?.countries ?? {})) {
    for (const b of ['land', 'capture']) {
      const a = c.adoption?.[b] ?? 0;
      if (a <= 0) continue;
      const weight = (c.baseEmissionsGtCO2 / BALANCE.globalBaselineEmissionsGt) * a;
      total += weight * BALANCE.natureRemovalScale;
    }
  }
  if (state?.meta?.mod?.natureBonus) total *= state.meta.mod.natureBonus;
  return total;
}

// Project next-tick atmospheric CO₂ (ppm). Floors at preindustrial — even a
// magical negative-emission superpower can't push the atmosphere back below
// 280 ppm in this model.
export function nextCO2ppm(currentCO2ppm, emissionsAnnualGt, state) {
  const gain   = quarterlyPpmGainFromEmissions(emissionsAnnualGt);
  const sink   = quarterlyOceanSinkPpm(currentCO2ppm);
  const nature = quarterlyNatureRemovalPpm(state);
  return Math.max(BALANCE.preindustrialCO2ppm, (currentCO2ppm ?? 0) + gain - sink - nature);
}

// Equilibrium temperature for a given CO₂ concentration (°C anomaly above
// pre-industrial). Uses IPCC log-CO₂ relationship with climate sensitivity S.
export function equilibriumTempC(co2ppm) {
  const c = Math.max(BALANCE.preindustrialCO2ppm, co2ppm ?? BALANCE.preindustrialCO2ppm);
  return BALANCE.tempPerDoublingCO2 * Math.log2(c / BALANCE.preindustrialCO2ppm);
}

// First-order lag: temperature relaxes toward equilibrium each tick.
export function nextTempC(currentTempC, co2ppm) {
  const eq = equilibriumTempC(co2ppm);
  return (currentTempC ?? 0) + (eq - (currentTempC ?? 0)) * BALANCE.tempResponseLag;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function avgAdoption(country) {
  const a = country?.adoption ?? {};
  let s = 0, n = 0;
  for (const k of ['energy', 'transport', 'industry', 'land', 'capture', 'policy']) {
    s += a[k] ?? 0; n += 1;
  }
  return n ? s / n : 0;
}
