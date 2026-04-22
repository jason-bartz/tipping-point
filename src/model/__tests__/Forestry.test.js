// Unit tests for the forestry model — forest-health dynamics and the
// carbon-liability accrual that drives the government-fell mechanic.

import { describe, it, expect } from 'vitest';
import {
  forestHealthDelta,
  passiveLiabilityDelta,
  wildfireLiability,
  step,
  chargeWildfire,
} from '../Forestry.js';
import { BALANCE } from '../../config/balance.js';

const mkCountry = (over = {}) => ({
  id: 'TST', name: 'Test',
  adoption: { land: 0 },
  forestBaseline: 0.5,
  forestHealth: 0.5,
  government: {
    incumbent: { tag: 'mixed' },
    shadow:    { tag: 'mixed' },
    carbonLiability: 0,
  },
  ...over,
});
const world = (t = 1.2) => ({ tempAnomalyC: t });

describe('forestHealthDelta', () => {
  it('regenerates when land adoption is high and temp is low', () => {
    const c = mkCountry({ adoption: { land: 0.8 } });
    expect(forestHealthDelta(c, world(1.0))).toBeGreaterThan(0);
  });

  it('decays under heat stress with low land adoption', () => {
    const c = mkCountry({ adoption: { land: 0 } });
    expect(forestHealthDelta(c, world(2.0))).toBeLessThan(0);
  });

  it('adoption buffers decay: high land adoption cuts the decay term', () => {
    const hot = world(2.0);
    const bare    = mkCountry({ adoption: { land: 0 } });
    const tended  = mkCountry({ adoption: { land: 0.9 } });
    expect(forestHealthDelta(tended, hot)).toBeGreaterThan(forestHealthDelta(bare, hot));
  });

  it('zero delta at threshold temp with zero adoption', () => {
    const c = mkCountry({ adoption: { land: 0 } });
    const d = forestHealthDelta(c, world(BALANCE.forestry.tempStressThresholdC));
    expect(d).toBeCloseTo(0, 6);
  });
});

describe('passiveLiabilityDelta', () => {
  it('zero when forest is healthy relative to baseline', () => {
    const c = mkCountry({ forestHealth: 0.5, forestBaseline: 0.5 });
    expect(passiveLiabilityDelta(c)).toBe(0);
  });

  it('accrues when forest drops below the trigger fraction of baseline', () => {
    const trigger = BALANCE.forestry.passiveLiabilityTriggerFraction;
    const c = mkCountry({
      forestHealth: 0.5 * trigger - 0.05,
      forestBaseline: 0.5,
    });
    expect(passiveLiabilityDelta(c)).toBeGreaterThan(0);
  });

  it('denier incumbent accrues liability 1.5× faster than mixed', () => {
    const base = mkCountry({
      forestHealth: 0.1,
      forestBaseline: 0.5,
      government: { incumbent: { tag: 'mixed' }, shadow: { tag: 'mixed' }, carbonLiability: 0 },
    });
    const denier = mkCountry({
      forestHealth: 0.1,
      forestBaseline: 0.5,
      government: { incumbent: { tag: 'denier' }, shadow: { tag: 'mixed' }, carbonLiability: 0 },
    });
    expect(passiveLiabilityDelta(denier)).toBeGreaterThan(passiveLiabilityDelta(base));
    // 1.5× within a tight epsilon.
    expect(passiveLiabilityDelta(denier) / passiveLiabilityDelta(base)).toBeCloseTo(1.5, 5);
  });
});

describe('wildfireLiability', () => {
  it('returns zero for unknown event ids', () => {
    const c = mkCountry();
    expect(wildfireLiability(c, 'not_a_wildfire')).toBe(0);
  });

  it('applies the incumbent liabilityRate multiplier', () => {
    const mixed = mkCountry();
    const green = mkCountry({
      government: { incumbent: { tag: 'green' }, shadow: { tag: 'mixed' }, carbonLiability: 0 },
    });
    expect(wildfireLiability(green, 'wildfire')).toBeLessThan(wildfireLiability(mixed, 'wildfire'));
  });
});

describe('step', () => {
  it('advances forest health and liability in place', () => {
    const c = mkCountry({
      adoption: { land: 0 }, forestHealth: 0.2, forestBaseline: 0.5,
    });
    const before = { health: c.forestHealth, liab: c.government.carbonLiability };
    step(c, world(2.0));
    expect(c.forestHealth).toBeLessThan(before.health);
    expect(c.government.carbonLiability).toBeGreaterThan(before.liab);
  });

  it('returns true when liability crosses the cap', () => {
    const c = mkCountry({
      adoption: { land: 0 }, forestHealth: 0.0, forestBaseline: 0.9,
      government: {
        incumbent: { tag: 'mixed' }, shadow: { tag: 'mixed' },
        carbonLiability: BALANCE.government.liabilityCap - 0.01,
      },
    });
    expect(step(c, world(2.5))).toBe(true);
  });

  it('returns false when liability stays under cap', () => {
    const c = mkCountry({ adoption: { land: 1 }, forestHealth: 0.6, forestBaseline: 0.5 });
    expect(step(c, world(1.0))).toBe(false);
  });

  it('clamps forestHealth to [0, 1]', () => {
    // Runaway regen shouldn't push health above 1.
    const c = mkCountry({ adoption: { land: 1 }, forestHealth: 0.999, forestBaseline: 0.5 });
    step(c, world(1.0));
    expect(c.forestHealth).toBeLessThanOrEqual(1);
    expect(c.forestHealth).toBeGreaterThanOrEqual(0);
  });

  it('is a no-op if the country has no government', () => {
    const c = { adoption: { land: 0 }, forestHealth: 0.5, forestBaseline: 0.5 };
    expect(step(c, world(2.0))).toBe(false);
  });
});

describe('chargeWildfire', () => {
  it('adds liability and returns true if cap crosses', () => {
    const c = mkCountry({
      government: {
        incumbent: { tag: 'mixed' }, shadow: { tag: 'mixed' },
        carbonLiability: BALANCE.government.liabilityCap - 5,
      },
    });
    expect(chargeWildfire(c, 'wildfire')).toBe(true); // 30 hit > 5 remaining
  });

  it('returns false if liability stays under the cap', () => {
    const c = mkCountry();
    expect(chargeWildfire(c, 'wildfire_smog')).toBe(false); // 15 hit, started at 0
    expect(c.government.carbonLiability).toBeCloseTo(15, 4);
  });

  it('no-op for non-wildfire ids', () => {
    const c = mkCountry();
    chargeWildfire(c, 'solar_breakthrough');
    expect(c.government.carbonLiability).toBe(0);
  });
});
