// Save / resume. State is kept almost-JSON-native; the only things we have
// to hand-serialize are the RNG instance (reconstructed from seed) and the
// Set of researched activities (converted to an array).
//
// Save format versioning: if we ever change the state shape, bump SCHEMA and
// teach deserialize() how to migrate older blobs.

import { Rng } from '../core/Random.js';
import { COUNTRIES } from '../data/countries.js';
import { ADVISOR_IDS } from '../data/advisors.js';
import { resolveAdvisor } from '../model/Advisors.js';
import { captureError } from '../telemetry/sentry.js';

const STORAGE_KEY = 'tipping-point.save.v1';
const SCHEMA = 1;

// Named slot keys. The `auto` slot reuses the legacy STORAGE_KEY so saves
// written before slots existed still resolve. Manual slots a/b/c are
// player-controlled targets — the player pushes the current state into them
// from the Settings modal and reloads them from the country-select screen.
export const SLOT_KEYS = {
  auto: STORAGE_KEY,
  a: 'tipping-point.save.a.v1',
  b: 'tipping-point.save.b.v1',
  c: 'tipping-point.save.c.v1',
};

export const SLOT_LABELS = {
  auto: 'Autosave',
  a: 'Slot A',
  b: 'Slot B',
  c: 'Slot C',
};

export const MANUAL_SLOT_IDS = ['a', 'b', 'c'];
export const ALL_SLOT_IDS = ['auto', 'a', 'b', 'c'];

// Shallow-serialize Sets and drop transient fields (rng instance, nothing
// else right now). Everything else round-trips through JSON natively.
export function serialize(state) {
  const clone = JSON.parse(JSON.stringify({
    ...state,
    meta: { ...state.meta, rng: undefined },
    world: { ...state.world, researched: [...state.world.researched] },
  }));
  return { schema: SCHEMA, savedAt: Date.now(), state: clone };
}

export function deserialize(blob) {
  if (!blob || blob.schema !== SCHEMA) return null;
  const s = blob.state;
  // Rebuild non-JSON members.
  s.world.researched = new Set(s.world.researched || []);
  s.meta.rng = new Rng(s.meta.seed);
  // Forward-compat: fields added after this save was written get sane defaults
  // instead of `undefined`. Schema-minor migrations live here so we can keep
  // old saves readable without bumping SCHEMA.
  s.world.deployCount ||= {};
  s.world.populationHistory ||= [0];
  if (s.world.cumulativeCO2AvoidedGt == null) s.world.cumulativeCO2AvoidedGt = 0;
  s.world.co2AvoidedHistory ||= [0];
  // Populations arrived in v0.4 — back-fill from the data file if missing, so
  // old-save resumes don't show "0 people" then snap to realistic values on
  // the first tick.
  const byId = new Map(COUNTRIES.map(c => [c.id, c]));
  for (const c of Object.values(s.countries || {})) {
    if (c.populationM == null)      c.populationM = byId.get(c.id)?.populationM ?? 0;
    if (c.populationDeltaM == null) c.populationDeltaM = 0;
    if (c.baseGrowthPerYear == null)     c.baseGrowthPerYear = byId.get(c.id)?.baseGrowthPerYear ?? 0;
    if (c.climateVulnerability == null)  c.climateVulnerability = byId.get(c.id)?.climateVulnerability ?? 1;
    // Map positions were recalibrated against the pixel art. Always pull
    // the latest from the data file — old saves predate the calibration,
    // and we want dots to land on their countries regardless of save age.
    const def = byId.get(c.id);
    if (def?.mapX != null) c.mapX = def.mapX;
    if (def?.mapY != null) c.mapY = def.mapY;
  }
  // Active events can contain function refs (from EVENT_POOL). They won't
  // round-trip; the safest thing is to drop any unresolved ones on load —
  // the player resolves them at event time, not 30 seconds after save.
  s.activeEvents = [];
  // Decision/echo log was added in v0.6. Back-fill as empty on older saves.
  // pendingEchoes stored a function ref in early drafts; current format is
  // pure data so it round-trips, but we still guard for missing fields.
  s.meta.decisions ||= [];
  s.meta.pendingEchoes ||= [];
  if (s.meta.lastEventTick == null) s.meta.lastEventTick = -999;
  if (s.meta.lastInteractiveTick == null) s.meta.lastInteractiveTick = -999;
  // Dispatches log (v0.7+) — older saves just start with an empty feed; the
  // first live beat after resume will populate it. autoPausedForDecision is
  // a transient flag; always start cleared so a crashed session doesn't
  // leave the game stuck in auto-pause on resume.
  s.meta.dispatches ||= [];
  s.meta.autoPausedForDecision = false;
  // activeEvents is dropped on load (see above), so any dispatch that was
  // still "needs action" is now orphaned — its eventId no longer resolves
  // to anything. Mark it answered so the UI doesn't show a Decide button
  // that goes nowhere, and so the tab badge doesn't pulse forever.
  if (s.meta.dispatches?.length) {
    for (const d of s.meta.dispatches) {
      if (d.needsAction) {
        d.needsAction = false;
        d.read = true;
        d.detail = d.detail || 'Decision expired on resume.';
      }
    }
  }
  // Collectables have DOM-coupled lifetime tracking; drop them on load and
  // let CollectableSystem respawn fresh ones.
  s.collectables = [];
  // Advisory Board back-fill (v0.5+). Older saves predate the board — rebuild
  // a fresh slice so the UI mounts cleanly. Newer saves round-trip as-is but
  // drop transient spawn buffers.
  if (!s.advisors) {
    s.advisors = backfillAdvisors();
  } else {
    s.advisors._pendingSpawn = 0;
    s.advisors.telemetry ||= { deployLog: [], collectablesClaimed: 0 };
    s.advisors.telemetry.deployLog ||= [];
    s.advisors.whisperedEventIds ||= [];
    // Conflict-repeat tracking (added post-launch — older saves may lack it).
    if (s.advisors.lastConflictId === undefined) s.advisors.lastConflictId = null;
    s.advisors.firedConflictIds ||= [];
    s.advisors.deployDiscount ||= { pct: 0, count: 0 };
    if (s.advisors.freeDeploys == null) s.advisors.freeDeploys = 0;
    for (const id of ADVISOR_IDS) {
      const resolved = resolveAdvisor(id);
      if (!s.advisors.seats[id]) {
        s.advisors.seats[id] = blankSeat(id, resolved);
      } else {
        const seat = s.advisors.seats[id];
        seat.name = resolved?.name ?? seat.name;
        seat.title = resolved?.title ?? seat.title;
        seat.portrait = resolved?.portrait ?? seat.portrait;
        seat.color = resolved?.color ?? seat.color;
        seat.tagline = resolved?.tagline ?? seat.tagline;
      }
    }
  }
  return s;
}

function blankSeat(id, resolved) {
  return {
    id,
    name: resolved?.name ?? id,
    title: resolved?.title ?? '',
    portrait: resolved?.portrait ?? '',
    color: resolved?.color ?? '#999',
    tagline: resolved?.tagline ?? '',
    influence: resolved?.opening ?? 50,
    mood: 'neutral',
    commentary: resolved?.tagline ?? '',
    agenda: null,
    cooldownUntilTick: 0,
    abilityReadyAtTick: 0,
  };
}

function backfillAdvisors() {
  const seats = {};
  for (const id of ADVISOR_IDS) {
    seats[id] = blankSeat(id, resolveAdvisor(id));
  }
  return {
    seats,
    telemetry: { deployLog: [], collectablesClaimed: 0 },
    lastConflictTick: -999,
    lastConflictId: null,
    firedConflictIds: [],
    whisperedEventIds: [],
    deployDiscount: { pct: 0, count: 0 },
    freeDeploys: 0,
  };
}

export function hasSave() {
  try { return !!localStorage.getItem(STORAGE_KEY); }
  catch { return false; }
}

export function readSaveMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    if (blob.schema !== SCHEMA) return null;
    const s = blob.state;
    return {
      savedAt: blob.savedAt,
      homeCountryId: s.meta.homeCountryId,
      year: s.meta.year,
      quarter: s.meta.quarter,
      tempAnomalyC: s.world.tempAnomalyC,
      co2ppm: s.world.co2ppm,
    };
  } catch { return null; }
}

export function save(state) {
  try {
    const blob = serialize(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    return true;
  } catch (err) {
    console.warn('[save] failed:', err);
    captureError(err, { area: 'save', slot: 'auto', quotaExceeded: isQuotaError(err) });
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  } catch (err) {
    console.warn('[load] failed:', err);
    captureError(err, { area: 'load', slot: 'auto' });
    return null;
  }
}

function isQuotaError(err) {
  if (!err) return false;
  const name = err.name || '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

export function clearSave() {
  try { localStorage.removeItem(STORAGE_KEY); }
  catch { /* ignore */ }
}

// ─── Slot-aware helpers. The autosave path (save / load / clearSave / hasSave
//     / readSaveMeta) still writes to STORAGE_KEY unchanged; these helpers let
//     the UI address other slots by id without touching the autosave. ────────

function keyFor(slotId) {
  return SLOT_KEYS[slotId] ?? null;
}

export function saveToSlot(slotId, state) {
  const key = keyFor(slotId);
  if (!key) return false;
  try {
    const blob = serialize(state);
    localStorage.setItem(key, JSON.stringify(blob));
    return true;
  } catch (err) {
    console.warn('[save] slot write failed:', slotId, err);
    captureError(err, { area: 'save', slot: slotId, quotaExceeded: isQuotaError(err) });
    return false;
  }
}

export function loadFromSlot(slotId) {
  const key = keyFor(slotId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  } catch (err) {
    console.warn('[save] slot read failed:', slotId, err);
    captureError(err, { area: 'load', slot: slotId });
    return null;
  }
}

export function readSlotMeta(slotId) {
  const key = keyFor(slotId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    if (blob.schema !== SCHEMA) return null;
    const s = blob.state;
    return {
      slotId,
      savedAt: blob.savedAt,
      homeCountryId: s.meta.homeCountryId,
      year: s.meta.year,
      quarter: s.meta.quarter,
      tempAnomalyC: s.world.tempAnomalyC,
      co2ppm: s.world.co2ppm,
    };
  } catch { return null; }
}

export function deleteSlot(slotId) {
  const key = keyFor(slotId);
  if (!key) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

export function listSlots() {
  return ALL_SLOT_IDS.map(id => ({
    id,
    label: SLOT_LABELS[id],
    meta: readSlotMeta(id),
  }));
}

// Install an auto-save driver. Writes every `intervalMs` of wall-clock time
// *while running*, and on window unload. Cheap: ~3ms for a full state blob.
export function installAutoSave(state, bus, { intervalMs = 20000 } = {}) {
  let last = 0;
  const maybeSave = () => {
    if (state.meta.status !== 'running') return;
    const now = Date.now();
    if (now - last < intervalMs) return;
    last = now;
    save(state);
  };
  const onUnload = () => { save(state); };
  const onVis = () => { if (document.hidden) save(state); };

  // Save on most bus events (low frequency, player-meaningful moments).
  const unsubs = [
    bus.on('tick', maybeSave),
    bus.on('deployed', () => save(state)),
    bus.on('researchDone', () => save(state)),
    bus.on('netZero', () => save(state)),
  ];
  window.addEventListener('pagehide', onUnload);
  document.addEventListener('visibilitychange', onVis);

  return {
    stop() {
      unsubs.forEach(u => u?.());
      window.removeEventListener('pagehide', onUnload);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
