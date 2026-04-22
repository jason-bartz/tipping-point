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
  stressBirthPenalty,
  climateAnxietyPenalty,
  effectiveBirthRate,
  effectiveDeathRate,
  POP,
} from '../Population.js';

// Helper: build a country-shaped object from crude rates (per 1000 → decimal).
// Keeps tests readable and avoids hand-coding decimals everywhere.
const country = ({ birth, death, vuln = 1, pop = 100, birthMod = 0, deathMod = 0 }) => ({
  populationM: pop,
  birthRatePerYear: birth / 1000,
  deathRatePerYear: death / 1000,
  birthRateModifier: birthMod,
  deathRateModifier: deathMod,
  climateVulnerability: vuln,
});

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

describe('stressBirthPenalty', () => {
  it('is zero at zero stress', () => {
    expect(stressBirthPenalty(0)).toBe(0);
  });

  it('rises linearly then caps', () => {
    expect(stressBirthPenalty(10)).toBeCloseTo(0.10, 5);
    expect(stressBirthPenalty(25)).toBeCloseTo(0.25, 5);
    // Past the cap we stay pinned — a fertility collapse can't go infinite.
    expect(stressBirthPenalty(80)).toBeCloseTo(POP.stressBirthCapFraction, 5);
  });
});

describe('climateAnxietyPenalty', () => {
  it('is zero below the threshold', () => {
    expect(climateAnxietyPenalty(0, 3)).toBe(0);
    expect(climateAnxietyPenalty(1.2, 3)).toBe(0);
    expect(climateAnxietyPenalty(POP.mortalityTempThreshold, 3)).toBe(0);
  });

  it('is quadratic in excess warming', () => {
    // 2× excess → 4× penalty before the cap bites.
    const a = climateAnxietyPenalty(1.8, 1);
    const b = climateAnxietyPenalty(2.1, 1);
    const ratio = b / a;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(5);
  });

  it('scales with vulnerability and caps', () => {
    const low  = climateAnxietyPenalty(2.0, 1);
    const high = climateAnxietyPenalty(2.0, 3);
    expect(high).toBeCloseTo(low * 3, 5);
    // Severe warming + max vulnerability hits the cap, not a runaway.
    expect(climateAnxietyPenalty(3.5, 3)).toBeCloseTo(POP.climateAnxietyCapFraction, 5);
  });
});

describe('effectiveBirthRate', () => {
  it('matches intrinsic rate in a calm, cool world', () => {
    const c = country({ birth: 12, death: 8 });
    expect(effectiveBirthRate(c, 1.2, 0)).toBeCloseTo(0.012, 6);
  });

  it('drops under stress', () => {
    const c = country({ birth: 12, death: 8 });
    const calm = effectiveBirthRate(c, 1.2, 0);
    const crisis = effectiveBirthRate(c, 1.2, 25);
    expect(crisis).toBeLessThan(calm);
    expect(crisis).toBeCloseTo(calm * (1 - POP.stressBirthCapFraction), 5);
  });

  it('drops further under climate anxiety for vulnerable countries', () => {
    const tropical = country({ birth: 15, death: 6, vuln: 3 });
    const temperate = country({ birth: 15, death: 6, vuln: 1 });
    const tHot = effectiveBirthRate(tropical, 2.5, 0);
    const tempHot = effectiveBirthRate(temperate, 2.5, 0);
    expect(tHot).toBeLessThan(tempHot);
  });

  it('adds event-driven modifier after multipliers', () => {
    const c = country({ birth: 12, death: 8, birthMod: -0.002 });
    const r = effectiveBirthRate(c, 1.2, 0);
    expect(r).toBeCloseTo(0.012 - 0.002, 6);
  });

  it('clamps at zero — no negative births', () => {
    const c = country({ birth: 5, death: 10, birthMod: -0.020 });
    expect(effectiveBirthRate(c, 1.2, 0)).toBe(0);
  });
});

describe('effectiveDeathRate', () => {
  it('matches intrinsic rate in a calm, cool world', () => {
    const c = country({ birth: 12, death: 8 });
    expect(effectiveDeathRate(c, 1.2, 0)).toBeCloseTo(0.008, 6);
  });

  it('adds climate mortality above the threshold', () => {
    const c = country({ birth: 12, death: 8, vuln: 2 });
    const cool = effectiveDeathRate(c, 1.2, 0);
    const warm = effectiveDeathRate(c, 2.5, 0);
    expect(warm).toBeGreaterThan(cool);
  });

  it('is reduced by adoption shield', () => {
    const c = country({ birth: 12, death: 8, vuln: 2 });
    const unshielded = effectiveDeathRate(c, 2.5, 0);
    const shielded   = effectiveDeathRate(c, 2.5, 1);
    expect(shielded).toBeLessThan(unshielded);
  });

  it('adds event-driven death-rate modifier', () => {
    const c = country({ birth: 12, death: 8, deathMod: 0.003 });
    expect(effectiveDeathRate(c, 1.2, 0)).toBeCloseTo(0.011, 6);
  });
});

describe('annualGrowthRate', () => {
  it('equals birth − death below the climate threshold', () => {
    const c = country({ birth: 12, death: 8 });
    expect(annualGrowthRate(c, 1.2, 0, 0)).toBeCloseTo(0.004, 6);
  });

  it('drops below intrinsic rate once temperature crosses the threshold', () => {
    const india = country({ birth: 16.4, death: 7.2, vuln: 3 });
    const r = annualGrowthRate(india, 2.5, 0, 0);
    expect(r).toBeLessThan(0.0092);
  });

  it('can turn negative under severe warming', () => {
    const india = country({ birth: 16.4, death: 7.2, vuln: 3 });
    const r = annualGrowthRate(india, 4.0, 0, 0);
    expect(r).toBeLessThan(0);
  });

  it('adoption cushions the drop', () => {
    const india = country({ birth: 16.4, death: 7.2, vuln: 3 });
    const noShield = annualGrowthRate(india, 3.0, 0, 0);
    const shielded = annualGrowthRate(india, 3.0, 1, 0);
    expect(shielded).toBeGreaterThan(noShield);
  });

  it('low-vulnerability country suffers less drag than high-vulnerability at same rates', () => {
    const v1 = country({ birth: 12, death: 8, vuln: 1 });
    const v3 = country({ birth: 12, death: 8, vuln: 3 });
    const a = annualGrowthRate(v1, 3.0, 0, 0);
    const b = annualGrowthRate(v3, 3.0, 0, 0);
    expect(a).toBeGreaterThan(b);
    expect(a - b).toBeGreaterThan(0.006);
  });
});

describe('projectQuarter', () => {
  it('grows population at the intrinsic rate with a neutral climate', () => {
    const c = country({ birth: 12, death: 2, pop: 100 });
    const r = projectQuarter(c, 1.0, 0, 0);
    // Net = 10/1000 = 0.01/yr → 0.0025/quarter → 100.25M.
    expect(r.populationM).toBeCloseTo(100.25, 5);
    expect(r.deltaM).toBeCloseTo(0.25, 5);
    expect(r.annualRatePct).toBeCloseTo(1.0, 5);
  });

  it('shrinks population when climate drag exceeds natural growth', () => {
    const c = country({ birth: 7, death: 2, vuln: 3, pop: 100 });
    const r = projectQuarter(c, 4.0, 0, 0);
    expect(r.populationM).toBeLessThan(100);
    expect(r.deltaM).toBeLessThan(0);
  });

  it('never returns a negative population (clamps at 0)', () => {
    // Birth 0, death 1000/1000 → -100%/yr — degenerate case; stays at 0.
    const c = country({ birth: 0, death: 1000, vuln: 3, pop: 0 });
    const r = projectQuarter(c, 4.0, 0, 0);
    expect(r.populationM).toBeGreaterThanOrEqual(0);
  });

  it('reports birth/death breakdowns that sum to net rate', () => {
    const c = country({ birth: 16.4, death: 7.2, vuln: 3, pop: 1000 });
    const r = projectQuarter(c, 2.5, 0.4, 5);
    expect(r.birthRatePct - r.deathRatePct).toBeCloseTo(r.annualRatePct, 5);
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
    // Millions round to whole numbers — the HUD wants "+30M/yr", not
    // spuriously-precise "+29.63M/yr".
    expect(formatDelta(1.5)).toBe('+2M');
    expect(formatDelta(-2.3)).toBe('−2M');
    expect(formatDelta(29.63)).toBe('+30M');
    // Below 1M we keep K granularity so small swings still read.
    expect(formatDelta(0.05)).toBe('+50K');
    expect(formatDelta(-0.05)).toBe('−50K');
  });
});
