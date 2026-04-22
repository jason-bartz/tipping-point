// Achievements — persistent across runs.
//
// Two layers of state:
//   · Per-run counters/flags stored on `state.meta.achievementProgress` so
//     saves round-trip them (collectables claimed this run, decisions
//     resolved this run, peak temp so far, etc.).
//   · Persistent set of unlocked ids in localStorage under ACHIEVEMENT_KEY.
//     Survives save deletion and "Play Again".
//
// A run can unlock multiple in one frame (e.g. win + reversed + cool_head).
// The bus emits one ACHIEVEMENT_UNLOCKED per unlock so the UI can toast them
// in sequence.

import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from '../data/achievements.js';

const STORAGE_KEY = 'tipping-point.achievements.v1';
const NEW_FLAG_KEY = 'tipping-point.achievements.new.v1';

export function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveUnlocked(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); }
  catch { /* ignore */ }
}

// Track freshly-unlocked ids so the HUD can badge the achievements button
// until the player opens the modal.
export function markNew(id) {
  try {
    const raw = localStorage.getItem(NEW_FLAG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr.includes(id)) arr.push(id);
    localStorage.setItem(NEW_FLAG_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export function readNew() {
  try {
    const raw = localStorage.getItem(NEW_FLAG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

export function clearNew() {
  try { localStorage.removeItem(NEW_FLAG_KEY); }
  catch { /* ignore */ }
}

export function ensureProgressSlot(state) {
  if (!state.meta.achievementProgress) {
    state.meta.achievementProgress = {
      collectablesClaimed: 0,
      decisionsResolved: 0,
      peakTempSeenC: 0,
      firstNetZeroTick: null,
      firstNetZeroYear: null,
      usedGatedDeploy: false,
    };
  }
  return state.meta.achievementProgress;
}

function isPetrostate(country) {
  return country?.infra === 'petrostate';
}

function worldAvgWill(state) {
  const vals = Object.values(state.countries).map(c => c.politicalWill ?? 50);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function allCapstonesResearched(state) {
  // A Tier-4 is a capstone. This set is small, so the iteration is fine.
  const t4 = Object.values(state.activities).filter(a => a.tier === 4);
  if (!t4.length) return false;
  return t4.every(a => state.world.researched.has(a.id));
}

function allCountriesNetZero(state) {
  const list = Object.values(state.countries);
  if (!list.length) return false;
  return list.every(c => c.netZero);
}

// Install listeners. Returns a teardown.
/**
 * @param {any} state
 * @param {{ on: (t: string, fn: (p: any) => void) => () => void }} bus
 * @param {{ EVT: Record<string, string> }} ctx
 * @param {{ onUnlock?: (def: { id: string, title: string, desc: string }) => void }} [opts]
 */
export function installAchievements(state, bus, { EVT }, { onUnlock } = {}) {
  const progress = ensureProgressSlot(state);
  const unlocked = loadUnlocked();

  function unlock(id) {
    if (unlocked.has(id)) return;
    const def = ACHIEVEMENT_BY_ID[id];
    if (!def) return;
    unlocked.add(id);
    saveUnlocked(unlocked);
    markNew(id);
    onUnlock?.(def);
  }

  const unsubs = [];

  unsubs.push(bus.on(EVT.NET_ZERO, (p) => {
    unlock('first_net_zero');
    if (progress.firstNetZeroTick == null) {
      progress.firstNetZeroTick = state.meta.tick;
      progress.firstNetZeroYear = state.meta.year;
      if (state.meta.year < 2035) unlock('speedrun');
    }
    if (isPetrostate(p.country)) unlock('petrostate_pivot');
    if (allCountriesNetZero(state)) unlock('clean_sweep');
  }));

  unsubs.push(bus.on(EVT.RESEARCH_DONE, () => {
    if (allCapstonesResearched(state)) unlock('capstones');
  }));

  unsubs.push(bus.on(EVT.COLLECTABLE_CLAIMED, () => {
    progress.collectablesClaimed = (progress.collectablesClaimed ?? 0) + 1;
    if (progress.collectablesClaimed >= 50) unlock('collector');
  }));

  unsubs.push(bus.on(EVT.DECISION_RESOLVED, () => {
    progress.decisionsResolved = (progress.decisionsResolved ?? 0) + 1;
    if (progress.decisionsResolved >= 25) unlock('decisive');
  }));

  unsubs.push(bus.on(EVT.TICK, () => {
    progress.peakTempSeenC = Math.max(progress.peakTempSeenC ?? 0, state.world.tempAnomalyC ?? 0);
    if (worldAvgWill(state) >= 80) unlock('populist');
  }));

  unsubs.push(bus.on(EVT.WON, (p) => {
    unlock('stabilized');
    if (p?.perfect) unlock('reversed');
    const peak = state.world.peakTempAnomalyC ?? progress.peakTempSeenC ?? 0;
    if (peak > 2.5) unlock('heatwave_survivor');
    if (peak < 2.0) unlock('cool_head');
    if (allCountriesNetZero(state)) unlock('clean_sweep');
  }));

  return () => unsubs.forEach(u => u?.());
}

export function listAllAchievements() {
  return ACHIEVEMENTS;
}
