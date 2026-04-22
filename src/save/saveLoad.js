// Save / resume. State is kept almost-JSON-native; the only things we have
// to hand-serialize are the RNG instance (reconstructed from seed) and the
// Set of researched activities (converted to an array).
//
// ─── Save schema versioning & migrations ──────────────────────────────────
// Every blob on disk carries its own `schema` number. `SCHEMA` below is the
// current (writer) version. `MIGRATIONS[n]` takes a blob at schema=n and
// returns one at schema=n+1. deserialize() chains migrations forward until
// the blob's schema matches the current writer, then runs the shared
// back-fill pass.
//
// Rules for the next shape change:
//   1. Bump SCHEMA (e.g. 1 → 2).
//   2. Add MIGRATIONS[1] (a pure function: v1 blob in, v2 blob out).
//   3. Add a fixture under __tests__/fixtures/ so the migration test can
//      assert the path doesn't silently drift.
//   4. Keep forward-compat back-fills (the `// Forward-compat:` block below)
//      ONLY for non-breaking additions — new optional fields. Anything that
//      removes, renames, or changes the type of a field MUST go through a
//      numbered migration so we can tell old blobs apart from new.
// A blob whose schema is higher than the writer is rejected (we can't know
// how a future version shaped it). A blob whose schema is lower gets
// migrated forward.

import { Rng } from '../core/Random.js';
import { COUNTRIES, FOREST_BASELINE } from '../data/countries.js';
import { ADVISOR_IDS } from '../data/advisors.js';
import { resolveAdvisor } from '../model/Advisors.js';
import { createGovernment } from '../model/Government.js';
import { captureError } from '../telemetry/sentry.js';

const STORAGE_KEY = 'tipping-point.save.v1';
const SCHEMA = 2;

// Migration registry. Each entry takes a blob at schema N and returns one at
// schema N+1. deserialize() chains them until the blob reaches the current
// writer version.
const MIGRATIONS = {
  // v1 → v2: per-country government + forestry. v1 saves have no government
  // object and no forestHealth/forestBaseline. We rebuild government from
  // scratch using the country's live politicalWill + infra (same path
  // createGovernment() takes at new-game init) and seed forestHealth to its
  // baseline — treating the save as "forests intact at resume" rather than
  // guessing historical burn. The rng in the save already has its stream
  // position; we use it to draw politician tags so the migration is
  // deterministic per-save.
  1: (blob) => {
    const state = blob.state;
    // The rng instance isn't rebuilt yet at migration time — saveLoad rebuilds
    // it after migrate(). Roll a temporary rng off the seed to generate
    // governments; the real state.meta.rng's stream position is preserved
    // downstream, so gameplay rolls don't shift.
    const rng = new Rng((state?.meta?.seed ?? 0) >>> 0);
    for (const c of Object.values(state?.countries ?? {})) {
      if (c.forestBaseline == null) c.forestBaseline = FOREST_BASELINE[c.id] ?? 0.3;
      if (c.forestHealth   == null) c.forestHealth   = c.forestBaseline;
      if (!c.government) c.government = createGovernment(c, rng);
    }
    return { ...blob, schema: 2 };
  },
};

function migrate(blob) {
  let cur = blob;
  while (cur && cur.schema < SCHEMA) {
    const step = MIGRATIONS[cur.schema];
    if (!step) {
      console.warn(`[save] no migration from schema ${cur.schema} → ${cur.schema + 1}; dropping save`);
      return null;
    }
    cur = step(cur);
    if (!cur || cur.schema <= blob.schema) {
      console.warn('[save] migration did not advance schema; dropping save');
      return null;
    }
  }
  return cur;
}

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

// Shallow-serialize Sets and drop transient fields. The RNG instance itself
// can't be JSON'd, so we snapshot its stream position into meta.rngState and
// rebuild the Rng on load — this preserves exact determinism across save /
// load, so a replay from a loaded save produces the same random rolls as an
// uninterrupted run.
export function serialize(state) {
  const rngState = typeof state?.meta?.rng?.snapshot === 'function'
    ? state.meta.rng.snapshot()
    : undefined;
  const clone = JSON.parse(JSON.stringify({
    ...state,
    meta: { ...state.meta, rng: undefined, rngState },
    world: { ...state.world, researched: [...state.world.researched] },
  }));
  return { schema: SCHEMA, savedAt: Date.now(), state: clone };
}

export function deserialize(blob) {
  if (!blob || typeof blob.schema !== 'number') return null;
  // Future schemas aren't decodable — the writer may have shaped the blob in
  // ways we can't predict. Older schemas get migrated forward.
  if (blob.schema > SCHEMA) return null;
  if (blob.schema < SCHEMA) {
    blob = migrate(blob);
    if (!blob) return null;
  }
  const s = blob.state;
  // Rebuild non-JSON members. If the blob carries a snapshotted stream
  // position (rngState), resume from it — otherwise fall back to reseeding
  // from the seed, which matches pre-stream-position save behavior.
  s.world.researched = new Set(s.world.researched || []);
  s.meta.rng = new Rng(s.meta.seed, s.meta.rngState);
  delete s.meta.rngState;
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
    // Pre-split saves only had `baseGrowthPerYear`. Back-fill the new split
    // fields from the live data file; drop the legacy field so nothing reads
    // it by accident. Pre-v0.4 saves get the current canonical numbers.
    const def = byId.get(c.id);
    if (c.birthRatePerYear == null)  c.birthRatePerYear = def?.birthRatePerYear ?? 0;
    if (c.deathRatePerYear == null)  c.deathRatePerYear = def?.deathRatePerYear ?? 0;
    if (c.climateVulnerability == null)  c.climateVulnerability = def?.climateVulnerability ?? 1;
    // Event-driven birth/death modifiers decay each tick — safest restore
    // is zero so a resumed save doesn't retain stale buffs from a dropped
    // activeEvent.
    if (c.birthRateModifier == null) c.birthRateModifier = 0;
    if (c.deathRateModifier == null) c.deathRateModifier = 0;
    if (c.baseGrowthPerYear != null) delete c.baseGrowthPerYear;
    // Map positions were recalibrated against the pixel art. Always pull
    // the latest from the data file — old saves predate the calibration,
    // and we want dots to land on their countries regardless of save age.
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
  // Dispatch id counter was module-scoped pre-fix; older saves won't have
  // it. Recover by scanning the dispatches array for the highest suffix so
  // the next id emitted after resume doesn't collide with an existing one.
  if (s.meta.dispatchIdCounter == null) {
    let max = 0;
    for (const d of s.meta.dispatches) {
      const m = /^d_\d+_([0-9a-z]+)$/.exec(d.id ?? '');
      if (!m) continue;
      const n = parseInt(m[1], 36);
      if (Number.isFinite(n) && n > max) max = n;
    }
    s.meta.dispatchIdCounter = max;
  }
  // activeEvents is dropped on load (see above), so any dispatch that was
  // still "needs action" is now orphaned — its eventId no longer resolves
  // to anything. Mark it answered so the UI doesn't show a Decide button
  // that goes nowhere, and so the tab badge doesn't pulse forever.
  if (s.meta.dispatches?.length) {
    for (const d of s.meta.dispatches) {
      if (d.needsAction) {
        d.needsAction = false;
        d.expired = true;
        d.tone = 'bad';
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
    // Metadata read — accept any schema <= current so we can show resume
    // banners for not-yet-migrated saves. The actual load path runs
    // migrate() and rebuilds; this is just the peek.
    if (typeof blob.schema !== 'number' || blob.schema > SCHEMA) return null;
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
    // Metadata read — accept any schema <= current so we can show resume
    // banners for not-yet-migrated saves. The actual load path runs
    // migrate() and rebuilds; this is just the peek.
    if (typeof blob.schema !== 'number' || blob.schema > SCHEMA) return null;
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
