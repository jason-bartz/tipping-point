// Unit tests for the climate model. Locks in the physically motivated shape
// of the carbon cycle + temperature response so balance edits can't silently
// break scientific plausibility.

import { describe, it, expect } from 'vitest';
import {
  computeGlobalEmissionsGt,
  applyBAUDrift,
  quarterlyPpmGainFromEmissions,
  quarterlyOceanSinkPpm,
  quarterlyNatureRemovalPpm,
  nextCO2ppm,
  equilibriumTempC,
  nextTempC,
} from '../Climate.js';
import { BALANCE } from '../../config/balance.js';

const ZERO_ADOPT = { energy: 0, transport: 0, industry: 0, land: 0, capture: 0, policy: 0 };

function fakeCountry(overrides = {}) {
  return {
    id: 'TST',
    baseEmissionsGtCO2: 10,
    adoption: { ...ZERO_ADOPT },
    netZero: false,
    ...overrides,
  };
}
function fakeState({ countries = {}, meta = {} } = {}) {
  return { countries, meta };
}

describe('computeGlobalEmissionsGt', () => {
  it('sums baseline emissions when adoption is zero', () => {
    const state = fakeState({ countries: { A: fakeCountry({ baseEmissionsGtCO2: 10 }), B: fakeCountry({ baseEmissionsGtCO2: 5 }) } });
    expect(computeGlobalEmissionsGt(state)).toBeCloseTo(15, 5);
  });

  it('reduces emissions proportionally to average adoption', () => {
    const c = fakeCountry({ baseEmissionsGtCO2: 10, adoption: { ...ZERO_ADOPT, energy: 0.6, transport: 0.6, industry: 0.6, land: 0.6, capture: 0.6, policy: 0.6 } });
    const state = fakeState({ countries: { A: c } });
    const expected = 10 * (1 - 0.6 * BALANCE.baseEmissionReductionPerAdoption);
    expect(computeGlobalEmissionsGt(state)).toBeCloseTo(expected, 5);
  });
});

describe('applyBAUDrift', () => {
  it('grows emissions when adoption is zero and country is not net zero', () => {
    const c = fakeCountry({ baseEmissionsGtCO2: 10 });
    applyBAUDrift(c);
    expect(c.baseEmissionsGtCO2).toBeGreaterThan(10);
  });

  it('does nothing when the country is already net zero', () => {
    const c = fakeCountry({ baseEmissionsGtCO2: 10, netZero: true });
    applyBAUDrift(c);
    expect(c.baseEmissionsGtCO2).toBe(10);
  });

  it('fully damps BAU growth when adoption is high', () => {
    const c = fakeCountry({
      baseEmissionsGtCO2: 10,
      adoption: { ...ZERO_ADOPT, energy: 1, transport: 1, industry: 1, land: 1, capture: 1, policy: 1 },
    });
    const before = c.baseEmissionsGtCO2;
    applyBAUDrift(c);
    expect(c.baseEmissionsGtCO2).toBeCloseTo(before, 6);
  });
});

describe('CO₂ transport', () => {
  it('airborne fraction gain is proportional to annual emissions', () => {
    const a = quarterlyPpmGainFromEmissions(40);
    const b = quarterlyPpmGainFromEmissions(80);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it('ocean sink is zero below preindustrial', () => {
    expect(quarterlyOceanSinkPpm(BALANCE.preindustrialCO2ppm)).toBe(0);
    expect(quarterlyOceanSinkPpm(BALANCE.preindustrialCO2ppm - 10)).toBe(0);
  });

  it('ocean sink scales with excess above preindustrial', () => {
    const a = quarterlyOceanSinkPpm(BALANCE.preindustrialCO2ppm + 100);
    const b = quarterlyOceanSinkPpm(BALANCE.preindustrialCO2ppm + 200);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it('nature removal scales with land + capture adoption', () => {
    const noAdopt = fakeCountry({ adoption: { ...ZERO_ADOPT } });
    const withAdopt = fakeCountry({ adoption: { ...ZERO_ADOPT, land: 0.5, capture: 0.5 } });
    const state0 = fakeState({ countries: { A: noAdopt } });
    const state1 = fakeState({ countries: { A: withAdopt } });
    expect(quarterlyNatureRemovalPpm(state0)).toBe(0);
    expect(quarterlyNatureRemovalPpm(state1)).toBeGreaterThan(0);
  });

  it('natureBonus modifier amplifies removal', () => {
    const c = fakeCountry({ adoption: { ...ZERO_ADOPT, land: 1, capture: 1 } });
    const base = quarterlyNatureRemovalPpm(fakeState({ countries: { A: c } }));
    const amp  = quarterlyNatureRemovalPpm(fakeState({ countries: { A: c }, meta: { mod: { natureBonus: 2 } } }));
    expect(amp).toBeCloseTo(base * 2, 5);
  });

  it('nextCO2ppm never falls below preindustrial', () => {
    const state = fakeState({ countries: { A: fakeCountry({ adoption: { ...ZERO_ADOPT, land: 1, capture: 1 } }) } });
    expect(nextCO2ppm(BALANCE.preindustrialCO2ppm + 5, 0, state)).toBeGreaterThanOrEqual(BALANCE.preindustrialCO2ppm);
  });
});

describe('temperature response', () => {
  it('equilibrium temp is 0 at preindustrial CO₂', () => {
    expect(equilibriumTempC(BALANCE.preindustrialCO2ppm)).toBeCloseTo(0, 6);
  });

  it('doubling CO₂ gives S°C of equilibrium warming', () => {
    const t = equilibriumTempC(BALANCE.preindustrialCO2ppm * 2);
    expect(t).toBeCloseTo(BALANCE.tempPerDoublingCO2, 5);
  });

  it('current temp relaxes toward equilibrium', () => {
    const eq = equilibriumTempC(500);
    const current = 1.0;
    const next = nextTempC(current, 500);
    // Moves toward equilibrium, but by less than one full step (lag < 1).
    expect(next).toBeGreaterThan(current);
    expect(next).toBeLessThan(eq);
  });
});
