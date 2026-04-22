// Unit tests for the adoption model — resistance, spread, and will drift.

import { describe, it, expect } from 'vitest';
import {
  resistanceFor,
  spreadFraction,
  willDecayStressBoost,
  willDeltaFor,
  clampWill,
  meetsNetZero,
} from '../Adoption.js';
import { BALANCE } from '../../config/balance.js';

describe('resistanceFor', () => {
  it('petrostates resist energy and policy', () => {
    expect(resistanceFor({ infra: 'petrostate' }, 'energy')).toBeLessThan(1);
    expect(resistanceFor({ infra: 'petrostate' }, 'policy')).toBeLessThan(1);
  });

  it('petrostates are neutral toward non-energy/policy branches', () => {
    expect(resistanceFor({ infra: 'petrostate' }, 'land')).toBe(1);
    expect(resistanceFor({ infra: 'petrostate' }, 'industry')).toBe(1);
  });

  it('industrial economies resist industry deploys', () => {
    expect(resistanceFor({ infra: 'industrial' }, 'industry')).toBeLessThan(1);
  });

  it('agricultural economies welcome land reform', () => {
    expect(resistanceFor({ infra: 'agricultural' }, 'land')).toBeGreaterThan(1);
  });

  it('everyone else defaults to neutral', () => {
    expect(resistanceFor({ infra: 'service' }, 'energy')).toBe(1);
    expect(resistanceFor({ infra: 'mixed' }, 'policy')).toBe(1);
  });
});

describe('spreadFraction', () => {
  it('scales with adjacency rate and spreadMult', () => {
    const base = spreadFraction({ infra: 'service', politicalWill: 100 }, 'energy', { spreadMult: 1 });
    const boost = spreadFraction({ infra: 'service', politicalWill: 100 }, 'energy', { spreadMult: 2 });
    expect(boost).toBeCloseTo(base * 2, 6);
  });

  it('is zero when political will is zero', () => {
    expect(spreadFraction({ infra: 'service', politicalWill: 0 }, 'energy', {})).toBe(0);
  });

  it('is lower for a petrostate receiving energy than a service economy', () => {
    const service    = spreadFraction({ infra: 'service',    politicalWill: 70 }, 'energy', {});
    const petrostate = spreadFraction({ infra: 'petrostate', politicalWill: 70 }, 'energy', {});
    expect(petrostate).toBeLessThan(service);
  });
});

describe('will decay + drift', () => {
  it('stress boost is 1.0 at or below 1.4°C', () => {
    expect(willDecayStressBoost(1.0)).toBe(1);
    expect(willDecayStressBoost(1.4)).toBe(1);
  });

  it('stress boost grows above the threshold', () => {
    expect(willDecayStressBoost(2.0)).toBeGreaterThan(1);
    expect(willDecayStressBoost(3.0)).toBeGreaterThan(willDecayStressBoost(2.0));
  });

  it('willDeltaFor drifts low will upward toward 50', () => {
    const d = willDeltaFor({ politicalWill: 30 }, { tempAnomalyC: 1.0, societalStress: 0 });
    expect(d).toBeGreaterThan(0);
  });

  it('willDeltaFor drifts high will downward toward 50', () => {
    const d = willDeltaFor({ politicalWill: 90 }, { tempAnomalyC: 1.0, societalStress: 0 });
    expect(d).toBeLessThan(0);
  });

  it('high societal stress adds a negative bleed', () => {
    const quiet = willDeltaFor({ politicalWill: 50 }, { tempAnomalyC: 1.0, societalStress: 0 });
    const loud  = willDeltaFor({ politicalWill: 50 }, { tempAnomalyC: 1.0, societalStress: 60 });
    expect(loud).toBeLessThan(quiet);
  });

  it('clampWill pins to BALANCE min/max political will', () => {
    expect(clampWill(-5)).toBe(BALANCE.minPoliticalWill);
    expect(clampWill(200)).toBe(BALANCE.maxPoliticalWill);
    expect(clampWill(55)).toBe(55);
  });
});

describe('meetsNetZero', () => {
  it('false when most bars are empty', () => {
    const c = { adoption: { energy: 0.2, transport: 0.1, industry: 0.05, land: 0, capture: 0, policy: 0.1 } };
    expect(meetsNetZero(c)).toBe(false);
  });

  it('true when the average is above threshold', () => {
    const v = BALANCE.netZeroThresholdAdoption + 0.02;
    const c = { adoption: { energy: v, transport: v, industry: v, land: v, capture: v, policy: v } };
    expect(meetsNetZero(c)).toBe(true);
  });

  it('false when half are full and half are empty (threshold ~0.5 not met)', () => {
    const c = { adoption: { energy: 1, transport: 1, industry: 1, land: 0, capture: 0, policy: 0 } };
    expect(meetsNetZero(c)).toBe(false);
  });
});
