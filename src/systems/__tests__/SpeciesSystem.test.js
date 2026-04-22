// Unit tests for SpeciesSystem. We drive state forward manually (setting
// tempAnomalyC + tick, then calling system.tick()) so the tests are
// deterministic and don't depend on CarbonSystem's lagged warming. The
// RNG is seeded at state creation, so rolls are reproducible across runs.

import { describe, it, expect, beforeEach } from 'vitest';
import { SpeciesSystem, biodiversitySummary, ensureBiodiversity } from '../SpeciesSystem.js';
import { EventBus, EVT } from '../../core/EventBus.js';
import { createState } from '../../core/GameState.js';
import { SPECIES_BY_ID, STATUS_ORDER } from '../../data/species.js';
import { BALANCE } from '../../config/balance.js';

let state;
let bus;
let sys;
let events;

beforeEach(() => {
  state = createState('USA', { seed: 42 });
  bus = new EventBus();
  events = [];
  bus.on(EVT.SPECIES_STATUS_CHANGED, (p) => events.push(p));
  sys = new SpeciesSystem(state, bus);
});

// Skip past the startup grace window in one go.
function warmUp() {
  state.meta.tick = BALANCE.eventStartupGraceTicks + 1;
}

function runYears(years, temp) {
  state.world.tempAnomalyC = temp;
  for (let i = 0; i < years * BALANCE.ticksPerYear; i++) {
    state.meta.tick++;
    sys.tick();
  }
}

describe('SpeciesSystem — baseline integrity', () => {
  it('initializes all species at their real-world IUCN baseline', () => {
    const bio = state.biodiversity;
    expect(bio.species.length).toBeGreaterThan(30);
    const vaquita = bio.species.find(r => r.id === 'vaquita');
    expect(vaquita.status).toBe('CR');
    const goldenToad = bio.species.find(r => r.id === 'golden_toad');
    expect(goldenToad.status).toBe('EX');
    const saguaro = bio.species.find(r => r.id === 'saguaro');
    expect(saguaro.status).toBe('LC');
  });

  it('emits no species events during startup grace', () => {
    for (let t = 0; t < BALANCE.eventStartupGraceTicks; t++) {
      state.meta.tick = t;
      state.world.tempAnomalyC = 3.5;    // extreme heat
      sys.tick();
    }
    // Only drained emits count as ticker-publishable changes. Queue is empty
    // because scans haven't run yet.
    const drained = events.filter(e => e.drained);
    expect(drained.length).toBe(0);
  });

  it('ensureBiodiversity is idempotent', () => {
    const bio1 = ensureBiodiversity(state);
    const bio2 = ensureBiodiversity(state);
    expect(bio1).toBe(bio2);
  });
});

describe('SpeciesSystem — decline under warming', () => {
  it('declines species when temp climbs well above the anchor', () => {
    warmUp();
    // Park at a punishing +3.5°C for 30 years. With 45+ species and 12%
    // base decline per pressure-unit, at least some CR species should step
    // to EW/EX in this window — this is the grim expectation.
    runYears(30, 3.5);

    const drained = events.filter(e => e.drained);
    expect(drained.length).toBeGreaterThan(0);

    const summary = biodiversitySummary(state);
    expect(summary.extinct).toBeGreaterThan(0);
  });

  it('does not decline at or below the starting anchor', () => {
    warmUp();
    // Hold exactly at the starting baseline for 20 years — no pressure,
    // no decline rolls should land.
    runYears(20, BALANCE.startingTempAnomalyC);

    const drained = events.filter(e => e.drained && e.kind === 'decline');
    expect(drained.length).toBe(0);
  });

  it('respects the drip-feed queue (one drained emit per tick max)', () => {
    warmUp();
    // Wide pressure spike, but we only tick once — queue should buffer
    // multiple changes, yet at most one drained emit fires per tick.
    state.world.tempAnomalyC = 3.8;
    state.meta.tick += BALANCE.ticksPerYear; // force a scan
    sys.tick();
    const drainedImmediate = events.filter(e => e.drained).length;
    expect(drainedImmediate).toBeLessThanOrEqual(1);
  });
});

describe('SpeciesSystem — recovery under cooling', () => {
  it('uplists a declined species when temp drops well below its anchor', () => {
    warmUp();
    // Start a CR species on a hot anchor.
    const rec = state.biodiversity.species.find(r => r.id === 'mountain_gorilla');
    rec.status = 'CR';
    rec.tempAnchor = 2.5;
    state.biodiversity.peakTemp = 2.5;

    // Now cool to 1.0°C — relief of 1.5°C. Over 40 years, recovery should
    // land at least one rung at 0.04/year × 1.5 relief × 0.7 sensitivity.
    runYears(40, 1.0);

    const recovered = events.filter(e => e.kind === 'recovery' && e.def?.id === 'mountain_gorilla');
    expect(recovered.length).toBeGreaterThan(0);
    // Status should be better than CR now (lower index in STATUS_ORDER).
    expect(STATUS_ORDER.indexOf(rec.status)).toBeLessThan(STATUS_ORDER.indexOf('CR'));
  });
});

describe('SpeciesSystem — rediscovery', () => {
  it('can rediscover a flagged species after cooling, never otherwise', () => {
    warmUp();

    // Force the golden toad (starts EX, rediscoverable:true) into a
    // scenario where peakTemp is high and current temp is cool.
    state.biodiversity.peakTemp = 3.0;
    state.biodiversity.lastRediscoveryTick = -999;

    let rediscoveries = [];
    bus.on(EVT.SPECIES_REDISCOVERED, (p) => rediscoveries.push(p));

    // Run for 100 years at cool temp so the rng has many tries against
    // the 0.03/year base. Should eventually land.
    runYears(100, 0.8);

    // Golden toad is the most likely rediscovery target (starts EX), but
    // any flagged Lazarus taxon counts. At least one should fire.
    expect(rediscoveries.length).toBeGreaterThan(0);
  });

  it('never rediscovers a non-rediscoverable species', () => {
    warmUp();
    // Force the vaquita extinct, peak temp up, then cool for a century.
    const vaquita = state.biodiversity.species.find(r => r.id === 'vaquita');
    vaquita.status = 'EX';
    vaquita.tempAnchor = 3.0;
    state.biodiversity.peakTemp = 3.0;

    expect(SPECIES_BY_ID.vaquita.rediscoverable).toBe(false);

    runYears(100, 0.8);
    expect(vaquita.status).toBe('EX');  // stays extinct forever
  });
});

describe('SpeciesSystem — dispatches + summary', () => {
  it('logs a dispatch when a species goes extinct', () => {
    warmUp();
    // Pressure one species the cheap way: prime it one rung below EX and
    // hammer temp until the rng rolls it over.
    const rec = state.biodiversity.species.find(r => r.id === 'vaquita');
    rec.status = 'EW';
    rec.tempAnchor = 1.2;

    // Drive for up to 50 years at crushing temp.
    for (let y = 0; y < 50 && rec.status !== 'EX'; y++) {
      state.world.tempAnomalyC = 3.8;
      for (let t = 0; t < BALANCE.ticksPerYear; t++) {
        state.meta.tick++;
        sys.tick();
      }
    }

    expect(rec.status).toBe('EX');
    const extinctDispatches = (state.meta.dispatches || []).filter(
      d => d.category === 'species' && d.title.toLowerCase().includes('extinct'),
    );
    expect(extinctDispatches.length).toBeGreaterThan(0);
  });

  it('biodiversitySummary returns healthy/threatened/extinct counts', () => {
    const summary = biodiversitySummary(state);
    expect(summary.total).toBe(state.biodiversity.species.length);
    expect(summary.healthy + summary.threatened + summary.extinct).toBe(summary.total);
  });
});
