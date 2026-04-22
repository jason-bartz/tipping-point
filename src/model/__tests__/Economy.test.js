// Unit tests for the Economy model.

import { describe, it, expect } from 'vitest';
import { incomePerTick, researchCost, deployCost } from '../Economy.js';
import { BALANCE } from '../../config/balance.js';

function mkState({ mod = {}, discountTicks = 0, discountPct = 0, countries = {} } = {}) {
  return {
    meta: { mod: { cpMult: 1, deployMult: 1, researchMult: 1, ...mod } },
    world: { researchDiscountTicksRemaining: discountTicks, researchDiscountPct: discountPct },
    countries,
  };
}

describe('incomePerTick', () => {
  it('equals base rate with no net-zero countries', () => {
    expect(incomePerTick(mkState())).toBeCloseTo(BALANCE.baseCPPerTick, 6);
  });

  it('scales with cpMult', () => {
    expect(incomePerTick(mkState({ mod: { cpMult: 2 } }))).toBeCloseTo(BALANCE.baseCPPerTick * 2, 6);
  });

  it('adds 0.25 per net-zero country', () => {
    const s = mkState({ countries: { A: { netZero: true }, B: { netZero: true }, C: { netZero: false } } });
    expect(incomePerTick(s)).toBeCloseTo(BALANCE.baseCPPerTick + 0.5, 6);
  });
});

describe('researchCost', () => {
  it('ceil-rounds and applies researchMult', () => {
    const s = mkState({ mod: { researchMult: 2 } });
    expect(researchCost(s, { researchCost: 3 }, s.meta.mod)).toBe(6);
  });

  it('applies the diamond discount when active', () => {
    const s = mkState({ mod: { researchMult: 1 }, discountTicks: 2, discountPct: 0.5 });
    expect(researchCost(s, { researchCost: 4 }, s.meta.mod)).toBe(2);
  });

  it('never returns less than 1', () => {
    const s = mkState({ mod: { researchMult: 0.1 }, discountTicks: 2, discountPct: 0.9 });
    expect(researchCost(s, { researchCost: 1 }, s.meta.mod)).toBe(1);
  });
});

describe('deployCost', () => {
  it('applies deployMult', () => {
    const s = mkState({ mod: { deployMult: 0.7 } });
    expect(deployCost(s, { isHome: false }, { deployCost: 10 }, s.meta.mod)).toBe(7);
  });

  it('discounts home deploys by BALANCE.homeDeployDiscount', () => {
    const s = mkState();
    const away = deployCost(s, { isHome: false }, { deployCost: 10 }, s.meta.mod);
    const home = deployCost(s, { isHome: true  }, { deployCost: 10 }, s.meta.mod);
    expect(home).toBeLessThan(away);
    expect(home).toBe(Math.ceil(10 * (1 - BALANCE.homeDeployDiscount)));
  });

  it('floors at 1', () => {
    const s = mkState({ mod: { deployMult: 0 } });
    expect(deployCost(s, { isHome: true }, { deployCost: 5 }, s.meta.mod)).toBe(1);
  });
});
