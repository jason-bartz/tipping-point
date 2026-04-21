// Unit tests for the scoring model.

import { describe, it, expect } from 'vitest';
import {
  netZeroPct,
  co2PeakPassed,
  evaluateOutcome,
  grade,
  worldAvgAdoption,
  worldAvgWill,
} from '../Scoring.js';
import { BALANCE } from '../../config/balance.js';

const ZERO_ADOPT = { energy: 0, transport: 0, industry: 0, land: 0, capture: 0, policy: 0 };

function mkState({ world = {}, countries = {} } = {}) {
  return {
    world: {
      co2ppm: 420,
      peakCO2ppm: 420,
      tempAnomalyC: 1.2,
      ...world,
    },
    countries,
  };
}

describe('netZeroPct', () => {
  it('returns 0 for empty state', () => {
    expect(netZeroPct({ countries: {} })).toBe(0);
  });

  it('returns the fraction of net-zero countries', () => {
    const s = mkState({ countries: { A: { netZero: true }, B: { netZero: false }, C: { netZero: true }, D: { netZero: false } } });
    expect(netZeroPct(s)).toBe(0.5);
  });
});

describe('co2PeakPassed', () => {
  it('false before peak drop threshold is crossed', () => {
    expect(co2PeakPassed({ peakCO2ppm: 430, co2ppm: 428 })).toBe(false);
  });

  it('true once drop from peak exceeds threshold', () => {
    expect(co2PeakPassed({ peakCO2ppm: 430, co2ppm: 430 - BALANCE.reversalCO2DropPpm - 1 })).toBe(true);
  });
});

describe('evaluateOutcome', () => {
  it('returns null while running', () => {
    expect(evaluateOutcome(mkState(), 1.2)).toBeNull();
  });

  it('loses at or above lossTempC', () => {
    const s = mkState({ world: { tempAnomalyC: BALANCE.lossTempC } });
    const o = evaluateOutcome(s, BALANCE.lossTempC);
    expect(o.status).toBe('lost');
  });

  it('standard win when CO₂ past peak, below cap, and enough net zeros', () => {
    const s = mkState({
      world: {
        co2ppm: BALANCE.winCO2ppm - 1,
        peakCO2ppm: BALANCE.winCO2ppm + BALANCE.reversalCO2DropPpm,
        tempAnomalyC: 1.9,
      },
      countries: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`C${i}`, { netZero: i < 7 }])
      ),
    });
    const o = evaluateOutcome(s, BALANCE.winTempCeilingC - 0.1);
    expect(o?.status).toBe('won');
    expect(o?.perfect).toBe(false);
  });

  it('perfect win when all perfect thresholds met', () => {
    const s = mkState({
      world: {
        co2ppm: BALANCE.perfectWinCO2ppm - 1,
        peakCO2ppm: BALANCE.perfectWinCO2ppm + 20,
        tempAnomalyC: 1.5,
      },
      countries: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`C${i}`, { netZero: i < 9 }])
      ),
    });
    const o = evaluateOutcome(s, BALANCE.perfectWinTempC - 0.1);
    expect(o?.status).toBe('won');
    expect(o?.perfect).toBe(true);
  });
});

describe('grade', () => {
  it('S for perfect win', () => {
    expect(grade(mkState({ world: { co2ppm: 340 } }), 1.4, true)).toBe('S');
  });

  it('A-D scales with temperature and CO₂', () => {
    expect(grade(mkState({ world: { co2ppm: 370 } }), 1.6, false)).toBe('A');
    expect(grade(mkState({ world: { co2ppm: 390 } }), 1.8, false)).toBe('B');
    expect(grade(mkState({ world: { co2ppm: 410 } }), 2.2, false)).toBe('C');
    expect(grade(mkState({ world: { co2ppm: 460 } }), 3.0, false)).toBe('D');
  });
});

describe('world averages', () => {
  it('worldAvgAdoption handles empty state', () => {
    expect(worldAvgAdoption({ countries: {} })).toBe(0);
  });

  it('worldAvgAdoption averages across countries and branches', () => {
    const state = { countries: {
      A: { adoption: { ...ZERO_ADOPT, energy: 0.6 } },
      B: { adoption: { ...ZERO_ADOPT, energy: 0.6, transport: 0.6 } },
    }};
    // A avg = 0.6/6 = 0.1; B avg = 1.2/6 = 0.2; mean = 0.15
    expect(worldAvgAdoption(state)).toBeCloseTo(0.15, 6);
  });

  it('worldAvgWill averages across countries', () => {
    const state = { countries: { A: { politicalWill: 40 }, B: { politicalWill: 60 } } };
    expect(worldAvgWill(state)).toBe(50);
  });
});
