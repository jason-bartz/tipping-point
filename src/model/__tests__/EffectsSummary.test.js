// Unit tests for the human-readable effects receipt. The generator is what
// the player sees as a toast and in the end-screen block right after picking
// a choice, so these tests are the guardrail against a choice silently
// rendering as an empty string.

import { describe, it, expect } from 'vitest';
import { summarizeEffects } from '../EffectsSummary.js';
import { EVENT_POOL } from '../../data/events.js';

const dummyCountries = {
  USA: { id: 'USA', infra: 'service' },
  SAU: { id: 'SAU', infra: 'petrostate' },
  IRQ: { id: 'IRQ', infra: 'petrostate' },
  CHN: { id: 'CHN', infra: 'industrial' },
};

describe('summarizeEffects — op coverage', () => {
  it('empty or missing effects → empty string', () => {
    expect(summarizeEffects([])).toBe('');
    expect(summarizeEffects(undefined)).toBe('');
  });

  it('addWorld — climatePoints, co2ppm, tempAnomalyC, stress', () => {
    expect(summarizeEffects([{ op: 'addWorld', field: 'climatePoints', value: 25 }]))
      .toBe('+25 Credits');
    expect(summarizeEffects([{ op: 'addWorld', field: 'co2ppm', value: -0.6 }]))
      .toBe('-0.6 ppm CO₂');
    expect(summarizeEffects([{ op: 'addWorld', field: 'tempAnomalyC', value: 0.12 }]))
      .toBe('+0.12°C');
    expect(summarizeEffects([{ op: 'addWorld', field: 'societalStress', value: 10 }]))
      .toBe('+10 Stress');
  });

  it('addAllCountries — will + adoption', () => {
    expect(summarizeEffects([{ op: 'addAllCountries', field: 'politicalWill', value: -4 }]))
      .toBe('-4 Will worldwide');
    expect(summarizeEffects([{ op: 'addAllCountries', field: 'adoption.land', value: 0.04 }]))
      .toBe('+4% Land worldwide');
  });

  it('addCountries — scope reads naturally with country counts', () => {
    const out = summarizeEffects(
      [{ op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -4 }],
      {},
      dummyCountries,
    );
    expect(out).toBe('-4 Will in 2 petrostates');
  });

  it('addCountries — agricultural reads with "countries" suffix', () => {
    const out = summarizeEffects(
      [{ op: 'addCountries', where: { infra: 'agricultural' }, field: 'politicalWill', value: -6 }],
      {},
      { A: { infra: 'agricultural' }, B: { infra: 'agricultural' } },
    );
    expect(out).toBe('-6 Will in 2 agricultural countries');
  });

  it('addCountries — array infra reads as list', () => {
    const out = summarizeEffects(
      [{ op: 'addCountries', where: { infra: ['service', 'industrial'] }, field: 'adoption.industry', value: 0.05 }],
      {},
      dummyCountries,
    );
    expect(out).toBe('+5% Industry in service/industrial countries');
  });

  it('addTarget — uses ctx.target.name', () => {
    const ctx = { target: { id: 'BRA', name: 'Brazil' } };
    expect(summarizeEffects([{ op: 'addTarget', field: 'politicalWill', value: 8 }], ctx))
      .toBe('+8 Will in Brazil');
    expect(summarizeEffects([{ op: 'addTarget', field: 'adoption.energy', value: 0.1 }], ctx))
      .toBe('+10% Energy in Brazil');
  });

  it('addTargetAllBranches + addTargetRandomBranch', () => {
    const ctx = { target: { name: 'India' } };
    expect(summarizeEffects([{ op: 'addTargetAllBranches', value: -0.15 }], ctx))
      .toBe('-15% every branch in India');
    expect(summarizeEffects([{ op: 'addTargetRandomBranch', value: 0.03 }], ctx))
      .toBe('+3% one branch in India');
  });

  it('addRandomBranches — describes N random countries', () => {
    expect(summarizeEffects([{ op: 'addRandomBranches', count: 3, value: 0.04 }]))
      .toBe('+4% a random branch in 3 countries');
  });

  it('chains multiple ops with " · "', () => {
    const out = summarizeEffects([
      { op: 'addWorld', field: 'climatePoints', value: 25 },
      { op: 'addAllCountries', field: 'politicalWill', value: -4 },
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.03 },
    ]);
    expect(out).toBe('+25 Credits · -4 Will worldwide · +3% Energy worldwide');
  });
});

describe('summarizeEffects — pool integrity', () => {
  it('every interactive choice produces a non-empty receipt', () => {
    const dummyCtx = { target: { id: 'BRA', name: 'Brazil' } };
    for (const evt of EVENT_POOL.filter(e => e.interactive)) {
      for (const c of evt.choices) {
        const receipt = c.summaryOverride || summarizeEffects(c.effects, dummyCtx, dummyCountries);
        expect(receipt.length, `${evt.id}:${c.key} produced an empty receipt`).toBeGreaterThan(0);
      }
    }
  });
});
