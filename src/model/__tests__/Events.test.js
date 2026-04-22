// Unit tests for the declarative event-effect system. Two layers:
//   1. Op-level: each `op` in applyEffect does what its docstring says and
//      respects field-specific clamps.
//   2. Pool integrity: every event in EVENT_POOL's declarative `effects`
//      references a valid op, touches valid fields, and survives a dry-run
//      apply against a baseline state. Catches typos before they ship.

import { describe, it, expect } from 'vitest';
import { applyEffect, applyEffects, matchesWhere } from '../Events.js';
import { EVENT_POOL } from '../../data/events.js';
import { BALANCE } from '../../config/balance.js';
import { Rng } from '../../core/Random.js';

const ZERO_ADOPT = () => ({ energy: 0, transport: 0, industry: 0, land: 0, capture: 0, policy: 0 });

function mkCountry(overrides = {}) {
  return {
    id: 'TST',
    name: 'Testland',
    infra: 'service',
    politicalWill: 50,
    baseEmissionsGtCO2: 1,
    adoption: ZERO_ADOPT(),
    netZero: false,
    ...overrides,
  };
}

function mkState({ countries = {}, world = {}, seed = 42 } = {}) {
  return {
    meta: { rng: new Rng(seed) },
    world: {
      co2ppm: 420,
      tempAnomalyC: 1.3,
      climatePoints: 10,
      societalStress: 0,
      researched: new Set(),
      ...world,
    },
    countries,
  };
}

describe('matchesWhere', () => {
  it('exact equality on a scalar', () => {
    expect(matchesWhere({ infra: 'petrostate' }, { infra: 'petrostate' })).toBe(true);
    expect(matchesWhere({ infra: 'service' }, { infra: 'petrostate' })).toBe(false);
  });

  it('OR across array values', () => {
    expect(matchesWhere({ infra: 'service' }, { infra: ['service', 'industrial'] })).toBe(true);
    expect(matchesWhere({ infra: 'petrostate' }, { infra: ['service', 'industrial'] })).toBe(false);
  });

  it('AND across multiple keys', () => {
    expect(matchesWhere({ infra: 'service', netZero: true }, { infra: 'service', netZero: true })).toBe(true);
    expect(matchesWhere({ infra: 'service', netZero: false }, { infra: 'service', netZero: true })).toBe(false);
  });

  it('minEmissions threshold', () => {
    expect(matchesWhere({ baseEmissionsGtCO2: 1.0 }, { minEmissions: 0.8 })).toBe(true);
    expect(matchesWhere({ baseEmissionsGtCO2: 0.5 }, { minEmissions: 0.8 })).toBe(false);
  });

  it('minAdoption threshold on a branch', () => {
    const c = { adoption: { energy: 0.5 } };
    expect(matchesWhere(c, { minAdoption: { branch: 'energy', v: 0.3 } })).toBe(true);
    expect(matchesWhere(c, { minAdoption: { branch: 'energy', v: 0.7 } })).toBe(false);
  });
});

describe('addWorld op', () => {
  it('adds to world scalars', () => {
    const s = mkState();
    applyEffect(s, { op: 'addWorld', field: 'co2ppm', value: 2 });
    expect(s.world.co2ppm).toBe(422);
  });

  it('climatePoints floor at 0', () => {
    const s = mkState({ world: { climatePoints: 3 } });
    applyEffect(s, { op: 'addWorld', field: 'climatePoints', value: -10 });
    expect(s.world.climatePoints).toBe(0);
  });

  it('co2ppm never dips below preindustrial', () => {
    const s = mkState({ world: { co2ppm: BALANCE.preindustrialCO2ppm + 1 } });
    applyEffect(s, { op: 'addWorld', field: 'co2ppm', value: -50 });
    expect(s.world.co2ppm).toBe(BALANCE.preindustrialCO2ppm);
  });

  it('respects explicit max cap', () => {
    const s = mkState({ world: { tempAnomalyC: 2.95 } });
    applyEffect(s, { op: 'addWorld', field: 'tempAnomalyC', value: 0.2, max: 3.0 });
    expect(s.world.tempAnomalyC).toBe(3.0);
  });
});

describe('addAllCountries op', () => {
  it('adds to politicalWill for every country (clamped)', () => {
    const s = mkState({ countries: { A: mkCountry({ politicalWill: 95 }), B: mkCountry({ politicalWill: 15 }) } });
    applyEffect(s, { op: 'addAllCountries', field: 'politicalWill', value: 10 });
    expect(s.countries.A.politicalWill).toBe(100); // clamp
    expect(s.countries.B.politicalWill).toBe(25);
  });

  it('adds to a specific adoption branch (clamped to [0,1])', () => {
    const s = mkState({ countries: { A: mkCountry({ adoption: { ...ZERO_ADOPT(), energy: 0.98 } }) } });
    applyEffect(s, { op: 'addAllCountries', field: 'adoption.energy', value: 0.1 });
    expect(s.countries.A.adoption.energy).toBe(1);
  });
});

describe('addCountries op', () => {
  it('matches by infra', () => {
    const s = mkState({
      countries: {
        A: mkCountry({ infra: 'petrostate', politicalWill: 50 }),
        B: mkCountry({ infra: 'service',     politicalWill: 50 }),
      },
    });
    applyEffect(s, { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -12 });
    expect(s.countries.A.politicalWill).toBe(38);
    expect(s.countries.B.politicalWill).toBe(50);
  });
});

describe('addTarget / addTargetAllBranches / addTargetRandomBranch', () => {
  it('no-op when ctx.target is missing', () => {
    const s = mkState({ countries: { A: mkCountry() } });
    applyEffect(s, { op: 'addTarget', field: 'politicalWill', value: 20 });
    expect(s.countries.A.politicalWill).toBe(50);
  });

  it('applies to ctx.target only', () => {
    const s = mkState({ countries: { A: mkCountry({ politicalWill: 50 }), B: mkCountry({ politicalWill: 50 }) } });
    applyEffect(s, { op: 'addTarget', field: 'politicalWill', value: 10 }, { target: s.countries.A });
    expect(s.countries.A.politicalWill).toBe(60);
    expect(s.countries.B.politicalWill).toBe(50);
  });

  it('addTargetAllBranches hits every branch', () => {
    const s = mkState({ countries: { A: mkCountry({ adoption: { energy: 0.5, transport: 0.5, industry: 0.5, land: 0.5, capture: 0.5, policy: 0.5 } }) } });
    applyEffect(s, { op: 'addTargetAllBranches', value: -0.2 }, { target: s.countries.A });
    const a = s.countries.A.adoption;
    expect(a.energy).toBeCloseTo(0.3, 5);
    expect(a.policy).toBeCloseTo(0.3, 5);
  });

  it('addTargetRandomBranch picks exactly one branch deterministically for a given seed', () => {
    const s = mkState({ seed: 7, countries: { A: mkCountry() } });
    const before = { ...s.countries.A.adoption };
    applyEffect(s, { op: 'addTargetRandomBranch', value: 0.1 }, { target: s.countries.A });
    const after = s.countries.A.adoption;
    const changed = Object.keys(after).filter(k => after[k] !== before[k]);
    expect(changed.length).toBe(1);
    expect(after[changed[0]]).toBeCloseTo(before[changed[0]] + 0.1, 5);
  });
});

describe('addRandomCountries / addRandomBranches', () => {
  it('addRandomCountries applies to N distinct countries', () => {
    const s = mkState({
      seed: 1,
      countries: {
        A: mkCountry({ id: 'A' }), B: mkCountry({ id: 'B' }),
        C: mkCountry({ id: 'C' }), D: mkCountry({ id: 'D' }),
      },
    });
    applyEffect(s, { op: 'addRandomCountries', count: 2, field: 'politicalWill', value: 10 });
    const touched = Object.values(s.countries).filter(c => c.politicalWill !== 50);
    expect(touched.length).toBe(2);
  });

  it('addRandomBranches applies to N countries with a random branch each', () => {
    const s = mkState({
      seed: 3,
      countries: {
        A: mkCountry({ id: 'A' }), B: mkCountry({ id: 'B' }), C: mkCountry({ id: 'C' }),
      },
    });
    applyEffect(s, { op: 'addRandomBranches', count: 2, value: 0.04, branches: ['energy', 'transport'] });
    const countriesTouched = Object.values(s.countries).filter(c => {
      return c.adoption.energy > 0 || c.adoption.transport > 0;
    }).length;
    expect(countriesTouched).toBe(2);
  });
});

describe('applyEffects array', () => {
  it('runs multiple effects in order', () => {
    const s = mkState({ countries: { A: mkCountry({ politicalWill: 50, adoption: ZERO_ADOPT() }) } });
    applyEffects(s, [
      { op: 'addAllCountries', field: 'politicalWill', value: 5 },
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.1 },
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ]);
    expect(s.countries.A.politicalWill).toBe(55);
    expect(s.countries.A.adoption.energy).toBeCloseTo(0.1, 5);
    expect(s.world.climatePoints).toBe(13);
  });

  it('tolerates undefined/empty list', () => {
    const s = mkState();
    expect(() => applyEffects(s, undefined)).not.toThrow();
    expect(() => applyEffects(s, [])).not.toThrow();
  });
});

// ─── Pool integrity ────────────────────────────────────────────────────────
// Every event with a declarative `effects` array is smoke-tested: does it run
// cleanly against a baseline state without throwing, and does every op name
// match a known op?

const KNOWN_OPS = new Set([
  'addWorld', 'addAllCountries', 'addCountries',
  'addTarget', 'addTargetAllBranches', 'addTargetRandomBranch',
  'addRandomCountries', 'addRandomBranches',
]);
const KNOWN_BRANCHES = new Set(['energy', 'transport', 'industry', 'land', 'capture', 'policy']);

function collectEffectArrays(evt) {
  const arrays = [];
  if (evt.effects) arrays.push(evt.effects);
  if (evt.choices) for (const ch of evt.choices) if (ch.effects) arrays.push(ch.effects);
  return arrays;
}

describe('EVENT_POOL integrity', () => {
  const KNOWN_ADVISORS = new Set(['scientist', 'diplomat', 'activist', 'industrialist']);

  for (const evt of EVENT_POOL) {
    if (evt.advisorStances) {
      it(`${evt.id} — advisorStances reference valid advisor ids and choice keys`, () => {
        const choiceKeys = new Set((evt.choices ?? []).map(c => c.key));
        for (const st of evt.advisorStances) {
          expect(KNOWN_ADVISORS.has(st.advisor), `${evt.id}: unknown advisor "${st.advisor}"`).toBe(true);
          expect(typeof st.stance === 'string' && st.stance.length > 0, `${evt.id}: missing stance text`).toBe(true);
          if (st.supports !== undefined) {
            expect(choiceKeys.has(st.supports), `${evt.id}: supports "${st.supports}" not in choices`).toBe(true);
          }
        }
      });
    }

    const arrays = collectEffectArrays(evt);
    if (!arrays.length) continue;

    for (const [i, effects] of arrays.entries()) {
      it(`${evt.id} effects[${i}] — all op names are known`, () => {
        for (const e of effects) {
          expect(KNOWN_OPS.has(e.op), `${evt.id}: unknown op "${e.op}"`).toBe(true);
        }
      });

      it(`${evt.id} effects[${i}] — adoption.<branch> references are valid`, () => {
        for (const e of effects) {
          if (typeof e.field === 'string' && e.field.startsWith('adoption.')) {
            const branch = e.field.slice(9);
            expect(KNOWN_BRANCHES.has(branch), `${evt.id}: unknown branch "${branch}"`).toBe(true);
          }
          if (e.branches) {
            for (const b of e.branches) {
              expect(KNOWN_BRANCHES.has(b), `${evt.id}: unknown branch in list "${b}"`).toBe(true);
            }
          }
        }
      });

      it(`${evt.id} effects[${i}] — applies cleanly against baseline state`, () => {
        // Fresh state with a handful of representative countries + a target
        // for target-scoped ops.
        const state = mkState({
          seed: 1,
          countries: {
            USA: mkCountry({ id: 'USA', infra: 'service',      baseEmissionsGtCO2: 4.9, politicalWill: 50, adoption: { ...ZERO_ADOPT(), energy: 0.4, transport: 0.4 } }),
            SAU: mkCountry({ id: 'SAU', infra: 'petrostate',   baseEmissionsGtCO2: 0.7, politicalWill: 35 }),
            CHN: mkCountry({ id: 'CHN', infra: 'industrial',   baseEmissionsGtCO2: 11,  politicalWill: 55 }),
            BRA: mkCountry({ id: 'BRA', infra: 'agricultural', baseEmissionsGtCO2: 0.5, politicalWill: 55 }),
            GBR: mkCountry({ id: 'GBR', infra: 'service',      baseEmissionsGtCO2: 0.35, politicalWill: 68 }),
          },
        });
        expect(() => applyEffects(state, effects, { target: state.countries.USA })).not.toThrow();
      });
    }
  }
});
