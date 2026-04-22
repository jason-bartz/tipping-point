// Random events orchestrator. Every tick, roll against
// BALANCE.eventFireChancePerTick. On a hit, filter EVENT_POOL by guards (and
// target feasibility), then weighted-pick. All randomness flows through
// state.meta.rng so replays and saves stay deterministic-ish.
//
// All side effects of an event route through applyEffects() in
// src/model/Events.js (pure data → state writes). The event schema still
// supports an imperative `apply` escape hatch for edge cases that aren't
// worth expressing as ops; when both are present, effects run first, then
// apply.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { EVENT_POOL } from '../data/events.js';
import { applyEffects } from '../model/Events.js';
import { summarizeEffects } from '../model/EffectsSummary.js';

export class EventSystem {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.advisorSystem = null; // wired after construction by main.js
    this._unsub = bus.on(EVT.TICK, () => {
      this.drainEchoes();
      // Expire timed-out pending decisions first — they should clear out
      // before we roll a new interactive, otherwise the player's queue can
      // pile up with expired placeholders.
      this.expirePending();
      // Interactive track runs first — if it fires, the passive track sits
      // out this tick so we never stack a modal on top of a news beat. The
      // IPCC cadence is the last preference and only fires if neither of
      // the other two tracks took this tick.
      if (this.rollInteractive()) return;
      if (this.rollPassive()) return;
      this.rollIpcc();
    });
  }

  setAdvisorSystem(advisorSystem) { this.advisorSystem = advisorSystem; }

  destroy() { this._unsub?.(); this._unsub = null; }

  // Fire any scheduled echo-news items whose dueTick has arrived. Echoes are
  // looked up from the live EVENT_POOL at fire time (not serialized), so the
  // queue stays plain data and headline functions can read current state.
  drainEchoes() {
    const s = this.state;
    const queue = s.meta.pendingEchoes;
    if (!queue?.length) return;
    const ready = [];
    const kept  = [];
    for (const item of queue) {
      if (item.dueTick <= s.meta.tick) ready.push(item);
      else kept.push(item);
    }
    if (!ready.length) return;
    s.meta.pendingEchoes = kept;

    for (const item of ready) {
      const evtDef = EVENT_POOL.find(e => e.id === item.eventId);
      const choice = evtDef?.choices?.find(c => c.key === item.choiceKey);
      const echo = choice?.echo;
      if (!echo) continue;
      const ctx = item.targetId ? { target: s.countries[item.targetId] } : {};
      const headline = typeof echo.headline === 'function' ? echo.headline(s, ctx) : echo.headline;
      if (!headline) continue;
      const tone = echo.tone ?? choice?.tone ?? 'info';

      // Back-fill the decision record so the win screen can show what the
      // choice actually led to in-universe.
      const record = s.meta.decisions?.find(d => d.id === item.decisionId);
      if (record) record.echoHeadline = headline;

      this.bus.emit(EVT.EVENT_FIRED, {
        event: { id: `${item.eventId}_echo`, title: evtDef?.title ?? '' },
        headline,
        tone,
      });
    }
  }

  // Combined pipeline — same as the tick handler's roll: interactive track
  // first, passive only if interactive didn't fire. Kept so tests + any
  // future caller that wants "run the director once" has one entry point.
  roll() {
    if (this.rollInteractive()) return true;
    return !!this.rollPassive();
  }

  // Passive (news-flavor) track. Picks a non-interactive event per the base
  // fire chance, subject to startup grace + min-gap.
  rollPassive() {
    const s = this.state;
    const rng = s.meta.rng;

    if (s.meta.tick < (BALANCE.eventStartupGraceTicks ?? 0)) return false;
    if (s.activeEvents?.length) return false;
    const lastEventTick = s.meta.lastEventTick ?? -999;
    if (s.meta.tick - lastEventTick < (BALANCE.eventMinGapTicks ?? 0)) return false;
    if (rng.random() > BALANCE.eventFireChancePerTick) return false;

    const eligible = EVENT_POOL.filter(e => {
      if (e.interactive) return false;                 // interactive track owns these
      if (e.guard && !e.guard(s)) return false;
      if (e.target && !e.target(s, rng)) return false;
      return true;
    });
    if (!eligible.length) return false;

    const chosen = rng.weightedPick(eligible);
    if (!chosen) return false;
    return this._fire(chosen, false);
  }

  // Interactive-decision track. Independent cadence: after the min-gap elapses
  // we roll each tick at interactiveChancePerTick; once max-gap elapses we
  // force the next eligible interactive so the player is never decision-starved.
  rollInteractive() {
    const s = this.state;
    const rng = s.meta.rng;

    if (s.meta.tick < (BALANCE.eventStartupGraceTicks ?? 0)) return false;
    if (s.activeEvents?.length) return false;
    const lastTick = s.meta.lastInteractiveTick ?? -999;
    const ticksSince = s.meta.tick - lastTick;
    if (ticksSince < (BALANCE.interactiveMinGapTicks ?? 0)) return false;
    const forced = ticksSince >= (BALANCE.interactiveMaxGapTicks ?? Infinity);
    if (!forced && rng.random() > (BALANCE.interactiveChancePerTick ?? 0)) return false;

    const eligible = EVENT_POOL.filter(e => {
      if (!e.interactive) return false;
      if (e.guard && !e.guard(s)) return false;
      if (e.target && !e.target(s, rng)) return false;
      return true;
    });
    if (!eligible.length) return false;

    // Exclude recently-fired interactives so the player doesn't see the same
    // decision back-to-back. Fall back to the unfiltered list if the window
    // would starve the pool — variety is preferred, but "no decision at all"
    // is worse than a repeat.
    const recent = new Set(s.meta.recentInteractiveIds ?? []);
    const fresh = eligible.filter(e => !recent.has(e.id));
    const pool = fresh.length ? fresh : eligible;

    const chosen = rng.weightedPick(pool);
    if (!chosen) return false;
    return this._fire(chosen, true);
  }

  // IPCC cadence track. Every BALANCE.ipccCadenceTicks the director force-
  // picks an IPCC-tagged event, giving the game a recognizable "report drops"
  // rhythm. Respects the same startup grace + active-event gate; skipped
  // silently if no ipcc events happen to be eligible (e.g. all guarded out).
  rollIpcc() {
    const s = this.state;
    const rng = s.meta.rng;
    const cadence = BALANCE.ipccCadenceTicks ?? 0;
    if (!cadence) return false;
    if (s.meta.tick < (BALANCE.eventStartupGraceTicks ?? 0)) return false;
    if (s.activeEvents?.length) return false;
    const lastTick = s.meta.lastIpccTick ?? -999;
    if (s.meta.tick - lastTick < cadence) return false;

    const eligible = EVENT_POOL.filter(e => {
      if (!e.ipcc) return false;
      if (e.interactive) return false;
      if (e.guard && !e.guard(s)) return false;
      if (e.target && !e.target(s, rng)) return false;
      return true;
    });
    if (!eligible.length) return false;

    const chosen = rng.weightedPick(eligible);
    if (!chosen) return false;
    s.meta.lastIpccTick = s.meta.tick;
    return this._fire(chosen, false);
  }

  // Shared fire path for both tracks. Resolves title/headline, pushes an
  // interactive event onto activeEvents or applies a passive event's effects
  // inline, bumps the appropriate last-fired tick, and emits EVT.EVENT_FIRED.
  _fire(chosen, isInteractiveTrack) {
    const s = this.state;
    const rng = s.meta.rng;

    const ctx = { target: chosen.target ? chosen.target(s, rng) : null };
    if (chosen.target && !ctx.target) return false; // target vanished between filter + pick

    const headline = typeof chosen.headline === 'function' ? chosen.headline(s, ctx) : chosen.headline;
    const title    = typeof chosen.title    === 'function' ? chosen.title(s, ctx)    : chosen.title;

    let expiresAtTick = null;
    if (chosen.interactive) {
      // expiresAtTick = firedTick + (per-event override or default). The
      // event can set `timeoutTicks: Infinity` to opt out, but by default
      // every decision has a clock — inaction has consequences. Clamp the
      // minimum to 1 so an accidental 0 doesn't expire the event on the
      // very next tick before the player sees it.
      const rawTtl = chosen.timeoutTicks ?? BALANCE.decisionTimeoutTicks ?? 6;
      const ttl = Number.isFinite(rawTtl) ? Math.max(1, rawTtl) : rawTtl;
      expiresAtTick = Number.isFinite(ttl) ? s.meta.tick + ttl : null;
      const evt = { ...chosen, firedTick: s.meta.tick, expiresAtTick, title, headline, _ctx: ctx };
      enrichAdvisorStances(s, evt);
      s.activeEvents.push(evt);
    } else {
      applyEffects(s, chosen.effects, ctx);
      if (chosen.apply) chosen.apply(s, ctx);
    }

    s.meta.lastEventTick = s.meta.tick;
    if (isInteractiveTrack) {
      s.meta.lastInteractiveTick = s.meta.tick;
      // Record on the recency ring buffer so the next roll can avoid a
      // repeat. Trim from the front to keep the window bounded.
      s.meta.recentInteractiveIds ||= [];
      s.meta.recentInteractiveIds.push(chosen.id);
      const windowSize = BALANCE.interactiveRecencyWindow ?? 0;
      while (s.meta.recentInteractiveIds.length > windowSize) {
        s.meta.recentInteractiveIds.shift();
      }
    }

    // Pass expiresAtTick through the bus payload so UI layers (dispatch
    // card, toast) can surface the countdown without peeking at activeEvents.
    this.bus.emit(EVT.EVENT_FIRED, {
      event: { ...chosen, title, expiresAtTick },
      headline,
      tone: chosen.tone ?? 'neutral',
    });
    return true;
  }

  // Walk the active-events queue and expire any whose clock has run out.
  // Expiration applies a penalty (author-supplied via `onExpire`, else the
  // default from BALANCE) and emits DECISION_EXPIRED so the UI can update
  // dispatches + toast + decisions log.
  expirePending() {
    const s = this.state;
    if (!s.activeEvents?.length) return;
    const now = s.meta.tick;
    const kept = [];
    const expired = [];
    for (const evt of s.activeEvents) {
      if (evt.interactive && evt.expiresAtTick != null && now >= evt.expiresAtTick) {
        expired.push(evt);
      } else {
        kept.push(evt);
      }
    }
    if (!expired.length) return;
    s.activeEvents = kept;
    for (const evt of expired) this._expire(evt);
  }

  _expire(evt) {
    const s = this.state;

    // Advisor-conflict events don't carry onExpire logic today; a timeout
    // just drops the conflict and takes the default world penalty (same
    // as any other uncommitted decision).
    let summaryOverride = null;
    if (Array.isArray(evt.onExpire)) {
      applyEffects(s, evt.onExpire, evt._ctx);
    } else if (typeof evt.onExpire === 'function') {
      const maybe = evt.onExpire(s, evt._ctx);
      if (typeof maybe === 'string') summaryOverride = maybe;
    } else {
      // Default penalty: drain political will on the target (or all
      // countries if the event is global), plus a world stress bump.
      const willHit = BALANCE.decisionExpirePoliticalWillHit ?? 8;
      const stressHit = BALANCE.decisionExpireSocietalStress ?? 3;
      const targetCountry = evt._ctx?.target;
      if (targetCountry) {
        applyEffects(s, [
          { op: 'addTarget', field: 'politicalWill', value: -willHit },
          { op: 'addWorld',  field: 'societalStress', value: stressHit },
        ], evt._ctx);
        summaryOverride = `${targetCountry.name}: -${willHit} Will · World stress +${stressHit}`;
      } else {
        const spread = Math.round(willHit * 0.5);
        applyEffects(s, [
          { op: 'addAllCountries', field: 'politicalWill', value: -spread },
          { op: 'addWorld',        field: 'societalStress', value: stressHit },
        ], evt._ctx);
        summaryOverride = `All countries: -${spread} Will · World stress +${stressHit}`;
      }
    }

    // Log to the player's decision history so the end-screen recap shows
    // inaction alongside explicit choices. Use a synthetic "Did nothing"
    // choice label so the attribution reads honestly.
    if (!evt._advisorConflict) {
      s.meta.decisions ||= [];
      s.meta.decisions.push({
        id: s.meta.decisions.length,
        tick: s.meta.tick,
        year: s.meta.year,
        quarter: s.meta.quarter,
        eventId: evt.id,
        title: evt.title,
        choiceKey: '__expired__',
        choiceLabel: 'Did nothing',
        choiceHeadline: 'The moment passed unanswered.',
        effectsSummary: summaryOverride ?? 'Consequences absorbed.',
        tone: 'bad',
        echoHeadline: null,
        expired: true,
      });
    }

    this.bus.emit(EVT.DECISION_EXPIRED, {
      eventId: evt.id,
      title: evt.title,
      effectsSummary: summaryOverride ?? 'Consequences absorbed.',
      tone: 'bad',
    });
  }

  resolve(eventId, choiceKey) {
    const s = this.state;
    const idx = s.activeEvents.findIndex(e => e.id === eventId);
    if (idx === -1) return;
    const [evt] = s.activeEvents.splice(idx, 1);
    const choice = evt.choices?.find(c => c.key === choiceKey);
    if (!choice) return;
    applyEffects(s, choice.effects, evt._ctx);
    if (choice.apply) choice.apply(s, evt._ctx);
    // Advisor-conflict bookkeeping (influence deltas, optional discount rider).
    if (evt._advisorConflict && this.advisorSystem) {
      this.advisorSystem.resolveConflictChoice(choice);
    }
    const choiceHeadline = typeof choice.headline === 'function' ? choice.headline(s, evt._ctx) : choice.headline;

    // Build a concrete, player-facing summary of the immediate effects.
    // Authors can attach `summaryOverride` on choices that use the imperative
    // apply() hook (where the ops list alone would be misleading).
    const autoSummary = summarizeEffects(choice.effects, evt._ctx, s.countries);
    const effectsSummary = choice.summaryOverride
      ? [choice.summaryOverride, autoSummary].filter(Boolean).join(' · ')
      : autoSummary;

    // Advisor conflicts are dynamic events — not worth logging as player
    // "decisions" in the win-screen history. Only pool events get recorded.
    const isPoolEvent = !evt._advisorConflict;
    if (isPoolEvent) {
      s.meta.decisions ||= [];
      const decisionId = s.meta.decisions.length;
      s.meta.decisions.push({
        id: decisionId,
        tick: s.meta.tick,
        year: s.meta.year,
        quarter: s.meta.quarter,
        eventId: evt.id,
        title: evt.title,
        choiceKey: choice.key,
        choiceLabel: choice.label,
        choiceHeadline,
        effectsSummary,
        tone: choice.tone ?? 'neutral',
        echoHeadline: null,
      });

      if (choice.echo?.delayTicks > 0) {
        s.meta.pendingEchoes ||= [];
        s.meta.pendingEchoes.push({
          dueTick: s.meta.tick + choice.echo.delayTicks,
          eventId: evt.id,
          choiceKey: choice.key,
          decisionId,
          targetId: evt._ctx?.target?.id ?? null,
        });
      }
    }

    this.bus.emit(EVT.EVENT_FIRED, { event: evt, headline: choiceHeadline, tone: choice.tone ?? 'neutral' });
    // Separate signal for UI layers that want the concrete "what just changed"
    // rather than the flavor headline. Main wires this to a toast.
    this.bus.emit(EVT.DECISION_RESOLVED, {
      eventId: evt.id,
      title: evt.title,
      choiceLabel: choice.label,
      effectsSummary,
      tone: choice.tone ?? 'neutral',
    });
  }
}

// Expand an event's static `advisorStances` spec into the enriched
// `_advisorStances` shape EventModal renders — pulling name/portrait/color
// from the live seat data — and attach `_advisorHint` to any choice an advisor
// `supports`. Choices are cloned before mutation so we don't poison the pool.
export function enrichAdvisorStances(state, evt) {
  const spec = evt.advisorStances;
  if (!spec?.length) return;
  const seats = state.advisors?.seats;
  if (!seats) return;

  const stances = [];
  const hints = {};
  for (const { advisor, stance, supports } of spec) {
    const seat = seats[advisor];
    if (!seat) continue;
    stances.push({
      advisorId: advisor,
      name:     seat.name,
      title:    seat.title,
      portrait: seat.portrait,
      color:    seat.color,
      stance,
    });
    if (supports) hints[supports] = seat.name;
  }

  if (!stances.length) return;
  evt._advisorStances = stances;
  if (Object.keys(hints).length && Array.isArray(evt.choices)) {
    evt.choices = evt.choices.map(c => hints[c.key] ? { ...c, _advisorHint: hints[c.key] } : c);
  }
}
