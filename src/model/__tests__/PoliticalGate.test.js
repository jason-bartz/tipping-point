// Unit tests for political-will gating. These lock in the "a carbon tax
// should not pass in Saudi Arabia on day one" contract.

import { describe, it, expect } from 'vitest';
import { gate, effectiveThreshold, effectiveWillCost } from '../PoliticalGate.js';
import { BALANCE } from '../../config/balance.js';

function makeState(researched = []) {
  return {
    meta: {},
    world: { researched: new Set(researched) },
  };
}

const SERVICE_COUNTRY    = { id: 'GBR', infra: 'service',     politicalWill: 60 };
const PETROSTATE_COUNTRY = { id: 'SAU', infra: 'petrostate',  politicalWill: 45 };
const AG_COUNTRY         = { id: 'BRA', infra: 'agricultural', politicalWill: 55 };

const UNGATED     = { id: 'solar_power',  branch: 'energy' };
const MILD_GATE   = { id: 'solar_mandate', branch: 'energy', willRequirement: 45, willCost: 4 };
const CARBON_TAX  = { id: 'carbon_price',  branch: 'policy', willRequirement: 50, willCost: 6 };
const LAND_POLICY = { id: 'plant_subsidy', branch: 'land',   willRequirement: 40, willCost: 4 };

describe('effectiveThreshold', () => {
  it('is 0 for ungated activities (no modifiers applied)', () => {
    expect(effectiveThreshold(SERVICE_COUNTRY, UNGATED)).toBe(0);
    expect(effectiveThreshold(PETROSTATE_COUNTRY, UNGATED)).toBe(0);
  });

  it('service country pays base threshold only', () => {
    expect(effectiveThreshold(SERVICE_COUNTRY, CARBON_TAX)).toBe(50);
  });

  it('petrostate adds infra + policy-branch penalty to policy deploys', () => {
    // base 50 + petrostate infra 20 + policy-branch penalty 12 = 82
    expect(effectiveThreshold(PETROSTATE_COUNTRY, CARBON_TAX)).toBe(82);
  });

  it('agricultural country is friendlier to land policy (negative penalty)', () => {
    // base 40 + ag infra 4 + land-branch -6 = 38
    expect(effectiveThreshold(AG_COUNTRY, LAND_POLICY)).toBe(38);
  });
});

describe('gate', () => {
  it('allows any ungated deploy regardless of will', () => {
    const broke = { ...SERVICE_COUNTRY, politicalWill: 0 };
    const v = gate(makeState(), broke, UNGATED);
    expect(v.allowed).toBe(true);
    expect(v.gated).toBe(false);
  });

  it('allows a mild gate when will meets threshold', () => {
    const v = gate(makeState(), SERVICE_COUNTRY, MILD_GATE);
    expect(v.allowed).toBe(true);
    expect(v.gated).toBe(true);
    expect(v.threshold).toBe(45);
    expect(v.willCost).toBe(4);
  });

  it('blocks when will is below threshold', () => {
    const lowWill = { ...SERVICE_COUNTRY, politicalWill: 30 };
    const v = gate(makeState(), lowWill, CARBON_TAX);
    expect(v.allowed).toBe(false);
    expect(v.shortfall).toBe(20);
  });

  it('is extra strict in petrostates', () => {
    // effective threshold 82; PETROSTATE_COUNTRY has 45 will → blocked
    const v = gate(makeState(), PETROSTATE_COUNTRY, CARBON_TAX);
    expect(v.allowed).toBe(false);
    expect(v.threshold).toBe(82);
    expect(v.shortfall).toBe(37);
  });
});

describe('effectiveWillCost (with synergies)', () => {
  it('returns 0 for ungated activities', () => {
    expect(effectiveWillCost(makeState(), SERVICE_COUNTRY, UNGATED)).toBe(0);
  });

  it('returns base cost when no synergy discounts apply', () => {
    expect(effectiveWillCost(makeState(), SERVICE_COUNTRY, CARBON_TAX)).toBe(6);
  });

  it('discounts when a synergy reduces will cost (Climate Finance Pact halves it)', () => {
    // climate_finance_devworld → willCostMult 0.5
    const state = makeState(['climate_finance']);
    expect(effectiveWillCost(state, SERVICE_COUNTRY, CARBON_TAX)).toBe(3);
  });
});
