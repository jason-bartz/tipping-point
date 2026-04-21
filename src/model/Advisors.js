// Pure helpers for the advisory board. No I/O, no state writes — the system
// module in systems/AdvisorSystem.js reads these and performs the mutations.
//
// Vocabulary:
//   mood        → 'confident' | 'neutral' | 'worried' | 'alarmed' (UI tint)
//   commentary  → one-line take keyed off mood + archetype
//   agenda      → a time-boxed goal; progress returns 0-1
//   reward      → payload executed by AdvisorSystem on success
//   influence   → 0-100; governs UI prominence and unlocks abilities at 80+

import { ADVISOR_ARCHETYPES, AGENDA_CATALOG } from '../data/advisors.js';

export function clampInfluence(v) { return Math.max(0, Math.min(100, v)); }

// Same cast for every country. The archetype *is* the advisor.
export function resolveAdvisor(archetypeId) {
  return ADVISOR_ARCHETYPES[archetypeId] ?? null;
}

// ─── Mood derivation ───────────────────────────────────────────────────────
// Each advisor weighs a small set of signals. We compute a 0-1 "state score"
// (1 = everything great) and bucket it. Signals:
//   co2        — fraction of CO₂ ceiling remaining (1 at baseline, 0 at loss)
//   temp       — fraction of temp ceiling remaining
//   will       — mean political will / 100
//   nz         — net-zero country share
//   stress     — 1 - stress/20 (clamped)
//   research   — active research slots occupied out of 6
//   adoption   — mean adoption across all country-branches
//   spread     — mean political will above 50 across non-home countries
//   deploys    — player deploys in last 20 ticks normalized against a target

function computeSignals(state, recentDeploys) {
  const w = state.world;
  const countries = Object.values(state.countries);
  const n = countries.length || 1;

  const co2Score   = clamp01(1 - (w.co2ppm - 360) / 120);
  const tempScore  = clamp01(1 - (w.tempAnomalyC - 1.0) / 3.0);
  const willMean   = countries.reduce((t, c) => t + (c.politicalWill ?? 50), 0) / n / 100;
  const nzShare    = countries.filter(c => c.netZero).length / n;
  const stressSig  = clamp01(1 - (w.societalStress ?? 0) / 20);
  const resCount   = Object.keys(w.activeResearch ?? {}).length / 6;
  const adoptMean  = countries.reduce((t, c) => {
    const vals = Object.values(c.adoption ?? {});
    return t + (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  }, 0) / n;
  const spreadSig  = clamp01(countries.filter(c => !c.isHome && (c.politicalWill ?? 0) > 55).length / Math.max(1, n - 1));
  const deploySig  = clamp01((recentDeploys ?? 0) / 6);

  return {
    co2: co2Score, temp: tempScore, will: willMean, nz: nzShare,
    stress: stressSig, research: resCount, adoption: adoptMean,
    spread: spreadSig, deploys: deploySig,
  };
}

function weightedMoodScore(weights, signals) {
  let tot = 0; let wTot = 0;
  for (const k of Object.keys(weights)) {
    const w = weights[k];
    const s = signals[k];
    if (s == null) continue;
    tot += w * s;
    wTot += w;
  }
  return wTot > 0 ? tot / wTot : 0.5;
}

export function deriveMood(archetype, state, telemetry) {
  const signals = computeSignals(state, telemetry?.recentDeploys);
  const score = weightedMoodScore(archetype.moodWeights ?? {}, signals);
  if (score >= 0.70) return 'confident';
  if (score >= 0.50) return 'neutral';
  if (score >= 0.30) return 'worried';
  return 'alarmed';
}

// ─── Commentary ────────────────────────────────────────────────────────────
// A short one-line take indexed by archetype + mood. Not seeded — this is
// cosmetic text; deterministic only matters for mechanics.

const COMMENTARY = {
  scientist: {
    confident: ['The curve is bending.', 'Emissions trajectory is finally behaving.', 'Peer review committees are pleased.'],
    neutral:   ['Data is noisy. Keep pushing.', 'No inflection yet. Stay the course.', 'We’re in the grey zone.'],
    worried:   ['The numbers are drifting.', 'Albedo feedback is concerning.', 'We need a breakthrough — soon.'],
    alarmed:   ['The curve has teeth. Act now.', 'Every degree costs a century.', 'We’re past optimism. Decide.'],
  },
  diplomat: {
    confident: ['Coalitions are warming to us.', 'Back-channels are humming.', 'The room is coming with us.'],
    neutral:   ['Talks are talks.', 'Ministers are nervous but civil.', 'Room temperature, not hostile.'],
    worried:   ['Goodwill is thinning.', 'Petrostates are caucusing without us.', 'We’re losing the middle powers.'],
    alarmed:   ['Allies are peeling off.', 'The treaty architecture is cracking.', 'If we lose them, we lose the game.'],
  },
  activist: {
    confident: ['The streets are with us.', 'Public mood is finally moving.', 'The youth remember who delivered.'],
    neutral:   ['Apathy, not resistance. For now.', 'Restless, not mobilized.', 'One more hot summer decides it.'],
    worried:   ['Grief is organizing faster than hope.', 'People are tired of being asked to wait.', 'Patience is a finite resource.'],
    alarmed:   ['People are leaving burning homes.', 'The climate grief is radicalizing.', 'Do something visible. Now.'],
  },
  industrialist: {
    confident: ['Lines are moving. Supply is stable.', 'Orders are up. Tonnage is up.', 'The industrial base is humming.'],
    neutral:   ['Backlogs, but manageable.', 'Inputs are tight. Output holds.', 'Margins are thin but positive.'],
    worried:   ['Permits are stalled. We’re slipping.', 'Steel and cement are lagging.', 'Deployment is the bottleneck now.'],
    alarmed:   ['Factory floors are empty.', 'We stopped building. That’s the problem.', 'Without tonnage, all this is talk.'],
  },
};

export function commentaryFor(archetype, mood, rng) {
  const pool = COMMENTARY[archetype.id]?.[mood];
  if (!pool || !pool.length) return archetype.tagline ?? '';
  return pool[Math.floor((rng?.random?.() ?? Math.random()) * pool.length)];
}

// ─── Agenda selection ──────────────────────────────────────────────────────

export function pickAgenda(archetypeId, state) {
  const pool = AGENDA_CATALOG[archetypeId] ?? [];
  const rng = state.meta.rng;
  const eligible = pool.filter(a => (a.guard ? !!a.guard(state) : true));
  if (!eligible.length) return null;
  const chosen = eligible[Math.floor(rng.random() * eligible.length)];
  const startSnap = chosen.start ? chosen.start(state) : {};
  return {
    id: chosen.id,
    text: chosen.text,
    startedAt: state.meta.tick,
    deadline: state.meta.tick + (chosen.durationTicks ?? 16),
    snap: startSnap,
  };
}

export function agendaProgress(archetypeId, agenda, state) {
  const def = (AGENDA_CATALOG[archetypeId] ?? []).find(a => a.id === agenda.id);
  if (!def) return 0;
  return clamp01(def.progress(state, agenda.snap));
}

export function agendaDef(archetypeId, agendaId) {
  return (AGENDA_CATALOG[archetypeId] ?? []).find(a => a.id === agendaId) ?? null;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
