// Events model — pure apply-effects pipeline for random/interactive events.
//
// An event's outcome is expressed as an array of small, named operations
// over game state. This is the "effects as data" pattern (Redux/Elm-style):
// the engine reads the operations and applies them, which means:
//   1. Every op is unit-testable in isolation — see __tests__/Events.test.js.
//   2. Future work (a "what would this event do?" preview in the UI, an
//      event log that replays past firings, difficulty tuning that scales
//      values globally) is mechanical.
//   3. Authoring a new event becomes pure data — no imperative code to
//      review.
//
// We keep `apply` as an escape hatch in the event schema for anything too
// niche to express with ops. EventSystem applies effects first, then runs
// `apply` if present. Over time, escape hatches can be turned into new op
// kinds.
//
// ─── Schema ────────────────────────────────────────────────────────────────
//
// Effect shape:
//   { op: '<kind>', ...args }
//
// Supported ops:
//
//   { op: 'addWorld', field: 'co2ppm' | 'tempAnomalyC' | 'climatePoints'
//                            | 'societalStress',
//     value, min?, max? }
//
//   { op: 'addAllCountries', field, value }
//       field: 'politicalWill' | 'adoption.<branch>'
//
//   { op: 'addCountries', where, field, value }
//       where: shape-match, e.g. { infra: 'petrostate' }
//                            or { infra: ['service','industrial'] }
//                            or { minEmissions: 0.8 }
//                            or { minAdoption: { branch: 'energy', v: 0.3 } }
//
//   { op: 'addTarget', field, value }
//       Uses ctx.target (event-level target resolver). No-op if none.
//
//   { op: 'addTargetAllBranches', value }
//       Shortcut for modifying all 6 adoption branches on the target.
//
//   { op: 'addTargetRandomBranch', value, branches? }
//       Pick one of `branches` (default: all 6) via state.meta.rng.
//
//   { op: 'addRandomCountries', count, field, value, where? }
//       Shuffle + take N (post-filter), then apply a flat field delta.
//
//   { op: 'addRandomBranches', count, value, branches?, where? }
//       Shuffle + take N, then pick a random branch per country.
//
// Clamping is automatic by field:
//   adoption.*        → [0, 1]
//   politicalWill     → [10, 100]
//   societalStress    → [0, ∞)
//   climatePoints     → [0, ∞)
//   co2ppm            → [preindustrial, ∞)
//   tempAnomalyC      → no implicit clamp; pass `max`/`min` explicitly
//
// All functions pure (modulo the expected state writes and rng advance).

import { BALANCE } from '../config/balance.js';

// Clamp helpers for each known field. Ops pass the field string through.
function clampCountryField(field, v) {
  if (field === 'politicalWill') return Math.max(10, Math.min(100, v));
  if (field.startsWith('adoption.')) return Math.max(0, Math.min(1, v));
  return v;
}
function clampWorldField(field, v, extra = {}) {
  if (field === 'co2ppm') return Math.max(BALANCE.preindustrialCO2ppm, v);
  if (field === 'climatePoints') return Math.max(0, v);
  if (field === 'societalStress') return Math.max(0, v);
  if (extra.min != null) v = Math.max(extra.min, v);
  if (extra.max != null) v = Math.min(extra.max, v);
  return v;
}

// Generic country-match. All listed keys AND-combine; array values OR-combine.
export function matchesWhere(country, where) {
  if (!where) return true;
  for (const key of Object.keys(where)) {
    const required = where[key];
    if (key === 'minEmissions') {
      if ((country.baseEmissionsGtCO2 ?? 0) < required) return false;
    } else if (key === 'minAdoption') {
      const { branch, v } = required;
      if ((country.adoption?.[branch] ?? 0) < v) return false;
    } else if (Array.isArray(required)) {
      if (!required.includes(country[key])) return false;
    } else {
      if (country[key] !== required) return false;
    }
  }
  return true;
}

// Set a country field (field may be "politicalWill" or "adoption.<branch>").
function addToCountry(country, field, delta) {
  if (field === 'politicalWill') {
    country.politicalWill = clampCountryField(field, (country.politicalWill ?? 50) + delta);
    return;
  }
  if (field.startsWith('adoption.')) {
    const branch = field.slice(9);
    country.adoption[branch] = clampCountryField(field, (country.adoption[branch] ?? 0) + delta);
    return;
  }
  // Unknown field — intentionally silent; the integrity test catches typos.
}

function addToWorld(world, field, delta, extra) {
  world[field] = clampWorldField(field, (world[field] ?? 0) + delta, extra);
}

// ─── Op executor ──────────────────────────────────────────────────────────
// Takes one effect descriptor and applies it. `ctx.target` is used by
// target-scoped ops; `state.meta.rng` is used by randomized ops.
export function applyEffect(state, effect, ctx = {}) {
  const op = effect?.op;
  switch (op) {
    case 'addWorld': {
      addToWorld(state.world, effect.field, effect.value, effect);
      return;
    }
    case 'addAllCountries': {
      for (const c of Object.values(state.countries)) {
        addToCountry(c, effect.field, effect.value);
      }
      return;
    }
    case 'addCountries': {
      for (const c of Object.values(state.countries)) {
        if (matchesWhere(c, effect.where)) addToCountry(c, effect.field, effect.value);
      }
      return;
    }
    case 'addTarget': {
      if (ctx.target) addToCountry(ctx.target, effect.field, effect.value);
      return;
    }
    case 'addTargetAllBranches': {
      if (!ctx.target) return;
      for (const k of Object.keys(ctx.target.adoption ?? {})) {
        addToCountry(ctx.target, `adoption.${k}`, effect.value);
      }
      return;
    }
    case 'addTargetRandomBranch': {
      if (!ctx.target) return;
      const branches = effect.branches ?? Object.keys(ctx.target.adoption ?? {});
      const picked = state.meta.rng.pick(branches);
      if (picked) addToCountry(ctx.target, `adoption.${picked}`, effect.value);
      return;
    }
    case 'addRandomCountries': {
      const pool = Object.values(state.countries).filter(c => matchesWhere(c, effect.where));
      const picks = state.meta.rng.shuffled(pool).slice(0, effect.count ?? 1);
      for (const c of picks) addToCountry(c, effect.field, effect.value);
      return;
    }
    case 'addRandomBranches': {
      const pool = Object.values(state.countries).filter(c => matchesWhere(c, effect.where));
      const picks = state.meta.rng.shuffled(pool).slice(0, effect.count ?? 1);
      for (const c of picks) {
        const branches = effect.branches ?? Object.keys(c.adoption ?? {});
        const b = state.meta.rng.pick(branches);
        if (b) addToCountry(c, `adoption.${b}`, effect.value);
      }
      return;
    }
    default:
      // Unknown op — intentionally silent at runtime; tests catch typos.
      return;
  }
}

// Apply a list of effects. Pure-ish (RNG state advances).
export function applyEffects(state, effects, ctx = {}) {
  if (!effects?.length) return;
  for (const e of effects) applyEffect(state, e, ctx);
}
