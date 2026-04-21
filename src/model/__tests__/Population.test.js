// Unit tests for the population model. These lock in the scientific curve so
// future tuning can't silently break "at +4°C we're in trouble."

import { describe, it, expect } from 'vitest';
import {
  climateMortalityRate,
  adoptionShield,
  annualGrowthRate,
  projectQuarter,
  worldPopulationM,
  worldQuarterlyDeltaM,
  formatPopulationFull,
  formatPopulationCompact,
  formatDelta,
  POP,
} from '../Population.js';

describe('climateMortalityRate', () => {
  it('is 0 at or below the threshold', () => {
    expect(climateMortalityRate(0, 3)).toBe(0);
    expect(climateMortalityRate(1.0, 3)).toBe(0);
    expect(climateMortalityRate(POP.mortalityTempThreshold, 3)).toBe(0);
  });

  it('scales with vulnerability linearly', () => {
    const low  = climateMortalityRate(2.5, 1);
    const mid  = climateMortalityRate(2.5, 2);
    const high = climateMortalityRate(2.5, 3);
    expect(mid).toBeCloseTo(low * 2, 6);
    expect(high).toBeCloseTo(low * 3, 6);
  });

  it('grows nonlinearly with excess warming', () => {
    const a = climateMortalityRate(2.0, 1);  // excess 0.5
    const b = climateMortalityRate(2.5, 1);  // excess 1.0
    const c = climateMortalityRate(3.0, 1);  // excess 1.5
    // Each step bigger than the last — that's the defining shape.
    expect(b - a).toBeGreaterThan(a);
    expect(c - b).toBeGreaterThan(b - a);
  });

  it('lands in a realistic range at +4°C for vulnerable countries', () => {
    // At game-lose temp, the curve should produce meaningful but sub-extinction
    // mortality in the most exposed countries. Matches IPCC AR6 high-end.
    const rate = climateMortalityRate(4.0, 3);
    expect(rate).toBeGreaterThan(0.02);   // >2%/yr — clearly visible
    expect(rate).toBeLessThan(0.08);      // <8%/yr — not instant apocalypse
  });
});

describe('adoptionShield', () => {
  it('no shield when adoption is zero', () => {
    expect(adoptionShield(0)).toBe(1);
  });

  it('caps the shield — cannot fully immunize against global warming', () => {
    expect(adoptionShield(1)).toBe(1 - POP.shieldMax);
    expect(adoptionShield(2)).toBe(1 - POP.shieldMax); // clamp
  });

  it('handles missing input', () => {
    expect(adoptionShield(undefined)).toBe(1);
    expect(adoptionShield(null)).toBe(1);
  });
});

describe('annualGrowthRate', () => {
  const INDIA_LIKE = { baseGrowthPerYear: 0.008, climateVulnerability: 3 };
  const GERMANY_LIKE = { baseGrowthPerYear: 0.001, climateVulnerability: 1 };

  it('equals base rate below the climate threshold', () => {
    expect(annualGrowthRate(INDIA_LIKE, 1.2, 0)).toBeCloseTo(0.008, 6);
    expect(annualGrowthRate(GERMANY_LIKE, 1.2, 0)).toBeCloseTo(0.001, 6);
  });

  it('drops below base rate once temperature crosses the threshold', () => {
    const r = annualGrowthRate(INDIA_LIKE, 2.5, 0);
    expect(r).toBeLessThan(0.008);
  });

  it('can turn negative under severe warming', () => {
    const r = annualGrowthRate(INDIA_LIKE, 4.0, 0);
    expect(r).toBeLessThan(0);
  });

  it('adoption meaningfully cushions the drop', () => {
    const noShield = annualGrowthRate(INDIA_LIKE, 3.0, 0);
    const shielded = annualGrowthRate(INDIA_LIKE, 3.0, 1);
    expect(shielded).toBeGreaterThan(noShield);
  });

  it('low-vulnerability country suffers less drag than high-vulnerability at same base', () => {
    // Isolate the vulnerability effect by holding base growth constant.
    const SAME_BASE = { baseGrowthPerYear: 0.005 };
    const v1 = annualGrowthRate({ ...SAME_BASE, climateVulnerability: 1 }, 3.0, 0);
    const v3 = annualGrowthRate({ ...SAME_BASE, climateVulnerability: 3 }, 3.0, 0);
    expect(v1).toBeGreaterThan(v3);
    expect(v1 - v3).toBeGreaterThan(0.008); // ≥0.8pp/yr spread at +3°C
  });
});

describe('projectQuarter', () => {
  it('grows population at the base rate with a neutral climate', () => {
    const c = { populationM: 100, baseGrowthPerYear: 0.01, climateVulnerability: 1 };
    const r = projectQuarter(c, 1.0, 0);
    // Expected: 100 * (1 + 0.01/4) = 100.25
    expect(r.populationM).toBeCloseTo(100.25, 5);
    expect(r.deltaM).toBeCloseTo(0.25, 5);
    expect(r.annualRatePct).toBeCloseTo(1.0, 5);
  });

  it('shrinks population when climate drag exceeds base growth', () => {
    const c = { populationM: 100, baseGrowthPerYear: 0.005, climateVulnerability: 3 };
    const r = projectQuarter(c, 4.0, 0);
    expect(r.populationM).toBeLessThan(100);
    expect(r.deltaM).toBeLessThan(0);
  });

  it('never returns a negative population (clamps at 0)', () => {
    const c = { populationM: 0, baseGrowthPerYear: -1, climateVulnerability: 3 };
    const r = projectQuarter(c, 4.0, 0);
    expect(r.populationM).toBeGreaterThanOrEqual(0);
  });
});

describe('world-scope selectors', () => {
  it('sums per-country populations', () => {
    const state = { countries: { A: { populationM: 100 }, B: { populationM: 250 } } };
    expect(worldPopulationM(state)).toBe(350);
  });

  it('sums per-country deltas', () => {
    const state = { countries: { A: { populationDeltaM: 1.2 }, B: { populationDeltaM: -0.4 } } };
    expect(worldQuarterlyDeltaM(state)).toBeCloseTo(0.8, 5);
  });

  it('tolerates missing fields', () => {
    const state = { countries: { A: {}, B: { populationM: 50 } } };
    expect(worldPopulationM(state)).toBe(50);
    expect(worldQuarterlyDeltaM(state)).toBe(0);
  });
});

describe('formatters', () => {
  it('formatPopulationFull returns comma-separated full count', () => {
    expect(formatPopulationFull(1430)).toBe('1,430,000,000');
    expect(formatPopulationFull(7.89)).toBe('7,890,000');
  });

  it('formatPopulationCompact scales to B / M / K', () => {
    expect(formatPopulationCompact(1500)).toBe('1.50B');
    expect(formatPopulationCompact(340)).toBe('340.0M');
    expect(formatPopulationCompact(0.5)).toBe('500K');
  });

  it('formatDelta prefixes with sign and uses sensible units', () => {
    expect(formatDelta(0)).toBe('+0');
    expect(formatDelta(1.5)).toBe('+1.50M');
    expect(formatDelta(-2.3)).toBe('−2.30M');
    expect(formatDelta(0.05)).toBe('+50K');
    expect(formatDelta(-0.05)).toBe('−50K');
  });
});
