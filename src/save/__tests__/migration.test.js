// Save-schema migration test. We keep one fixture per "era" of shipped saves
// and assert each one still deserializes to a usable state after the
// back-fill logic in saveLoad.deserialize() runs.
//
// When we bump SCHEMA in the future, we'll add a pre-bump fixture here and a
// matching migration step in deserialize(). The test guarantees neither the
// fixture nor the migration can silently drift.

import { describe, it, expect } from 'vitest';
import { deserialize, serialize } from '../saveLoad.js';
import { COUNTRIES } from '../../data/countries.js';

// Load the JSON fixture from disk rather than using an `import ... with
// { type: 'json' }` attribute — keeps both ESLint's parser and vitest happy
// under bun without needing a separate parser plugin.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const preV4 = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/save-v1-pre-population.json', import.meta.url)),
  'utf8',
));

describe('save schema v1 — backfill for pre-population saves', () => {
  it('deserializes without error', () => {
    const result = deserialize(structuredClone(preV4));
    expect(result).not.toBeNull();
  });

  it('reconstructs the Set of researched activities', () => {
    const s = deserialize(structuredClone(preV4));
    expect(s.world.researched).toBeInstanceOf(Set);
    expect(s.world.researched.has('solar_power')).toBe(true);
    expect(s.world.researched.has('grid_mod')).toBe(true);
    expect(s.world.researched.size).toBe(4);
  });

  it('reseeds the RNG so randomness still works', () => {
    const s = deserialize(structuredClone(preV4));
    expect(typeof s.meta.rng.random).toBe('function');
    // Two successive draws should not be identical (mulberry32 is not broken).
    const a = s.meta.rng.random(); const b = s.meta.rng.random();
    expect(a).not.toBe(b);
  });

  it('drops activeEvents / collectables on load (safe default)', () => {
    const s = deserialize(structuredClone(preV4));
    expect(s.activeEvents).toEqual([]);
    expect(s.collectables).toEqual([]);
  });

  it('back-fills deployCount on legacy saves', () => {
    const s = deserialize(structuredClone(preV4));
    expect(s.world.deployCount).toEqual({});
  });

  it('back-fills populationHistory so the ticker sparkline works post-resume', () => {
    const s = deserialize(structuredClone(preV4));
    expect(Array.isArray(s.world.populationHistory)).toBe(true);
    expect(s.world.populationHistory.length).toBeGreaterThan(0);
  });

  it('back-fills per-country populationM from data/countries.js', () => {
    const s = deserialize(structuredClone(preV4));
    const byId = new Map(COUNTRIES.map(c => [c.id, c]));
    expect(s.countries.USA.populationM).toBe(byId.get('USA').populationM);
    expect(s.countries.CHN.populationM).toBe(byId.get('CHN').populationM);
    expect(s.countries.BRA.populationM).toBe(byId.get('BRA').populationM);
  });

  it('back-fills populationDeltaM to 0 (first tick re-computes)', () => {
    const s = deserialize(structuredClone(preV4));
    for (const c of Object.values(s.countries)) {
      expect(c.populationDeltaM).toBe(0);
    }
  });

  it('back-fills baseGrowthPerYear + climateVulnerability from country data', () => {
    const s = deserialize(structuredClone(preV4));
    for (const c of Object.values(s.countries)) {
      expect(typeof c.baseGrowthPerYear).toBe('number');
      expect(typeof c.climateVulnerability).toBe('number');
    }
  });

  it('rejects a blob with a future schema (forward-compat safety)', () => {
    const future = { ...preV4, schema: 99 };
    expect(deserialize(future)).toBeNull();
  });

  it('round-trips: serialize(deserialize(fixture)) matches key invariants', () => {
    const loaded = deserialize(structuredClone(preV4));
    const blob = serialize(loaded);
    expect(blob.schema).toBe(1);
    expect(blob.state.world.co2ppm).toBeCloseTo(preV4.state.world.co2ppm, 5);
    // researched set → array again in serialization.
    expect(Array.isArray(blob.state.world.researched)).toBe(true);
    expect(blob.state.world.researched).toContain('solar_power');
  });
});
