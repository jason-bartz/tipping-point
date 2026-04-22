// @vitest-environment jsdom
//
// Achievements behavior. Persistence keys, unlock idempotency, and the
// per-event listeners that hand the player a real win-screen dopamine hit.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadUnlocked, saveUnlocked,
  markNew, readNew, clearNew,
  ensureProgressSlot,
  installAchievements,
  listAllAchievements,
} from '../Achievements.js';

const EVT = {
  NET_ZERO: 'netZero',
  RESEARCH_DONE: 'researchDone',
  COLLECTABLE_CLAIMED: 'collectableClaimed',
  DECISION_RESOLVED: 'decisionResolved',
  TICK: 'tick',
  WON: 'won',
};

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

function makeBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of handlers.get(type) ?? []) fn(payload);
    },
  };
}

function makeState({ activities = {}, countries = {}, world = {}, meta = {} } = {}) {
  return {
    meta: { tick: 0, year: 2030, ...meta },
    world: { tempAnomalyC: 1.0, peakTempAnomalyC: 1.0, researched: new Set(), ...world },
    activities,
    countries,
  };
}

describe('persistence helpers', () => {
  it('loadUnlocked returns an empty Set on a fresh storage', () => {
    expect(loadUnlocked()).toEqual(new Set());
  });

  it('saveUnlocked / loadUnlocked round-trip', () => {
    saveUnlocked(new Set(['first_net_zero', 'speedrun']));
    const loaded = loadUnlocked();
    expect(loaded.has('first_net_zero')).toBe(true);
    expect(loaded.has('speedrun')).toBe(true);
  });

  it('loadUnlocked tolerates non-array storage values', () => {
    localStorage.setItem('tipping-point.achievements.v1', JSON.stringify({ not: 'an array' }));
    expect(loadUnlocked()).toEqual(new Set());
  });

  it('loadUnlocked tolerates malformed JSON', () => {
    localStorage.setItem('tipping-point.achievements.v1', '{not json');
    expect(loadUnlocked()).toEqual(new Set());
  });
});

describe('new-flag helpers', () => {
  it('markNew accumulates ids; readNew returns the union; clearNew empties', () => {
    markNew('a'); markNew('b'); markNew('a'); // dedupe
    const newOnes = readNew();
    expect(newOnes.has('a')).toBe(true);
    expect(newOnes.has('b')).toBe(true);
    clearNew();
    expect(readNew().size).toBe(0);
  });

  it('readNew returns an empty Set when storage is malformed', () => {
    localStorage.setItem('tipping-point.achievements.new.v1', '{nope');
    expect(readNew()).toEqual(new Set());
  });
});

describe('ensureProgressSlot', () => {
  it('creates the slot once and returns the same object on repeat calls', () => {
    const s = makeState();
    const a = ensureProgressSlot(s);
    expect(a.collectablesClaimed).toBe(0);
    expect(a.firstNetZeroTick).toBeNull();
    const b = ensureProgressSlot(s);
    expect(b).toBe(a);
  });
});

describe('installAchievements — unlock paths', () => {
  it('NET_ZERO unlocks first_net_zero (idempotent across multiple emits)', () => {
    const s = makeState({ countries: { USA: { netZero: true, infra: 'service' } } });
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    bus.emit(EVT.NET_ZERO, { country: { id: 'USA', infra: 'service' } });
    bus.emit(EVT.NET_ZERO, { country: { id: 'USA', infra: 'service' } });
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids.filter(id => id === 'first_net_zero')).toHaveLength(1);
  });

  it('NET_ZERO before 2035 unlocks speedrun', () => {
    const s = makeState({
      meta: { tick: 4, year: 2032 },
      countries: { USA: { netZero: true } },
    });
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    bus.emit(EVT.NET_ZERO, { country: { id: 'USA', infra: 'service' } });
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids).toContain('speedrun');
  });

  it('NET_ZERO on a petrostate unlocks petrostate_pivot', () => {
    const s = makeState({ countries: { SAU: { netZero: true, infra: 'petrostate' } } });
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    bus.emit(EVT.NET_ZERO, { country: { id: 'SAU', infra: 'petrostate' } });
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids).toContain('petrostate_pivot');
  });

  it('COLLECTABLE_CLAIMED counts up to 50 → unlocks collector', () => {
    const s = makeState();
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    for (let i = 0; i < 50; i++) bus.emit(EVT.COLLECTABLE_CLAIMED, {});
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids).toContain('collector');
  });

  it('DECISION_RESOLVED counts up to 25 → unlocks decisive', () => {
    const s = makeState();
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    for (let i = 0; i < 25; i++) bus.emit(EVT.DECISION_RESOLVED, {});
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids).toContain('decisive');
  });

  it('WON unlocks stabilized; cool_head when peak < 2.0; reversed when perfect', () => {
    const s = makeState({ world: { peakTempAnomalyC: 1.6 } });
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    bus.emit(EVT.WON, { perfect: true });
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids).toContain('stabilized');
    expect(ids).toContain('reversed');
    expect(ids).toContain('cool_head');
  });

  it('WON with peak > 2.5 unlocks heatwave_survivor (not cool_head)', () => {
    const s = makeState({ world: { peakTempAnomalyC: 2.7 } });
    const bus = makeBus();
    const onUnlock = vi.fn();
    installAchievements(s, bus, { EVT }, { onUnlock });
    bus.emit(EVT.WON, { perfect: false });
    const ids = onUnlock.mock.calls.map(c => c[0].id);
    expect(ids).toContain('heatwave_survivor');
    expect(ids).not.toContain('cool_head');
  });

  it('teardown unsubscribes — later events do not unlock', () => {
    const s = makeState({ countries: { USA: { netZero: true } } });
    const bus = makeBus();
    const onUnlock = vi.fn();
    const teardown = installAchievements(s, bus, { EVT }, { onUnlock });
    teardown();
    bus.emit(EVT.NET_ZERO, { country: { id: 'USA', infra: 'service' } });
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

describe('listAllAchievements', () => {
  it('returns the data catalog', () => {
    const list = listAllAchievements();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const a of list) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.title).toBe('string');
    }
  });
});
