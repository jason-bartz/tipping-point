// Single source of truth for a game in flight. UI reads; systems write.
//
// Everything serializable lives here. Things that don't serialize (RNG
// instance, event handlers, DOM nodes) live on separate objects. When we
// save, we call toJSON(state); when we load, we call fromJSON(json) and
// rebuild transient dependencies from scratch.

import { BALANCE } from '../config/balance.js';
import { COUNTRIES, COUNTRY_IDS, FOREST_BASELINE } from '../data/countries.js';
import { ACTIVITIES } from '../data/activities.js';
import { COUNTRY_PROFILES, DEFAULT_MOD, startingAdoption } from '../data/profiles.js';
import { ADVISOR_IDS } from '../data/advisors.js';
import { resolveAdvisor } from '../model/Advisors.js';
import { createGovernment } from '../model/Government.js';
import { SPECIES } from '../data/species.js';
import { Rng, makeSeed } from './Random.js';

// Build a normalized, symmetric adjacency table once per game. Neighbor
// declarations in `countries.js` may be asymmetric (e.g. CHN lists RUS but
// not THA, while THA lists CHN); the spread system wants both directions, so
// we fix it here. Phantom IDs (e.g. a hand-edited save that references a
// country we no longer ship) are dropped with a warning rather than silently
// skipped downstream.
function symmetrizeAdjacency(countries) {
  const adj = new Map();
  for (const c of countries) adj.set(c.id, new Set());
  for (const c of countries) {
    for (const nId of c.neighbors || []) {
      if (!COUNTRY_IDS.has(nId)) {
        console.warn(`[countries] phantom neighbor ${c.id} → ${nId} (dropped)`);
        continue;
      }
      adj.get(c.id).add(nId);
      adj.get(nId).add(c.id); // ← auto-symmetrize
    }
  }
  const out = {};
  for (const [id, set] of adj) out[id] = [...set].sort();
  return out;
}

const NEIGHBORS = symmetrizeAdjacency(COUNTRIES);

/**
 * @param {string} homeCountryId
 * @param {{ seed?: number }} [opts]
 */
export function createState(homeCountryId, { seed } = {}) {
  const profile = COUNTRY_PROFILES[homeCountryId];
  const mod = profile?.mod ?? DEFAULT_MOD;
  const rngSeed = (seed ?? makeSeed()) >>> 0;
  // Init-time rng. Drawn from during createGovernment() and nothing else at
  // init — after setup, state.meta.rng owns all subsequent randomness.
  const initRng = new Rng(rngSeed);

  return {
    meta: {
      homeCountryId,
      profileId: homeCountryId,
      mod,
      tick: 0,
      year: BALANCE.startYear,
      quarter: 1,
      paused: true,
      speed: 1,
      status: 'running',           // 'running' | 'won' | 'lost'
      seed: rngSeed,
      rng: new Rng(rngSeed),
      // Player choice log. Every resolved interactive event pushes a record
      // here; the win screen reads it back as "what you chose" attribution.
      decisions: [],
      // Queued future news beats. Populated when a choice has an `echo` —
      // drained each tick by EventSystem.
      pendingEchoes: [],
      // Last tick at which any pool event fired (interactive OR passive).
      // Used by the director to enforce BALANCE.eventMinGapTicks. Sentinel
      // puts it well before tick 0 so the first event can fire as soon as
      // the startup grace window ends.
      lastEventTick: -999,
      // Last tick at which an interactive decision fired. Powers the
      // separate cadence for interactive events (BALANCE.interactive*) so
      // the player sees decisions on a predictable beat.
      lastInteractiveTick: -999,
      // Persistent dispatches log — every event, news beat, research
      // completion, deploy milestone, and advisor whisper lands here so the
      // player can read the full text at their own pace. Capped to keep
      // saves small; see model/Dispatches.js for shape + helpers.
      dispatches: [],
      // Transient flag: set when the director auto-pauses for a pending
      // interactive decision. Remembers whether the player was already
      // paused so we don't resume a deliberately-paused game.
      autoPausedForDecision: false,
      // Recurring-character thread: the hermit in the cabin. Stages advance
      // 0 → 1 → 2 → 3 as the arc fires; events guard on the current stage
      // so they only play in order. 0 means "not yet introduced."
      hermitStage: 0,
      // IPCC narrative cadence. EventSystem force-picks an IPCC-tagged event
      // every `ipccCadenceTicks` (see BALANCE). Seeded well before tick 0 so
      // the first cadence window fires once the player has a foothold.
      lastIpccTick: -999,
      // One-shot milestone flags. Scoring flips these the first time a
      // threshold crosses, so the narrative beat fires once per game.
      breached1_5: false,
    },
    world: {
      co2ppm: BALANCE.startingCO2ppm,
      tempAnomalyC: BALANCE.startingTempAnomalyC,
      annualEmissionsGtCO2: 40,    // overwritten after CarbonSystem's first tick
      societalStress: 0,
      climatePoints: BALANCE.startingClimatePoints,
      researched: new Set(),
      researchDiscountTicksRemaining: 0,
      researchDiscountPct: 0,
      // { [branchId]: { id, ticksRemaining, totalTicks } } — one slot per branch.
      activeResearch: {},
      // Deploy counts keyed by (countryId, activityId). Powers diminishing
      // returns — see model/DeployEconomy.js.
      deployCount: {},
      peakCO2ppm: BALANCE.startingCO2ppm,
      peakTempAnomalyC: BALANCE.startingTempAnomalyC,
      // Rolling history windows sized to BALANCE.historyLength.
      co2History: [BALANCE.startingCO2ppm],
      tempHistory: [BALANCE.startingTempAnomalyC],
      emissionsHistory: [40],
      adoptionHistory: [0],
      nzHistory: [0],
      willHistory: [50],
      stressHistory: [0],
      // Population history stored in millions so a sparkline over it reads
      // sensibly. Seed is 0 so first-tick snapshot fills it in.
      populationHistory: [0],
      // Running total of CO₂ kept out of the atmosphere vs. a no-adoption
      // baseline (sum of country base emissions). Updated quarterly by
      // ScoringSystem; exposed in the stats panel as a "what you've prevented"
      // counter.
      cumulativeCO2AvoidedGt: 0,
      co2AvoidedHistory: [0],
    },
    countries: Object.fromEntries(COUNTRIES.map(c => {
      const isHome = c.id === homeCountryId;
      const baseline = FOREST_BASELINE[c.id] ?? 0.3;
      const startingWill = Math.min(100, c.politicalWill + (isHome ? BALANCE.homePoliticalWillBonus : 0));
      return [c.id, {
        ...c,
        neighbors: NEIGHBORS[c.id] || [],
        adoption: startingAdoption(c),
        netZero: false,
        politicalWill: startingWill,
        isHome,
        // Population: seed from data file. populationM is the authoritative
        // live number (mutated by PopulationSystem). populationDeltaM is the
        // most recent quarterly change — powers the ticker interpolation.
        populationM: c.populationM ?? 0,
        populationDeltaM: 0,
        // Event-driven modifiers applied on top of intrinsic birth/death
        // rates. PopulationSystem decays these back toward zero each tick
        // unless flagged durable (Gen Z, carbon bank). Birth rate modifiers
        // are additive to the rate (after the stress/anxiety multipliers);
        // death rate modifiers are additive to the rate.
        birthRateModifier: 0,
        deathRateModifier: 0,
        // Forestry: health starts at baseline (forest is intact on day one),
        // and the government is a 2-slot incumbent/shadow pair — see
        // model/Government.js. Tag distributions are biased by the country's
        // infra + starting politicalWill.
        forestBaseline: baseline,
        forestHealth: baseline,
        government: createGovernment({ ...c, politicalWill: startingWill }, initRng),
      }];
    })),
    activities: Object.fromEntries(ACTIVITIES.map(a => [a.id, { ...a }])),
    news: [],
    activeEvents: [],
    collectables: [],
    advisors: createAdvisorSlice(homeCountryId),
    // Biodiversity — curated Red List roster. SpeciesSystem mutates status,
    // tempAnchor, rediscovered, lastChangeTick on each scan. queue holds
    // pending announcements so a bad year drip-feeds into the ticker rather
    // than dumping six headlines on the same frame.
    biodiversity: {
      species: SPECIES.map(def => ({
        id: def.id,
        status: def.baseStatus,
        tempAnchor: BALANCE.startingTempAnomalyC,
        rediscovered: false,
        lastChangeTick: 0,
      })),
      lastCheckTick: -999,
      lastRediscoveryTick: -999,
      peakTemp: BALANCE.startingTempAnomalyC,
      queue: [],
    },
  };
}

// Advisory Board state slice. Four seats, each tracking mood, a proposed
// agenda (or null during cooldown), influence, ability cooldown. Transient
// buffers live under `_` so save/load can drop them on resume.
function createAdvisorSlice(homeCountryId) {
  const seats = {};
  for (const id of ADVISOR_IDS) {
    const resolved = resolveAdvisor(id);
    seats[id] = {
      id,
      name: resolved?.name ?? id,
      title: resolved?.title ?? '',
      portrait: resolved?.portrait ?? '',
      color: resolved?.color ?? '#999',
      tagline: resolved?.tagline ?? '',
      influence: resolved?.opening ?? 50,
      mood: 'neutral',
      commentary: resolved?.tagline ?? '',
      agenda: null,                  // { id, text, startedAt, deadline, snap }
      cooldownUntilTick: 0,          // re-propose after this tick
      abilityReadyAtTick: 0,         // signature ability cooldown
    };
  }
  return {
    seats,
    // Telemetry fed by bus events; used for mood derivation and some agendas.
    telemetry: {
      deployLog: [],                 // rolling array of tick numbers (last 20)
      collectablesClaimed: 0,
    },
    // Last-fired tick for conflicts + whispers. Whispers are keyed by event id.
    lastConflictTick: -999,
    // Anti-repeat tracking for advisor conflicts. `lastConflictId` excludes
    // the most-recent conflict from the next pick; `firedConflictIds` biases
    // toward unseen conflicts until the pool rotates.
    lastConflictId: null,
    firedConflictIds: [],
    whisperedEventIds: [],
    // Modifiers driven by rewards (research discount is tracked on world;
    // deploy-cost discount + free-deploy counters live here since they're
    // advisor-specific).
    deployDiscount: { pct: 0, count: 0 },
    freeDeploys: 0,
  };
}

// Read-only accessors. Put derived values here, not in components. Heavier
// domain-specific selectors live in src/model/*.js (e.g. Population).
export const select = {
  displayDate: (s) => `Q${s.meta.quarter} ${s.meta.year}`,
  netZeroCount: (s) => Object.values(s.countries).filter(c => c.netZero).length,
  netZeroPct: (s) => {
    const list = Object.values(s.countries);
    return list.length ? list.filter(c => c.netZero).length / list.length : 0;
  },
  countryList: (s) => Object.values(s.countries),
  avgAdoption: (c) => Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6,
  // Population selectors — thin wrappers over model/Population.js so the rest
  // of the codebase has one import path for "give me the world snapshot".
  worldPopulationM: (s) => {
    let t = 0;
    for (const c of Object.values(s.countries)) t += c.populationM ?? 0;
    return t;
  },
  worldPopulationDeltaM: (s) => {
    let t = 0;
    for (const c of Object.values(s.countries)) t += c.populationDeltaM ?? 0;
    return t;
  },
};
