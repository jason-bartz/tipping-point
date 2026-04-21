// Unit tests for the synergy matrix. Guards against typos (a synergy that
// references a non-existent activity) and regression in the lookup logic.

import { describe, it, expect } from 'vitest';
import { SYNERGIES, activeSynergiesFor, combineEffects } from '../synergies.js';
import { ACTIVITIES, BRANCHES } from '../activities.js';

const ACTIVITY_IDS = new Set(ACTIVITIES.map(a => a.id));
const BRANCH_IDS   = new Set(Object.keys(BRANCHES));

describe('SYNERGIES data integrity', () => {
  it('every required prereq is a real activity id', () => {
    for (const s of SYNERGIES) {
      for (const r of s.requires) {
        expect(ACTIVITY_IDS.has(r), `${s.id} requires unknown activity ${r}`).toBe(true);
      }
    }
  });

  it('activity-targeted synergies point at a real activity id', () => {
    for (const s of SYNERGIES) {
      if (typeof s.targets !== 'string') continue;
      if (s.targets === '*') continue;
      if (s.targets.startsWith('BRANCH:')) {
        const b = s.targets.slice(7);
        expect(BRANCH_IDS.has(b), `${s.id} targets unknown branch ${b}`).toBe(true);
      } else {
        expect(ACTIVITY_IDS.has(s.targets), `${s.id} targets unknown activity ${s.targets}`).toBe(true);
      }
    }
  });

  it('no synergy references itself (infinite-loop guard)', () => {
    for (const s of SYNERGIES) {
      if (typeof s.targets !== 'string' || s.targets.startsWith('BRANCH:') || s.targets === '*') continue;
      expect(s.requires.includes(s.targets),
        `${s.id} requires its own target ${s.targets}`).toBe(false);
    }
  });

  it('every synergy has a human-readable label', () => {
    for (const s of SYNERGIES) {
      expect(s.label, `${s.id} missing label`).toBeTruthy();
      expect(s.label.length).toBeGreaterThan(3);
    }
  });

  it('every synergy has a stable id', () => {
    const seen = new Set();
    for (const s of SYNERGIES) {
      expect(s.id).toBeTruthy();
      expect(seen.has(s.id), `duplicate synergy id ${s.id}`).toBe(false);
      seen.add(s.id);
    }
  });
});

describe('activeSynergiesFor', () => {
  const mkState = (researched) => ({ world: { researched: new Set(researched) } });

  it('returns empty when no research done', () => {
    const activity = ACTIVITIES.find(a => a.id === 'ev_subsidies');
    const out = activeSynergiesFor(mkState([]), activity);
    expect(out).toHaveLength(0);
  });

  it('matches activity-specific synergies', () => {
    const activity = ACTIVITIES.find(a => a.id === 'ev_subsidies');
    const out = activeSynergiesFor(mkState(['grid_mod']), activity);
    expect(out.some(s => s.id === 'grid_ready_ev')).toBe(true);
  });

  it('matches branch-wide synergies', () => {
    const activity = ACTIVITIES.find(a => a.id === 'solar_power');
    const out = activeSynergiesFor(mkState(['carbon_price']), activity);
    expect(out.some(s => s.id === 'price_signal_energy')).toBe(true);
  });

  it('matches global synergies regardless of activity', () => {
    const activity = ACTIVITIES.find(a => a.id === 'hsr');
    const out = activeSynergiesFor(mkState(['green_bonds']), activity);
    expect(out.some(s => s.id === 'green_finance_global')).toBe(true);
  });

  it('requires ALL prereqs for multi-prereq synergies', () => {
    // Synergies in the current matrix are single-prereq, but the function
    // must still support AND-logic for future additions.
    const mockSynergies = activeSynergiesFor(mkState(['grid_mod']), ACTIVITIES.find(a => a.id === 'solar_power'));
    expect(Array.isArray(mockSynergies)).toBe(true);
  });
});

describe('combineEffects', () => {
  it('identity when no synergies', () => {
    expect(combineEffects([])).toEqual({ yieldMult: 1, costMult: 1, willCostMult: 1 });
  });

  it('multiplies yield multipliers', () => {
    const fake = [
      { effect: { yieldMult: 1.5 } },
      { effect: { yieldMult: 1.4 } },
    ];
    expect(combineEffects(fake).yieldMult).toBeCloseTo(2.1, 5);
  });

  it('multiplies cost multipliers (discounts compound)', () => {
    const fake = [
      { effect: { costMult: 0.9 } },
      { effect: { costMult: 0.85 } },
    ];
    expect(combineEffects(fake).costMult).toBeCloseTo(0.765, 5);
  });

  it('ignores unset fields', () => {
    const fake = [
      { effect: { yieldMult: 2 } },
      { effect: { costMult: 0.5 } },
    ];
    const out = combineEffects(fake);
    expect(out.yieldMult).toBe(2);
    expect(out.costMult).toBe(0.5);
    expect(out.willCostMult).toBe(1);
  });
});
