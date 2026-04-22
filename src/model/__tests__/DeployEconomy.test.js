// Unit tests for the deploy projection pipeline. These run in CI on every
// balance change — if they fail, players are about to feel a cliff.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  projectDeploy,
  recordDeploy,
  deployCountFor,
  diminishingMultiplier,
  escalationMultiplier,
  pairCapReached,
} from '../DeployEconomy.js';
import { BALANCE } from '../../config/balance.js';

// Minimal state fixture — just what DeployEconomy touches.
function makeState({ researched = [], deployCount = {}, mod = {} } = {}) {
  return {
    meta: { mod: { deployMult: 1, ...mod } },
    world: {
      researched: new Set(researched),
      deployCount,
    },
  };
}
const BASE_COUNTRY = { id: 'TST', isHome: false, infra: 'service', politicalWill: 60 };
const BASE_ACTIVITY = {
  id: 'solar_power',
  branch: 'energy',
  deployCost: 4,
  deployAdoption: 0.15,
};

describe('diminishingMultiplier', () => {
  it('returns 1 for the first deploy', () => {
    expect(diminishingMultiplier(0)).toBe(1);
  });

  it('compounds geometrically', () => {
    const base = BALANCE.deployDiminishingBase;
    expect(diminishingMultiplier(1)).toBeCloseTo(base, 5);
    expect(diminishingMultiplier(3)).toBeCloseTo(base ** 3, 5);
  });

  it('floors at the configured minimum', () => {
    expect(diminishingMultiplier(100)).toBe(BALANCE.deployDiminishingFloor);
  });
});

describe('projectDeploy — diminishing returns', () => {
  let state, country, activity;
  beforeEach(() => {
    state = makeState();
    country = { ...BASE_COUNTRY };
    activity = { ...BASE_ACTIVITY };
  });

  it('full yield on first deploy', () => {
    const p = projectDeploy(state, country, activity);
    expect(p.effectiveYield).toBeCloseTo(0.15, 5);
    expect(p.prevDeploys).toBe(0);
    expect(p.yieldBreakdown).toHaveLength(0);
  });

  it('drops yield after repeated deploys', () => {
    state.world.deployCount = { TST: { solar_power: 2 } };
    const p = projectDeploy(state, country, activity);
    expect(p.effectiveYield).toBeCloseTo(0.15 * (BALANCE.deployDiminishingBase ** 2), 5);
    expect(p.prevDeploys).toBe(2);
    expect(p.yieldBreakdown.some(b => b.id === 'diminishing')).toBe(true);
  });

  it('floors at the configured minimum after many deploys', () => {
    state.world.deployCount = { TST: { solar_power: 50 } };
    const p = projectDeploy(state, country, activity);
    expect(p.effectiveYield).toBeCloseTo(0.15 * BALANCE.deployDiminishingFloor, 5);
  });
});

describe('projectDeploy — synergies', () => {
  it('applies a targeted synergy when its prereqs are researched', () => {
    const state = makeState({ researched: ['grid_mod'] });
    const evSub = { id: 'ev_subsidies', branch: 'transport', deployCost: 2, deployAdoption: 0.15 };
    const p = projectDeploy(state, BASE_COUNTRY, evSub);
    expect(p.synergies.some(s => s.id === 'grid_ready_ev')).toBe(true);
    // grid_ready_ev has yieldMult 1.5 → 0.15 × 1.5 = 0.225
    expect(p.effectiveYield).toBeCloseTo(0.225, 5);
  });

  it('ignores synergies when prereqs are missing', () => {
    const state = makeState({ researched: [] });
    const evSub = { id: 'ev_subsidies', branch: 'transport', deployCost: 2, deployAdoption: 0.15 };
    const p = projectDeploy(state, BASE_COUNTRY, evSub);
    expect(p.synergies.filter(s => s.id === 'grid_ready_ev')).toHaveLength(0);
    expect(p.effectiveYield).toBeCloseTo(0.15, 5);
  });

  it('branch-wide synergy fires for every activity in that branch', () => {
    const state = makeState({ researched: ['carbon_price'] });
    const solar = { id: 'solar_power', branch: 'energy', deployCost: 4, deployAdoption: 0.15 };
    const p = projectDeploy(state, BASE_COUNTRY, solar);
    expect(p.synergies.some(s => s.id === 'price_signal_energy')).toBe(true);
  });

  it('stacks multiple synergies multiplicatively', () => {
    const state = makeState({ researched: ['ffsc', 'green_bonds'] });
    const solar = { id: 'solar_power', branch: 'energy', deployCost: 4, deployAdoption: 0.15 };
    const p = projectDeploy(state, BASE_COUNTRY, solar);
    // subsidy_cut_solar yieldMult 1.4; green_finance_global costMult 0.9
    expect(p.effectiveYield).toBeCloseTo(0.15 * 1.4, 5);
    expect(p.effectiveCost).toBe(Math.round(4 * 0.9)); // 4 × 0.9 = 3.6 → 4
  });

  it('diminishing × synergies compound correctly', () => {
    const state = makeState({
      researched: ['grid_mod'],
      deployCount: { TST: { ev_subsidies: 2 } },
    });
    const evSub = { id: 'ev_subsidies', branch: 'transport', deployCost: 2, deployAdoption: 0.15 };
    const p = projectDeploy(state, BASE_COUNTRY, evSub);
    const expectedBase = 0.15 * (BALANCE.deployDiminishingBase ** 2) * 1.5;
    expect(p.effectiveYield).toBeCloseTo(expectedBase, 5);
  });
});

describe('escalationMultiplier', () => {
  it('is 1 on the first deploy', () => {
    expect(escalationMultiplier(0)).toBe(1);
  });

  it('compounds geometrically with deployCostEscalation', () => {
    const e = BALANCE.deployCostEscalation;
    expect(escalationMultiplier(1)).toBeCloseTo(e, 5);
    expect(escalationMultiplier(2)).toBeCloseTo(e * e, 5);
  });
});

describe('projectDeploy — cost escalation + pair cap', () => {
  const makeCountry = () => ({ id: 'TST', isHome: false, infra: 'service', politicalWill: 60 });
  const makeActivity = () => ({ id: 'solar_power', branch: 'energy', deployCost: 4, deployAdoption: 0.15 });

  it('first deploy pays base cost; repeat deploys pay escalated cost', () => {
    const state = makeState();
    const first = projectDeploy(state, makeCountry(), makeActivity());
    expect(first.effectiveCost).toBe(4);
    expect(first.escalationMult).toBe(1);

    state.world.deployCount = { TST: { solar_power: 1 } };
    const second = projectDeploy(state, makeCountry(), makeActivity());
    expect(second.effectiveCost).toBe(Math.round(4 * BALANCE.deployCostEscalation));
    expect(second.escalationMult).toBeCloseTo(BALANCE.deployCostEscalation, 5);
  });

  it('projection flags capReached once the pair maxes out', () => {
    const state = makeState({ deployCount: { TST: { solar_power: BALANCE.deployMaxPerPair } } });
    const p = projectDeploy(state, makeCountry(), makeActivity());
    expect(p.capReached).toBe(true);
    expect(p.maxPerPair).toBe(BALANCE.deployMaxPerPair);
  });

  it('costBreakdown labels the escalation multiplier', () => {
    const state = makeState({ deployCount: { TST: { solar_power: 2 } } });
    const p = projectDeploy(state, makeCountry(), makeActivity());
    expect(p.costBreakdown.some(b => b.id === 'escalation')).toBe(true);
  });
});

describe('pairCapReached', () => {
  it('is false below the cap', () => {
    const state = makeState({ deployCount: { TST: { solar_power: 1 } } });
    expect(pairCapReached(state, 'TST', 'solar_power')).toBe(false);
  });

  it('is true at the cap', () => {
    const state = makeState({ deployCount: { TST: { solar_power: BALANCE.deployMaxPerPair } } });
    expect(pairCapReached(state, 'TST', 'solar_power')).toBe(true);
  });
});

describe('recordDeploy / deployCountFor', () => {
  it('increments the counter for a fresh pair', () => {
    const state = makeState();
    recordDeploy(state, 'USA', 'solar_power');
    expect(deployCountFor(state, 'USA', 'solar_power')).toBe(1);
  });

  it('keeps counters isolated per country and per activity', () => {
    const state = makeState();
    recordDeploy(state, 'USA', 'solar_power');
    recordDeploy(state, 'USA', 'wind_power');
    recordDeploy(state, 'CHN', 'solar_power');
    expect(deployCountFor(state, 'USA', 'solar_power')).toBe(1);
    expect(deployCountFor(state, 'USA', 'wind_power')).toBe(1);
    expect(deployCountFor(state, 'CHN', 'solar_power')).toBe(1);
    expect(deployCountFor(state, 'CHN', 'wind_power')).toBe(0);
  });
});
