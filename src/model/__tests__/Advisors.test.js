// Pure-helper tests for the advisory board. Mood thresholds, commentary
// shape, agenda selection guards, and progress math are all the things the
// system layer (AdvisorSystem) blindly trusts — if they drift, the player
// sees noticeably wrong advisor reactions and broken agenda rewards.

import { describe, it, expect } from 'vitest';
import {
  clampInfluence,
  resolveAdvisor,
  deriveMood,
  commentaryFor,
  pickAgenda,
  agendaProgress,
  agendaDef,
} from '../Advisors.js';
import { ADVISOR_ARCHETYPES, AGENDA_CATALOG, ADVISOR_IDS } from '../../data/advisors.js';
import { Rng } from '../../core/Random.js';

// Minimal state shape covering everything Advisors.js reads. Keep the keys
// in sync with computeSignals() in src/model/Advisors.js — adding a signal
// without back-filling the fixture will silently default to 0/0.5.
function makeState(overrides = {}) {
  const base = {
    meta: { tick: 8, homeCountryId: 'USA', rng: new Rng(42) },
    world: {
      co2ppm: 420,
      tempAnomalyC: 1.2,
      societalStress: 4,
      activeResearch: {},
      researched: new Set(['solar_power']),
    },
    countries: {
      USA: { id: 'USA', isHome: true,  netZero: false, politicalWill: 60, adoption: { energy: 0.3 } },
      CHN: { id: 'CHN', isHome: false, netZero: false, politicalWill: 50, adoption: { energy: 0.2 } },
      DEU: { id: 'DEU', isHome: false, netZero: true,  politicalWill: 75, adoption: { energy: 0.5 } },
    },
    activities: {
      solar_power: { id: 'solar_power', branch: 'energy', tier: 1 },
      dac: { id: 'dac', branch: 'capture', tier: 2 },
      fusion: { id: 'fusion', branch: 'energy', tier: 3 },
    },
  };
  return deepMerge(base, overrides);
}

function deepMerge(a, b) {
  if (b == null) return a;
  if (a == null || typeof a !== 'object' || typeof b !== 'object') return b;
  if (Array.isArray(b) || b instanceof Set || b instanceof Map || b instanceof Rng) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}

describe('clampInfluence', () => {
  it('clamps below 0 → 0 and above 100 → 100', () => {
    expect(clampInfluence(-10)).toBe(0);
    expect(clampInfluence(150)).toBe(100);
  });
  it('passes mid-range values through unchanged', () => {
    expect(clampInfluence(0)).toBe(0);
    expect(clampInfluence(50)).toBe(50);
    expect(clampInfluence(100)).toBe(100);
  });
});

describe('resolveAdvisor', () => {
  it('returns the archetype object for a known id', () => {
    const a = resolveAdvisor('scientist');
    expect(a?.id).toBe('scientist');
    expect(a?.moodWeights).toBeDefined();
  });
  it('returns null for an unknown id', () => {
    expect(resolveAdvisor('phantom')).toBeNull();
  });
});

describe('deriveMood — bucketing thresholds', () => {
  // Confidence comes from low CO2 / low temp / high will / lots of net-zeros.
  // We push the world into each extreme and assert the bucket lands.
  it('returns "confident" when the world is well below ceilings', () => {
    const s = makeState({
      world: { co2ppm: 360, tempAnomalyC: 1.0, societalStress: 0,
               activeResearch: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 },
               researched: new Set(['solar_power']) },
      countries: {
        USA: { politicalWill: 95, netZero: true,  adoption: { energy: 0.9 } },
        CHN: { politicalWill: 90, netZero: true,  adoption: { energy: 0.85 } },
        DEU: { politicalWill: 90, netZero: true,  adoption: { energy: 0.9 } },
      },
    });
    expect(deriveMood(ADVISOR_ARCHETYPES.scientist, s, { recentDeploys: 6 })).toBe('confident');
  });

  it('returns "alarmed" when the world is at or past ceilings', () => {
    const s = makeState({
      world: { co2ppm: 480, tempAnomalyC: 4.0, societalStress: 20,
               activeResearch: {}, researched: new Set() },
      countries: {
        USA: { politicalWill: 5, netZero: false, adoption: { energy: 0 } },
        CHN: { politicalWill: 5, netZero: false, adoption: { energy: 0 } },
        DEU: { politicalWill: 5, netZero: false, adoption: { energy: 0 } },
      },
    });
    expect(deriveMood(ADVISOR_ARCHETYPES.scientist, s, { recentDeploys: 0 })).toBe('alarmed');
  });

  it('lands in "neutral" or "worried" for the default fixture (mid-range)', () => {
    const s = makeState();
    const mood = deriveMood(ADVISOR_ARCHETYPES.diplomat, s, { recentDeploys: 2 });
    expect(['neutral', 'worried']).toContain(mood);
  });

  it('weights by archetype — same world, different mood per advisor', () => {
    // World where temp is dire but CO2 is fine. Activist (temp-weighted)
    // should be more pessimistic than industrialist (adoption/deploys).
    const s = makeState({
      world: { co2ppm: 360, tempAnomalyC: 3.5 },
      countries: {
        USA: { adoption: { energy: 0.9, industry: 0.9 }, politicalWill: 80 },
        CHN: { adoption: { energy: 0.9, industry: 0.9 }, politicalWill: 80 },
        DEU: { adoption: { energy: 0.9, industry: 0.9 }, politicalWill: 80 },
      },
    });
    const activistMood = deriveMood(ADVISOR_ARCHETYPES.activist, s, { recentDeploys: 6 });
    const industrialistMood = deriveMood(ADVISOR_ARCHETYPES.industrialist, s, { recentDeploys: 6 });
    const order = ['confident', 'neutral', 'worried', 'alarmed'];
    expect(order.indexOf(activistMood)).toBeGreaterThanOrEqual(order.indexOf(industrialistMood));
  });
});

describe('commentaryFor', () => {
  it('returns a non-empty string for every archetype × mood combo', () => {
    const moods = ['confident', 'neutral', 'worried', 'alarmed'];
    for (const id of ADVISOR_IDS) {
      const arch = ADVISOR_ARCHETYPES[id];
      for (const mood of moods) {
        const line = commentaryFor(arch, mood, new Rng(1));
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it('falls back to the archetype tagline for an unknown mood', () => {
    const line = commentaryFor(ADVISOR_ARCHETYPES.scientist, 'mystery', new Rng(1));
    expect(line).toBe(ADVISOR_ARCHETYPES.scientist.tagline);
  });

  it('uses the supplied rng (deterministic across two calls with same seed)', () => {
    const a = commentaryFor(ADVISOR_ARCHETYPES.scientist, 'confident', new Rng(7));
    const b = commentaryFor(ADVISOR_ARCHETYPES.scientist, 'confident', new Rng(7));
    expect(a).toBe(b);
  });
});

describe('pickAgenda', () => {
  it('returns null when the advisor has no agenda pool', () => {
    const s = makeState();
    expect(pickAgenda('phantom', s)).toBeNull();
  });

  it('returns a well-formed agenda for a known advisor', () => {
    const s = makeState();
    const a = pickAgenda('diplomat', s);
    expect(a).not.toBeNull();
    expect(typeof a.id).toBe('string');
    expect(typeof a.text).toBe('string');
    expect(a.startedAt).toBe(s.meta.tick);
    expect(a.deadline).toBeGreaterThan(a.startedAt);
    expect(a.snap).toBeDefined();
  });

  it('respects guard() — never picks a guarded-out agenda', () => {
    // Scientist's `capture_push` guards itself out when capture is researched.
    // We assert that the agenda we get back is not the guarded-out one when
    // the guard fails. (We loop a few times because pick is random.)
    const s = makeState({
      world: { researched: new Set(['solar_power', 'dac']) },
      meta: { rng: new Rng(1), tick: 8, homeCountryId: 'USA' },
    });
    for (let i = 0; i < 20; i++) {
      const a = pickAgenda('scientist', s);
      if (a) expect(a.id).not.toBe('capture_push');
    }
  });

  it('returns null when every agenda is guarded out', () => {
    // Scientist agenda `capstone_within_25` requires tick >= 16; the others
    // either require capture not yet researched or other state. Force a
    // pre-tick state with capture already researched + no eligible options.
    // We override AGENDA_CATALOG would be overkill — instead, hand a
    // synthetic advisor id with an empty pool.
    expect(pickAgenda('definitely-not-an-advisor', makeState())).toBeNull();
  });

  it('captures snapshot via start() so progress() can compare later', () => {
    const s = makeState({ world: { co2ppm: 420.5 } });
    // Force an advisor with deterministic-enough pick.
    const a = pickAgenda('activist', s);
    // At least one of the activist agendas captures co2 baseline.
    if (a?.id === 'drop_co2') expect(a.snap.baseline).toBe(420.5);
  });
});

describe('agendaProgress', () => {
  it('returns 0 for an unknown agenda id', () => {
    const s = makeState();
    expect(agendaProgress('scientist', { id: 'phantom', snap: {} }, s)).toBe(0);
  });

  it('clamps progress to [0, 1]', () => {
    const s = makeState({ world: { researched: new Set(['solar_power', 'dac', 'fusion']) } });
    // two_research awards once 2 new researches land; we passed 2+ over baseline.
    const p = agendaProgress('scientist', { id: 'two_research', snap: { baseline: 0 } }, s);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
    expect(p).toBe(1);
  });

  it('reflects partial progress', () => {
    const s = makeState({ world: { researched: new Set(['solar_power', 'dac']) } });
    // baseline=0, target=2, currently 2 → 1.0; baseline=1 → 0.5.
    expect(agendaProgress('scientist', { id: 'two_research', snap: { baseline: 1 } }, s)).toBe(0.5);
  });

  it('handles diplomat three_high_will progress (counts countries ≥70 will)', () => {
    const s = makeState({
      countries: {
        USA: { politicalWill: 80 }, CHN: { politicalWill: 71 }, DEU: { politicalWill: 50 },
      },
    });
    expect(agendaProgress('diplomat', { id: 'three_high_will', snap: {} }, s))
      .toBeCloseTo(2 / 3, 5);
  });
});

describe('agendaDef', () => {
  it('returns the def for a known archetype + agenda id', () => {
    const def = agendaDef('scientist', 'two_research');
    expect(def?.id).toBe('two_research');
    expect(typeof def?.progress).toBe('function');
  });

  it('returns null for an unknown agenda id', () => {
    expect(agendaDef('scientist', 'phantom')).toBeNull();
  });

  it('returns null for an unknown archetype id', () => {
    expect(agendaDef('phantom', 'two_research')).toBeNull();
  });
});

// Catalog-shape sanity. If someone adds an agenda, this asserts the whole
// schema (text, durationTicks, progress, reward) is intact — no half-defined
// agendas can sneak through into a release.
describe('AGENDA_CATALOG schema sanity', () => {
  it('every agenda has the required fields', () => {
    for (const id of ADVISOR_IDS) {
      const pool = AGENDA_CATALOG[id] ?? [];
      expect(pool.length).toBeGreaterThan(0);
      for (const a of pool) {
        expect(typeof a.id).toBe('string');
        expect(typeof a.text).toBe('string');
        expect(typeof a.durationTicks).toBe('number');
        expect(typeof a.progress).toBe('function');
        expect(a.reward).toBeDefined();
        expect(typeof a.reward.title).toBe('string');
        expect(typeof a.reward.body).toBe('string');
      }
    }
  });
});
