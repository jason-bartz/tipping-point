// Sporadic wildfires. Outside of the wildfire-season event beats
// (`wildfire`, `wildfire_local`, `wildfire_smog`) the world is suspiciously
// quiet — nothing burns unless the director picked one of those events. This
// system rolls a small dice each tick and, on a hit, lights a single
// random country on fire: visible map FX (via WildfireFx) plus a tiny
// unavoidable drain on climate credits to model the emergency response
// coming out of the green budget.
//
// Pacing is gated three ways: a startup grace, a min-gap between sporadic
// fires, and a cooldown after any wildfire-season event so we never stack on
// top of an event that's already painting flames across the map.
//
// Importantly, sporadic fires use a distinct event id (`wildfire_sporadic`)
// so ForestrySystem — which only charges government liability for the three
// season ids — leaves the sitting incumbent alone here. The intent is "a
// background tax on the world warming up", not "your government just fell".

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';

const SEASON_WILDFIRE_IDS = new Set(['wildfire', 'wildfire_local', 'wildfire_smog', 'wildfire_disaster']);

const HEADLINES = [
  (c) => `Out-of-season wildfires scorch ${c.name}. Emergency budget tapped.`,
  (c) => `Brush fires erupt across ${c.name}. Climate fund diverted to relief.`,
  (c) => `Unseasonal wildfires sweep ${c.name}. Response funds redirected.`,
  (c) => `${c.name} battles a surprise wildfire. Cleanup drains the green budget.`,
  (c) => `Dry-lightning ignition near ${c.name} grows fast. Crews scramble; budget bleeds.`,
];

export class SporadicWildfireSystem {
  constructor(state, bus) {
    this.s = state;
    this.b = bus;
    this._lastSeasonTick   = -999;
    this._lastSporadicTick = -999;
    this._unsubs = [
      bus.on(EVT.TICK,        () => this._onTick()),
      bus.on(EVT.EVENT_FIRED, (p) => this._onEventFired(p)),
    ];
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this._unsubs = [];
  }

  _onEventFired(p) {
    const id = p?.event?.id;
    if (id && SEASON_WILDFIRE_IDS.has(id)) {
      this._lastSeasonTick = this.s.meta.tick;
    }
  }

  _onTick() {
    const cfg = BALANCE.sporadicWildfire;
    if (!cfg?.enabled) return;

    const s    = this.s;
    const tick = s.meta.tick;
    if (tick < (cfg.startupGraceTicks   ?? 0)) return;
    if (tick - this._lastSporadicTick < (cfg.minGapTicks         ?? 0)) return;
    if (tick - this._lastSeasonTick   < (cfg.seasonCooldownTicks ?? 0)) return;

    if (s.meta.rng.random() > (cfg.chancePerTick ?? 0)) return;

    const target = this._pickCountry();
    if (!target) return;

    const drain = cfg.creditDrain ?? 1;
    s.world.climatePoints = Math.max(0, (s.world.climatePoints ?? 0) - drain);
    this._lastSporadicTick = tick;

    const headline = s.meta.rng.pick(HEADLINES)(target);
    // Emit through the standard event channel so WildfireFx paints sprites,
    // NewsSystem pushes the headline, and main.js logs the dispatch — all
    // without bespoke wiring.
    this.b.emit(EVT.EVENT_FIRED, {
      event: {
        id: 'wildfire_sporadic',
        title: 'Wildfires',
        _ctx: { target },
      },
      headline,
      tone: 'bad',
    });
  }

  // Pick one country to burn. Bias toward those with healthy forests (more
  // fuel, more believable) and slightly toward bigger emitters (more land
  // mass / readability). Falls back to all countries if nobody has forests
  // left worth lighting.
  _pickCountry() {
    const all  = Object.values(this.s.countries);
    const pool = all.filter(c => (c.forestHealth ?? 0) > 0.10);
    const source = pool.length ? pool : all;
    return this.s.meta.rng.weightedPick(source, (c) => {
      const forest = (c.forestHealth ?? 0) + 0.1;
      return forest * (1 + Math.min(2, (c.baseEmissionsGtCO2 ?? 0) * 0.3));
    });
  }
}
