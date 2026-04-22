// SpeciesSystem — ticks the Red List roster against temperature. Each
// species holds an IUCN status that slides worse under sustained warming,
// can recover slowly if the climate cools, and — for a flagged Lazarus
// subset — can be rediscovered after being declared extinct.
//
// Design notes:
//   · Checks run once per in-game year (every `ticksPerYear` ticks), not
//     every tick. Species status should feel like news, not ticker spam.
//   · Decline pressure = (tempAnomalyC - species.tempAnchor) × sensitivity.
//     The anchor is snapshotted whenever the species last changed status,
//     so a species that already slid at +2.2°C won't slide again until the
//     world climbs meaningfully *past* +2.2°C. This mirrors the way
//     IUCN status lags field conditions — a species doesn't drop a rung
//     every month the thermometer bumps.
//   · Recovery runs only when temperature has dropped noticeably below
//     the anchor (relief), at a lower roll rate than decline — collapses
//     outrun recoveries, as they do in life.
//   · Rediscovery is rare on purpose: capped at one per in-game decade
//     system-wide, gated on a cooling trend and the species' whitelist
//     flag. Reserved for real Lazarus taxa (coelacanth, Wollemi pine,
//     saola, night parrot…) so it never reads as bunny-magic optimism.
//   · The news queue drip-feeds announcements one per tick, so a bad year
//     that steps three species at once doesn't collapse into a single
//     banger of a headline — each species gets its own beat.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { logDispatch } from '../model/Dispatches.js';
import {
  SPECIES,
  SPECIES_BY_ID,
  STATUS_LABELS,
  TAXON_EMOJI,
  statusRank,
  worseStatus,
  betterStatus,
} from '../data/species.js';

// Tuning. Edit here, not in the hot loop.
const CFG = {
  // Decline chance per year at 1.0 pressure. Scales linearly with pressure.
  // At +2°C over anchor with sensitivity 1.0, a species rolls 0.12 to slide
  // — expected slide once per ~8 game years under sustained pressure.
  declineRatePerYear: 0.12,
  // Pressure below this is treated as zero — stops tiny thermal wobble from
  // poking the dice every year for a LC generalist.
  declinePressureFloor: 0.15,
  // Recovery runs when temp < anchor by at least this much. Slower rate
  // than decline on purpose — extinction risk is sticky.
  recoveryReliefThresholdC: 0.20,
  recoveryRatePerYear: 0.04,
  // Rediscovery — extremely rare. Requires: (a) rediscoverable flag,
  // (b) currentStatus in {EW, EX}, (c) cooling trend (recentTemp < peak by
  // relief threshold), (d) a system-wide cooldown so we never stack two
  // rediscoveries in the same decade. One in a playthrough is common, two
  // is surprising, three is a gift.
  rediscoverRatePerYear: 0.03,
  rediscoverCooldownTicks: 40,  // ~10 game years at 4 ticks/year
  // Announcement queue — species changes drip into the ticker one per tick
  // so a bad year doesn't flatten six items into one unreadable beat.
  maxQueueDrainPerTick: 1,
  // Tempo of full status checks. Once per game year keeps the signal low.
  checkEveryTicks: 4,
};

export class SpeciesSystem {
  constructor(state, bus) {
    this.s = state;
    this.b = bus;
    this._unsub = bus.on(EVT.TICK, () => this.tick());
    ensureBiodiversity(state);
  }

  destroy() {
    this._unsub?.();
    this._unsub = null;
  }

  tick() {
    const s = this.s;
    ensureBiodiversity(s);
    const bio = s.biodiversity;

    // Drain one queued announcement per tick so the ticker doesn't get
    // flattened when multiple species step at once.
    this._drainQueue();

    // Only run the full scan on year boundaries. Cheap otherwise.
    if (s.meta.tick < BALANCE.eventStartupGraceTicks) return;
    if (s.meta.tick - bio.lastCheckTick < CFG.checkEveryTicks) return;
    bio.lastCheckTick = s.meta.tick;

    this._runScan(bio);
  }

  _runScan(bio) {
    const s = this.s;
    const rng = s.meta.rng;
    const temp = s.world.tempAnomalyC;
    // Track running peak; recovery and rediscovery gate on how far we've
    // climbed down from it.
    if (temp > bio.peakTemp) bio.peakTemp = temp;

    for (const rec of bio.species) {
      const def = SPECIES_BY_ID[rec.id];
      if (!def) continue;  // stale id from an old save — skip silently

      // 1. Decline — runs when pressure is meaningfully positive. EW is not
      // a terminal state: captive populations can still fail, so EW → EX is
      // a real step under sustained pressure. Only EX is a floor.
      const pressure = (temp - rec.tempAnchor) * def.tempSensitivity;
      if (pressure > CFG.declinePressureFloor && rec.status !== 'EX') {
        const chance = Math.min(0.9, CFG.declineRatePerYear * pressure);
        if (rng.random() < chance) {
          const next = worseStatus(rec.status);
          if (next !== rec.status) {
            this._applyChange(rec, def, rec.status, next, temp, 'decline');
            continue;  // one step per species per year
          }
        }
      }

      // 2. Recovery — runs when temp has fallen below the anchor. Skips
      //    species already at LC and skips EX (those go via rediscovery).
      const relief = rec.tempAnchor - temp;
      if (relief > CFG.recoveryReliefThresholdC
          && rec.status !== 'LC'
          && rec.status !== 'EX'
          && rec.status !== 'EW') {
        const chance = Math.min(0.5, CFG.recoveryRatePerYear * relief * def.tempSensitivity);
        if (rng.random() < chance) {
          const next = betterStatus(rec.status);
          if (next !== rec.status) {
            this._applyChange(rec, def, rec.status, next, temp, 'recovery');
            continue;
          }
        }
      }

      // 3. Rediscovery — EX/EW only, whitelist only, cooling trend only,
      //    and throttled by a system-wide cooldown.
      if (def.rediscoverable
          && (rec.status === 'EX' || rec.status === 'EW')
          && (bio.peakTemp - temp) > CFG.recoveryReliefThresholdC
          && (s.meta.tick - bio.lastRediscoveryTick) >= CFG.rediscoverCooldownTicks) {
        const chance = CFG.rediscoverRatePerYear;
        if (rng.random() < chance) {
          this._applyChange(rec, def, rec.status, 'CR', temp, 'rediscovery');
          bio.lastRediscoveryTick = s.meta.tick;
          rec.rediscovered = true;
        }
      }
    }
  }

  _applyChange(rec, def, prevStatus, nextStatus, temp, kind) {
    rec.status = nextStatus;
    rec.tempAnchor = temp;
    rec.lastChangeTick = this.s.meta.tick;

    const payload = { def, prevStatus, nextStatus, kind };
    this.b.emit(EVT.SPECIES_STATUS_CHANGED, payload);
    if (nextStatus === 'EX') this.b.emit(EVT.SPECIES_EXTINCT, payload);
    if (kind === 'rediscovery') this.b.emit(EVT.SPECIES_REDISCOVERED, payload);

    // Queue the announcement — NewsSystem actually writes the headline
    // when it drains, one per tick.
    this.s.biodiversity.queue.push(payload);
    // Significant transitions (extinction, rediscovery) also go to the
    // dispatches log so the player can revisit them later. Status slides
    // in either direction are noisy enough that the ticker is the right
    // home; we don't want to bloat the dispatch feed with every rung.
    if (nextStatus === 'EX' || kind === 'rediscovery') {
      const emoji = TAXON_EMOJI[def.taxon] || '';
      logDispatch(this.s, this.b, {
        kind: 'event',
        category: 'species',
        title: kind === 'rediscovery'
          ? `${emoji} ${def.name} rediscovered`
          : `${emoji} ${def.name} extinct`,
        body: kind === 'rediscovery'
          ? `A population of ${def.name} (${def.scientific}) has been confirmed in ${def.region}. Thought lost — the record is amended.`
          : `${def.name} (${def.scientific}) is declared extinct. No individuals have been observed in ${def.region} in years.`,
        detail: `Status: ${STATUS_LABELS[prevStatus]} → ${STATUS_LABELS[nextStatus]}`,
        tone: kind === 'rediscovery' ? 'good' : 'bad',
      });
    }
  }

  _drainQueue() {
    const bio = this.s.biodiversity;
    if (!bio.queue.length) return;
    // The NewsSystem subscribes to SPECIES_STATUS_CHANGED directly and
    // composes its own headlines, so the queue here only exists to rate-
    // limit when the scan emits multiple at once. We re-emit with a
    // `drained: true` tag so NewsSystem knows to actually publish (vs.
    // the live emit, which it ignores).
    const batch = bio.queue.splice(0, CFG.maxQueueDrainPerTick);
    for (const payload of batch) {
      this.b.emit(EVT.SPECIES_STATUS_CHANGED, { ...payload, drained: true });
    }
  }
}

// Bootstrap / back-fill. Callable from SpeciesSystem constructor AND from
// saveLoad.deserialize() forward-compat block — idempotent either way.
export function ensureBiodiversity(state) {
  if (state.biodiversity && Array.isArray(state.biodiversity.species) && state.biodiversity.species.length) {
    return state.biodiversity;
  }
  state.biodiversity = {
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
  };
  return state.biodiversity;
}

// Pure helper for tests + UI — derives a sparkline-friendly summary over
// the roster. Not used by the tick loop itself.
export function biodiversitySummary(state) {
  const bio = state.biodiversity;
  if (!bio) return { total: 0, extinct: 0, threatened: 0, healthy: 0 };
  let extinct = 0, threatened = 0, healthy = 0;
  for (const rec of bio.species) {
    const r = statusRank(rec.status);
    if (rec.status === 'EX' || rec.status === 'EW') extinct++;
    else if (r >= statusRank('VU')) threatened++;
    else healthy++;
  }
  return { total: bio.species.length, extinct, threatened, healthy };
}
