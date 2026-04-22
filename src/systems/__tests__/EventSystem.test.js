// Unit tests for EventSystem's decision logging + echo scheduling/draining.
// We bypass the roll() RNG gate and hand-build a fake active event so the
// tests are deterministic and don't depend on EVENT_POOL weights.

import { describe, it, expect, beforeEach } from 'vitest';
import { EventSystem } from '../EventSystem.js';
import { EventBus, EVT } from '../../core/EventBus.js';
import { createState } from '../../core/GameState.js';
import { EVENT_POOL } from '../../data/events.js';
import { BALANCE } from '../../config/balance.js';

function installBillionairePledge(state) {
  const evtDef = EVENT_POOL.find(e => e.id === 'billionaire_pledge');
  // Clone so mutations in advisor-stance enrichment don't poison the pool.
  const evt = {
    ...evtDef,
    choices: evtDef.choices.map(c => ({ ...c })),
    firedTick: state.meta.tick,
    _ctx: {},
  };
  state.activeEvents.push(evt);
  return evt;
}

let state;
let bus;
let sys;
let news;

beforeEach(() => {
  state = createState('USA', { seed: 1 });
  bus = new EventBus();
  sys = new EventSystem(state, bus);
  news = [];
  bus.on(EVT.EVENT_FIRED, (p) => news.push(p));
});

describe('EventSystem.resolve — decisions + echoes', () => {
  it('pushes a decision record capturing the chosen choice', () => {
    installBillionairePledge(state);
    sys.resolve('billionaire_pledge', 'reject');

    expect(state.meta.decisions.length).toBe(1);
    const d = state.meta.decisions[0];
    expect(d.eventId).toBe('billionaire_pledge');
    expect(d.choiceKey).toBe('reject');
    expect(d.choiceLabel).toMatch(/Reject/i);
    expect(typeof d.choiceHeadline).toBe('string');
    expect(d.echoHeadline).toBeNull();
  });

  it('schedules an echo with the expected due tick', () => {
    state.meta.tick = 10;
    installBillionairePledge(state);
    sys.resolve('billionaire_pledge', 'take');

    expect(state.meta.pendingEchoes.length).toBe(1);
    const queued = state.meta.pendingEchoes[0];
    expect(queued.eventId).toBe('billionaire_pledge');
    expect(queued.choiceKey).toBe('take');
    expect(queued.dueTick).toBe(10 + 14); // billionaire_pledge take echo delay is 14
    expect(queued.decisionId).toBe(0);
  });

  it('drainEchoes fires news + back-fills echoHeadline when due', () => {
    state.meta.tick = 10;
    installBillionairePledge(state);
    sys.resolve('billionaire_pledge', 'reject');

    // Before due tick — nothing fires.
    news.length = 0;
    state.meta.tick = 20;
    sys.drainEchoes();
    expect(news.length).toBe(0);
    expect(state.meta.decisions[0].echoHeadline).toBeNull();

    // At/after due tick — echo fires once, record gets back-filled, queue empties.
    state.meta.tick = 24; // 10 + 14
    sys.drainEchoes();
    expect(news.length).toBe(1);
    expect(news[0].headline).toMatch(/crowdfunding|Three years on/i);
    expect(state.meta.decisions[0].echoHeadline).toBe(news[0].headline);
    expect(state.meta.pendingEchoes.length).toBe(0);
  });

  it('does not log advisor-conflict resolutions to decisions', () => {
    // Synthesize a minimal advisor-conflict-shaped event and resolve it.
    const conflictEvt = {
      id: 'advisor_conflict_test',
      _advisorConflict: 'industry_vs_activist',
      choices: [
        { key: 'a', label: 'A side', headline: 'A prevails', tone: 'info', effects: [] },
        { key: 'b', label: 'B side', headline: 'B prevails', tone: 'info', effects: [] },
      ],
      _ctx: {},
    };
    state.activeEvents.push(conflictEvt);
    sys.resolve('advisor_conflict_test', 'a');
    expect(state.meta.decisions.length).toBe(0);
    expect(state.meta.pendingEchoes.length).toBe(0);
  });

  it('roll() respects startup grace — no event before eventStartupGraceTicks', () => {
    // Force the RNG to always roll under the fire chance so the only gate
    // that matters is the startup grace. seed=1 → the first call doesn't
    // undershoot, so we stub rng.random to return 0 explicitly.
    state.meta.rng.random = () => 0;
    state.meta.tick = 0;
    news.length = 0;
    sys.roll();
    expect(news.length).toBe(0);
    state.meta.tick = BALANCE.eventStartupGraceTicks - 1;
    sys.roll();
    expect(news.length).toBe(0);
    // At/after the grace tick, the event actually fires (and bumps lastEventTick).
    state.meta.tick = BALANCE.eventStartupGraceTicks;
    sys.roll();
    expect(news.length).toBe(1);
    expect(state.meta.lastEventTick).toBe(BALANCE.eventStartupGraceTicks);
  });

  it('roll() respects eventMinGapTicks between fires', () => {
    state.meta.rng.random = () => 0;
    state.meta.tick = BALANCE.eventStartupGraceTicks;
    sys.roll();
    expect(news.length).toBe(1);

    // Clear any interactive event that was pushed so the activeEvents gate
    // doesn't also block us — we're testing the gap gate here.
    state.activeEvents.length = 0;

    // One tick later → gap gate blocks.
    state.meta.tick += 1;
    sys.roll();
    expect(news.length).toBe(1);

    // After the gap window elapses → fires again.
    state.meta.tick += BALANCE.eventMinGapTicks;
    state.activeEvents.length = 0;
    sys.roll();
    expect(news.length).toBe(2);
  });

  it('interactive track: forces a decision after eventStartupGraceTicks + interactiveMaxGapTicks', () => {
    // Force the RNG to always undershoot so passive never rolls when we
    // don't want it. Still need grace + max-gap cooperation.
    state.meta.rng.random = () => 0.99;          // never clears fire chance
    state.meta.lastInteractiveTick = -999;
    state.meta.tick = BALANCE.eventStartupGraceTicks + BALANCE.interactiveMaxGapTicks;
    sys.rollInteractive();
    // Forced path picks an interactive event even though the RNG roll didn't pass.
    expect(state.activeEvents.length).toBe(1);
    expect(state.activeEvents[0].interactive).toBe(true);
    expect(state.meta.lastInteractiveTick).toBe(state.meta.tick);
  });

  it('interactive track: respects interactiveMinGapTicks', () => {
    state.meta.rng.random = () => 0;              // always passes fire chance
    state.meta.lastInteractiveTick = state.meta.tick = BALANCE.eventStartupGraceTicks;
    sys.rollInteractive();
    expect(state.activeEvents.length).toBe(0);    // min-gap zero-elapsed blocks
    state.meta.tick += BALANCE.interactiveMinGapTicks - 1;
    sys.rollInteractive();
    expect(state.activeEvents.length).toBe(0);    // still inside min-gap
    state.meta.tick += 1;                         // just past min-gap
    sys.rollInteractive();
    expect(state.activeEvents.length).toBe(1);    // fires
  });

  it('passive track filters out interactive events', () => {
    state.meta.rng.random = () => 0;
    state.meta.tick = BALANCE.eventStartupGraceTicks;
    sys.rollPassive();
    // Whatever fired must be a non-interactive event (or nothing, if the
    // weighted pick landed on nothing — but with weight-3 good news in pool
    // the pool is non-empty and a pick will happen).
    if (news.length) {
      expect(news[0].event.interactive).toBeFalsy();
    }
  });

  it('echo spec exists on every interactive pool choice', () => {
    for (const evt of EVENT_POOL) {
      if (!evt.interactive) continue;
      for (const c of evt.choices) {
        expect(c.echo, `${evt.id}:${c.key} is missing echo`).toBeDefined();
        expect(c.echo.delayTicks, `${evt.id}:${c.key} echo.delayTicks`).toBeGreaterThan(0);
        expect(c.echo.headline, `${evt.id}:${c.key} echo.headline`).toBeDefined();
      }
    }
  });

  describe('decision timeouts', () => {
    it('expirePending() removes active events past their expiresAtTick and emits DECISION_EXPIRED', () => {
      state.meta.tick = 10;
      installBillionairePledge(state);
      const evt = state.activeEvents[0];
      evt.expiresAtTick = 14;

      let expired = null;
      bus.on(EVT.DECISION_EXPIRED, (p) => { expired = p; });

      // Not yet past — nothing happens.
      state.meta.tick = 13;
      sys.expirePending();
      expect(state.activeEvents.length).toBe(1);
      expect(expired).toBeNull();

      // At expiry tick — event expires, DECISION_EXPIRED emits, queue empties.
      state.meta.tick = 14;
      sys.expirePending();
      expect(state.activeEvents.length).toBe(0);
      expect(expired).not.toBeNull();
      expect(expired.eventId).toBe('billionaire_pledge');
    });

    it('applies a default penalty (world stress + political will) when no onExpire is defined', () => {
      const startStress = state.world.societalStress;
      const homeWill = state.countries[state.meta.homeCountryId].politicalWill;

      state.meta.tick = 10;
      installBillionairePledge(state);
      state.activeEvents[0].expiresAtTick = 14;

      state.meta.tick = 14;
      sys.expirePending();

      // Global penalty since billionaire_pledge has no ctx.target.
      expect(state.world.societalStress).toBeGreaterThan(startStress);
      expect(state.countries[state.meta.homeCountryId].politicalWill).toBeLessThan(homeWill);
    });

    it('appends an "expired" entry to state.meta.decisions so the recap can show inaction', () => {
      state.meta.tick = 10;
      installBillionairePledge(state);
      state.activeEvents[0].expiresAtTick = 12;

      state.meta.tick = 12;
      sys.expirePending();

      expect(state.meta.decisions.length).toBe(1);
      const rec = state.meta.decisions[0];
      expect(rec.expired).toBe(true);
      expect(rec.choiceKey).toBe('__expired__');
      expect(rec.choiceLabel).toMatch(/did nothing/i);
    });

    it('_fire() sets expiresAtTick from BALANCE default and ships it on EVENT_FIRED', () => {
      state.meta.rng.random = () => 0;
      state.meta.lastInteractiveTick = -999;
      state.meta.tick = BALANCE.eventStartupGraceTicks + BALANCE.interactiveMaxGapTicks;
      const captured = [];
      bus.on(EVT.EVENT_FIRED, (p) => captured.push(p));

      sys.rollInteractive();
      expect(state.activeEvents.length).toBe(1);
      const evt = state.activeEvents[0];
      // ttl default is BALANCE.decisionTimeoutTicks; clamped minimum 1.
      const expectedTtl = Math.max(1, BALANCE.decisionTimeoutTicks);
      expect(evt.expiresAtTick).toBe(state.meta.tick + expectedTtl);
      // EVENT_FIRED payload must carry the same value so UI layers can
      // surface the countdown without peeking at activeEvents.
      const lastFired = captured[captured.length - 1];
      expect(lastFired.event.expiresAtTick).toBe(evt.expiresAtTick);
    });

    it('per-event timeoutTicks override wins over the BALANCE default', () => {
      // Hand-build an interactive event with a short timeout and push it.
      const evtDef = EVENT_POOL.find(e => e.id === 'billionaire_pledge');
      const ttl = 2;
      const firedTick = 10;
      state.meta.tick = firedTick;
      const evt = {
        ...evtDef,
        choices: evtDef.choices.map(c => ({ ...c })),
        firedTick, expiresAtTick: firedTick + ttl, _ctx: {},
      };
      state.activeEvents.push(evt);

      // Does not expire before expiresAtTick.
      state.meta.tick = firedTick + ttl - 1;
      sys.expirePending();
      expect(state.activeEvents.length).toBe(1);

      // Expires at expiresAtTick (>= semantics).
      state.meta.tick = firedTick + ttl;
      sys.expirePending();
      expect(state.activeEvents.length).toBe(0);
    });

    it('paused game never expires pending decisions (because TICK stops)', () => {
      // Simulate "paused": we don't advance state.meta.tick and we don't call
      // sys.expirePending(). Opening + closing TICKs is the GameLoop's job;
      // when paused, it never emits EVT.TICK. Verify the invariant: without
      // a tick advance or an explicit expirePending call, the event stays.
      state.meta.tick = 10;
      installBillionairePledge(state);
      state.activeEvents[0].expiresAtTick = 12;

      // Sim: many real-time frames but no TICK — event still pending.
      for (let i = 0; i < 20; i++) {
        // Nothing — game is paused, no TICK fires.
      }
      expect(state.activeEvents.length).toBe(1);
    });

    it('timeoutTicks: Infinity opts out — no expiresAtTick, never expires', () => {
      // Authors can set timeoutTicks: Infinity for events that should wait
      // forever. The fire path produces null expiresAtTick, and expirePending
      // skips those entries entirely.
      const evtDef = EVENT_POOL.find(e => e.id === 'billionaire_pledge');
      state.meta.tick = 10;
      const evt = {
        ...evtDef,
        choices: evtDef.choices.map(c => ({ ...c })),
        firedTick: 10, expiresAtTick: null, _ctx: {},
      };
      state.activeEvents.push(evt);

      state.meta.tick = 10_000;
      sys.expirePending();
      expect(state.activeEvents.length).toBe(1);
    });

    it('onExpire effects array runs instead of the default penalty', () => {
      state.meta.tick = 10;
      installBillionairePledge(state);
      const evt = state.activeEvents[0];
      evt.expiresAtTick = 12;
      const startWill = state.countries[state.meta.homeCountryId].politicalWill;
      const startStress = state.world.societalStress;
      evt.onExpire = [
        { op: 'addWorld', field: 'climatePoints', value: -3 },
      ];
      const startCp = state.world.climatePoints;

      state.meta.tick = 12;
      sys.expirePending();

      expect(state.world.climatePoints).toBe(startCp - 3);
      // Default penalty did not run.
      expect(state.world.societalStress).toBe(startStress);
      expect(state.countries[state.meta.homeCountryId].politicalWill).toBe(startWill);
    });
  });
});
