// Advisory Board orchestrator. Each tick:
//   1. Update telemetry (deploy log, mood derivation).
//   2. Drive each advisor's agenda lifecycle: propose → track → resolve.
//   3. Roll for a council conflict if conditions allow.
//   4. Fire crisis whispers when tipping-point guards are close to triggering.
//   5. Bookkeep ability cooldowns + deploy-discount windows.
//
// All reward side-effects flow through a small dispatcher here so the
// possible effect kinds (credits, willAll, willHome, researchDiscount,
// stressRelief, spawnBurst, deployDiscount, adoptionBoost, freeDeploys) have
// exactly one application path. Events ops from events.js are reused for
// conflict effect arrays.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { ADVISOR_IDS, ABILITIES, CONFLICT_POOL, WHISPER_MAP, ADVISOR_ARCHETYPES } from '../data/advisors.js';
import { deriveMood, commentaryFor, pickAgenda, agendaProgress, agendaDef, clampInfluence, resolveAdvisor } from '../model/Advisors.js';
import { applyEffects } from '../model/Events.js';

export class AdvisorSystem {
  constructor(state, bus) {
    this.s = state;
    this.b = bus;
    this._moodLastChangeTick = Object.fromEntries(ADVISOR_IDS.map(id => [id, -999]));
    this._unsubs = [];
    this._unsubs.push(bus.on(EVT.TICK, () => this.step()));
    this._unsubs.push(bus.on(EVT.DEPLOYED, () => this._onDeploy()));
    this._unsubs.push(bus.on(EVT.COLLECTABLE_CLAIMED, () => this._onCollectable()));
  }

  destroy() { this._unsubs.forEach(u => u?.()); this._unsubs = []; }

  // ─── Telemetry ──────────────────────────────────────────────────────────
  _onDeploy() {
    const a = this.s.advisors;
    if (!a) return;
    a.telemetry.deployLog.push(this.s.meta.tick);
    const horizon = this.s.meta.tick - BALANCE.advisor.deployLogWindow;
    while (a.telemetry.deployLog.length && a.telemetry.deployLog[0] < horizon) {
      a.telemetry.deployLog.shift();
    }
  }
  _onCollectable() {
    if (this.s.advisors) this.s.advisors.telemetry.collectablesClaimed += 1;
  }

  recentDeploys() {
    const log = this.s.advisors?.telemetry?.deployLog ?? [];
    return log.length;
  }

  // ─── Main tick ─────────────────────────────────────────────────────────
  step() {
    if (this.s.meta.status !== 'running') return;
    const advisors = this.s.advisors;
    if (!advisors) return;

    // Tick-down deploy-discount window.
    if (advisors.deployDiscount?.count > 0 && advisors.deployDiscount.pct > 0) {
      // No tick-based decay here — the counter decrements on actual deploy
      // via AdoptionSystem → applyDeployDiscount hook. This is intentional.
    }

    // Update every seat.
    for (const id of ADVISOR_IDS) {
      const seat = advisors.seats[id];
      if (!seat) continue;
      this._updateMood(seat);
      this._updateAgenda(seat);
    }

    // Council conflicts + whispers.
    this._maybeFireConflict();
    this._maybeFireWhisper();
  }

  _updateMood(seat) {
    const archetype = ADVISOR_ARCHETYPES[seat.id];
    if (!archetype) return;
    const telemetry = { recentDeploys: this.recentDeploys() };
    const mood = deriveMood(archetype, this.s, telemetry);
    if (mood !== seat.mood) {
      const last = this._moodLastChangeTick[seat.id] ?? -999;
      if (this.s.meta.tick - last < BALANCE.advisor.moodHysteresisTicks) return;
      seat.mood = mood;
      seat.commentary = commentaryFor(archetype, mood, this.s.meta.rng);
      this._moodLastChangeTick[seat.id] = this.s.meta.tick;
      this.b.emit(EVT.ADVISOR_MOOD_CHANGED, { id: seat.id, mood });
    } else if (this.s.meta.tick % 6 === 0) {
      // Occasionally refresh the commentary line so it doesn't feel frozen.
      seat.commentary = commentaryFor(archetype, mood, this.s.meta.rng);
    }
  }

  _updateAgenda(seat) {
    const now = this.s.meta.tick;
    // No agenda — try to propose one.
    if (!seat.agenda) {
      if (now < BALANCE.advisor.firstProposalTick) return;
      if (now < (seat.cooldownUntilTick ?? 0)) return;
      const agenda = pickAgenda(seat.id, this.s);
      if (agenda) {
        seat.agenda = agenda;
        this.b.emit(EVT.ADVISOR_AGENDA_PROPOSED, { id: seat.id, agenda });
      }
      return;
    }
    // Tracked agenda — check progress / deadline.
    const progress = agendaProgress(seat.id, seat.agenda, this.s);
    if (progress >= 1) {
      this._resolveAgenda(seat, true, progress);
      return;
    }
    if (now >= seat.agenda.deadline) {
      this._resolveAgenda(seat, false, progress);
    }
  }

  _resolveAgenda(seat, won, progress) {
    const def = agendaDef(seat.id, seat.agenda.id);
    if (!def) { seat.agenda = null; return; }

    const now = this.s.meta.tick;
    const cd = won ? BALANCE.advisor.cooldownOnWin : BALANCE.advisor.cooldownOnFail;
    const delta = won ? BALANCE.advisor.influenceOnWin : BALANCE.advisor.influenceOnFail;
    seat.influence = clampInfluence(seat.influence + delta);
    seat.cooldownUntilTick = now + cd;

    if (won) this._applyReward(def.reward, seat.id);

    this.b.emit(EVT.ADVISOR_AGENDA_RESOLVED, {
      id: seat.id, won, progress,
      agendaId: seat.agenda.id,
      reward: won ? def.reward : null,
    });
    seat.agenda = null;
  }

  // ─── Reward dispatcher ─────────────────────────────────────────────────
  // `advisorId` is optional — used by kinds that care about bias branches.
  _applyReward(reward, advisorId) {
    if (!reward) return;
    const s = this.s;
    const archetype = advisorId ? ADVISOR_ARCHETYPES[advisorId] : null;
    switch (reward.kind) {
      case 'credits':
        s.world.climatePoints += reward.value ?? 0;
        break;
      case 'researchDiscount':
        s.world.researchDiscountPct = Math.max(s.world.researchDiscountPct || 0, reward.pct ?? 0.2);
        s.world.researchDiscountTicksRemaining = Math.max(
          s.world.researchDiscountTicksRemaining || 0,
          reward.ticks ?? 4,
        );
        break;
      case 'willAll':
        for (const c of Object.values(s.countries)) {
          c.politicalWill = Math.max(10, Math.min(100, (c.politicalWill ?? 50) + (reward.value ?? 0)));
        }
        break;
      case 'willHome': {
        const c = s.countries[s.meta.homeCountryId];
        if (c) c.politicalWill = Math.max(10, Math.min(100, (c.politicalWill ?? 50) + (reward.value ?? 0)));
        break;
      }
      case 'stressRelief':
        s.world.societalStress = Math.max(0, (s.world.societalStress || 0) - (reward.value ?? 0));
        if (reward.extraCredits) s.world.climatePoints += reward.extraCredits;
        break;
      case 'spawnBurst':
        // Reuse the collectable system's spawn hook via a transient flag; the
        // CollectableSystem reads + clears this each tick (we'll wire the
        // flag there). For now, top up a pending spawn count.
        s.advisors._pendingSpawn = (s.advisors._pendingSpawn || 0) + (reward.count ?? 1);
        break;
      case 'deployDiscount':
        s.advisors.deployDiscount = {
          pct: Math.max(s.advisors.deployDiscount?.pct ?? 0, reward.value ?? 0.2),
          count: Math.max(s.advisors.deployDiscount?.count ?? 0, reward.count ?? 3),
        };
        break;
      case 'adoptionBoost': {
        const c = s.countries[s.meta.homeCountryId];
        if (!c) break;
        const branches = archetype?.biasBranches ?? ['industry', 'transport'];
        for (const b of branches) {
          c.adoption[b] = Math.min(1, (c.adoption[b] ?? 0) + (reward.value ?? 0.03));
        }
        break;
      }
      case 'freeDeploys':
        s.advisors.freeDeploys = (s.advisors.freeDeploys || 0) + (reward.count ?? 1);
        break;
      default:
        // Unknown reward kinds are silently ignored — tests will catch typos.
        break;
    }
  }

  // ─── Conflicts ─────────────────────────────────────────────────────────
  _maybeFireConflict() {
    const s = this.s;
    const now = s.meta.tick;
    const advisors = s.advisors;
    if (!advisors) return;
    if (s.activeEvents?.length) return;                   // don't compete with events
    if (now - (advisors.lastConflictTick ?? -999) < BALANCE.advisor.conflictMinTickGap) return;
    if (s.meta.rng.random() > BALANCE.advisor.conflictBaseChance) return;

    const eligible = CONFLICT_POOL.filter(c => {
      return c.between.every(id => (advisors.seats[id]?.influence ?? 0) >= BALANCE.advisor.conflictMinInfluence);
    });
    if (!eligible.length) return;
    const chosen = s.meta.rng.pick(eligible);
    if (!chosen) return;

    // Materialize as an interactive event so EventModal can present it.
    // The headline is kept pure — it describes the *situation*, not the
    // advisors. Advisor stances travel on `_advisorStances` so the modal can
    // render them in a dedicated section.
    const [aId, bId] = chosen.between;
    const aSeat = advisors.seats[aId];
    const bSeat = advisors.seats[bId];
    const makeStance = (advisorId, seat) => ({
      advisorId,
      name: seat?.name ?? advisorId,
      title: seat?.title ?? '',
      portrait: seat?.portrait ?? '',
      color: seat?.color ?? '#999',
      stance: chosen.sides[advisorId]?.stance ?? '',
    });
    const evt = {
      id: `advisor_conflict_${chosen.id}_${now}`,
      interactive: true,
      _advisorConflict: chosen.id,
      _advisorStances: [makeStance(aId, aSeat), makeStance(bId, bSeat)],
      title: chosen.title,
      headline: chosen.headline,
      choices: [
        {
          key: aId,
          label: chosen.sides[aId]?.label ?? aSeat.title,
          effects: chosen.sides[aId]?.effects ?? [],
          _researchDiscount: chosen.sides[aId]?.researchDiscount ?? null,
          _advisorWinner: aId,
          _advisorLoser:  bId,
          _advisorHint:   aSeat.name,
          headline: `${aSeat.name} prevails.`,
          tone: 'info',
        },
        {
          key: bId,
          label: chosen.sides[bId]?.label ?? bSeat.title,
          effects: chosen.sides[bId]?.effects ?? [],
          _researchDiscount: chosen.sides[bId]?.researchDiscount ?? null,
          _advisorWinner: bId,
          _advisorLoser:  aId,
          _advisorHint:   bSeat.name,
          headline: `${bSeat.name} prevails.`,
          tone: 'info',
        },
      ],
    };
    s.activeEvents.push({ ...evt, firedTick: now, _ctx: {} });
    advisors.lastConflictTick = now;
    this.b.emit(EVT.ADVISOR_CONFLICT, { conflictId: chosen.id, between: chosen.between });
    this.b.emit(EVT.EVENT_FIRED, { event: evt, headline: evt.headline, tone: 'info' });
  }

  // Called by EventSystem when a conflict choice resolves so we can apply
  // influence deltas + any extra payloads (research discount on the chosen
  // side). Receives the resolved choice object.
  resolveConflictChoice(choice) {
    if (!choice?._advisorWinner) return;
    const a = this.s.advisors;
    const winner = a?.seats?.[choice._advisorWinner];
    const loser  = a?.seats?.[choice._advisorLoser];
    if (winner) winner.influence = clampInfluence(winner.influence + BALANCE.advisor.influenceOnConflictWin);
    if (loser)  loser.influence  = clampInfluence(loser.influence  + BALANCE.advisor.influenceOnConflictLoss);
    // Extra payload: conflicts can ride a research-discount window with the
    // picked side (treated same as the reward dispatcher).
    const rd = choice._researchDiscount;
    if (rd) {
      this.s.world.researchDiscountPct = Math.max(this.s.world.researchDiscountPct || 0, rd.pct ?? 0.15);
      this.s.world.researchDiscountTicksRemaining = Math.max(
        this.s.world.researchDiscountTicksRemaining || 0,
        rd.ticks ?? 4,
      );
    }
  }

  // ─── Whispers ──────────────────────────────────────────────────────────
  _maybeFireWhisper() {
    const s = this.s;
    const advisors = s.advisors;
    if (!advisors) return;
    const temp = s.world.tempAnomalyC;
    for (const [eventId, def] of Object.entries(WHISPER_MAP)) {
      if (advisors.whisperedEventIds.includes(eventId)) continue;
      if (temp < def.lookaheadTempC) continue;
      advisors.whisperedEventIds.push(eventId);
      const seat = advisors.seats[def.advisor];
      this.b.emit(EVT.ADVISOR_WHISPER, {
        id: def.advisor,
        name: seat?.name ?? '',
        text: def.text,
        forEventId: eventId,
      });
      // Only fire one whisper per tick.
      return;
    }
  }

  // ─── Abilities (player-triggered) ──────────────────────────────────────
  canUseAbility(advisorId) {
    const seat = this.s.advisors?.seats?.[advisorId];
    if (!seat) return false;
    if (seat.influence < BALANCE.advisor.abilityInfluenceThreshold) return false;
    if (this.s.meta.tick < (seat.abilityReadyAtTick ?? 0)) return false;
    return true;
  }

  useAbility(advisorId) {
    if (!this.canUseAbility(advisorId)) return false;
    const ability = ABILITIES[ADVISOR_ARCHETYPES[advisorId]?.abilityId];
    if (!ability) return false;
    const seat = this.s.advisors.seats[advisorId];
    this._applyReward(ability.effect, advisorId);
    seat.abilityReadyAtTick = this.s.meta.tick + (ability.cooldownTicks ?? 20);
    this.b.emit(EVT.ADVISOR_ABILITY_USED, { id: advisorId, abilityId: ability.id });
    return true;
  }
}

// ─── Hooks other systems call ─────────────────────────────────────────────

// Two-step deploy-cost hook. AdoptionSystem first calls previewDeployCost to
// see what the player would actually pay (free? discounted?), checks
// affordability, and only calls commitDeployCost after the charge succeeds.
export function previewAdvisorDeployCost(state, cost) {
  const a = state.advisors;
  if (!a) return { cost, tag: 'normal' };
  if (a.freeDeploys > 0)                                 return { cost: 0, tag: 'free' };
  if (a.deployDiscount?.count > 0 && a.deployDiscount.pct > 0) {
    return { cost: Math.max(0, cost * (1 - a.deployDiscount.pct)), tag: 'discount' };
  }
  return { cost, tag: 'normal' };
}
export function commitAdvisorDeployCost(state, tag) {
  const a = state.advisors;
  if (!a) return;
  if (tag === 'free') a.freeDeploys = Math.max(0, a.freeDeploys - 1);
  else if (tag === 'discount' && a.deployDiscount) {
    a.deployDiscount.count = Math.max(0, a.deployDiscount.count - 1);
  }
}

// CollectableSystem drains this each tick to spawn extras from agendas or
// the Activist's Rally ability. Returns the number to spawn this tick.
export function advisorConsumePendingSpawns(state) {
  const a = state.advisors;
  if (!a || !a._pendingSpawn) return 0;
  const n = a._pendingSpawn;
  a._pendingSpawn = 0;
  return n;
}

// Reflavor an unresolved conflict event after a save/load — the effect
// payloads serialize fine (they're plain data), but the headline etc. were
// generated from advisor names that may have changed. For v1 we drop open
// conflicts on load (same as generic events — see saveLoad.js).
