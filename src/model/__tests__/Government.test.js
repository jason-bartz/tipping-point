// Unit tests for the government model — politician generation, tag effects,
// and succession logic. All tests use a fixed rng seed for determinism.

import { describe, it, expect } from 'vitest';
import {
  makePolitician,
  rollShadowTag,
  rollInitialIncumbentTag,
  createGovernment,
  incumbentMultipliers,
  succeed,
} from '../Government.js';
import { Rng } from '../../core/Random.js';
import { BALANCE } from '../../config/balance.js';

describe('makePolitician', () => {
  it('generates a politician with the requested tag + a name', () => {
    const p = makePolitician('green', new Rng(1));
    expect(p.tag).toBe('green');
    expect(typeof p.name).toBe('string');
    expect(p.name.length).toBeGreaterThan(0);
  });

  it('climateScore reflects the tag with jitter', () => {
    const g = makePolitician('green',  new Rng(1));
    const m = makePolitician('mixed',  new Rng(1));
    const d = makePolitician('denier', new Rng(1));
    expect(g.climateScore).toBeGreaterThan(m.climateScore);
    expect(m.climateScore).toBeGreaterThan(d.climateScore);
    expect(g.climateScore).toBeLessThanOrEqual(100);
    expect(d.climateScore).toBeGreaterThanOrEqual(0);
  });

  it('same seed → same politician (determinism)', () => {
    const a = makePolitician('mixed', new Rng(42));
    const b = makePolitician('mixed', new Rng(42));
    expect(a.name).toBe(b.name);
    expect(a.climateScore).toBe(b.climateScore);
  });
});

describe('rollShadowTag', () => {
  it('petrostates skew denier across many rolls', () => {
    const rng = new Rng(7);
    const counts = { green: 0, mixed: 0, denier: 0 };
    for (let i = 0; i < 1000; i++) counts[rollShadowTag('petrostate', rng)]++;
    expect(counts.denier).toBeGreaterThan(counts.green);
    expect(counts.denier).toBeGreaterThan(counts.mixed);
  });

  it('service economies skew green across many rolls', () => {
    const rng = new Rng(7);
    const counts = { green: 0, mixed: 0, denier: 0 };
    for (let i = 0; i < 1000; i++) counts[rollShadowTag('service', rng)]++;
    expect(counts.green + counts.mixed).toBeGreaterThan(counts.denier);
  });

  it('unknown infra falls back to mixed weights', () => {
    const rng = new Rng(7);
    const tag = rollShadowTag('frobnicate', rng);
    expect(['green','mixed','denier']).toContain(tag);
  });
});

describe('rollInitialIncumbentTag', () => {
  it('very high will never produces a denier', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 100; i++) {
      expect(rollInitialIncumbentTag(90, rng)).not.toBe('denier');
    }
  });

  it('very low will biases denier', () => {
    const rng = new Rng(1);
    let denier = 0;
    for (let i = 0; i < 500; i++) if (rollInitialIncumbentTag(25, rng) === 'denier') denier++;
    expect(denier).toBeGreaterThan(250); // >50%
  });
});

describe('createGovernment', () => {
  it('returns a full slice with incumbent + shadow + zero liability', () => {
    const country = { id: 'USA', infra: 'service', politicalWill: 55 };
    const gov = createGovernment(country, new Rng(3));
    expect(gov.incumbent).toBeTruthy();
    expect(gov.shadow).toBeTruthy();
    expect(gov.carbonLiability).toBe(0);
    expect(gov.falls).toBe(0);
  });
});

describe('incumbentMultipliers', () => {
  it('returns tag-matched multipliers', () => {
    const country = { government: { incumbent: { tag: 'green' } } };
    const m = incumbentMultipliers(country);
    expect(m).toEqual(BALANCE.government.tagMultipliers.green);
  });

  it('defaults to mixed when no government present', () => {
    const country = {};
    const m = incumbentMultipliers(country);
    expect(m).toEqual(BALANCE.government.tagMultipliers.mixed);
  });
});

describe('succeed', () => {
  it('promotes shadow to incumbent + rolls a fresh shadow', () => {
    const country = {
      id: 'BRA', name: 'Brazil', infra: 'agricultural', politicalWill: 55,
      government: {
        incumbent: { name: 'Inc', tag: 'denier', climateScore: 20 },
        shadow:    { name: 'Sha', tag: 'green',  climateScore: 80 },
        carbonLiability: 105, falls: 0,
      },
    };
    const rng = new Rng(9);
    const summary = succeed(country, rng);

    expect(country.government.incumbent.name).toBe('Sha');
    expect(country.government.incumbent.tag).toBe('green');
    expect(country.government.shadow.name).not.toBe('Sha');
    expect(country.government.carbonLiability).toBe(0);
    expect(country.government.falls).toBe(1);

    expect(summary.outgoing.name).toBe('Inc');
    expect(summary.incoming.name).toBe('Sha');
    expect(summary.swing).toEqual(BALANCE.government.fallEffects.green);
  });

  it('returns null if the country has no government slice', () => {
    expect(succeed({}, new Rng(1))).toBeNull();
  });
});
