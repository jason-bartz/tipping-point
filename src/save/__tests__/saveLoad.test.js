// @vitest-environment jsdom
//
// Robustness tests for save/load — quota errors, malformed JSON, slot
// addressing, and the autosave bus-driver. The migration test covers the
// happy-path schema back-fill on a frozen fixture; this file covers the
// failure modes the migration test never exercises.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  save, load, hasSave, readSaveMeta, clearSave,
  saveToSlot, loadFromSlot, readSlotMeta, deleteSlot, listSlots,
  installAutoSave, serialize, deserialize,
  SLOT_KEYS, SLOT_LABELS, MANUAL_SLOT_IDS, ALL_SLOT_IDS,
} from '../saveLoad.js';
import { createState } from '../../core/GameState.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => { localStorage.clear(); });

describe('serialize / deserialize round-trip', () => {
  it('round-trips a fresh-game state with key invariants intact', () => {
    const state = createState('USA');
    state.world.researched.add('solar_power');
    const blob = serialize(state);
    const back = deserialize(blob);
    expect(back).not.toBeNull();
    expect(back.meta.homeCountryId).toBe('USA');
    expect(back.world.researched).toBeInstanceOf(Set);
    expect(back.world.researched.has('solar_power')).toBe(true);
    expect(typeof back.meta.rng.random).toBe('function');
  });

  it('drops activeEvents and collectables on load (always start fresh)', () => {
    const state = createState('USA');
    state.activeEvents = [{ id: 'methane_burp' }];
    state.collectables = [{ id: 'x' }];
    const back = deserialize(serialize(state));
    expect(back.activeEvents).toEqual([]);
    expect(back.collectables).toEqual([]);
  });

  it('clears autoPausedForDecision so a crashed session does not lock the game', () => {
    const state = createState('USA');
    state.meta.autoPausedForDecision = true;
    const back = deserialize(serialize(state));
    expect(back.meta.autoPausedForDecision).toBe(false);
  });

  it('rewrites every dispatch with needsAction so orphaned decisions resolve cleanly', () => {
    const state = createState('USA');
    state.meta.dispatches = [
      { id: 'd1', kind: 'decision', needsAction: true,  read: false, eventId: 'event_x', detail: '' },
      { id: 'd2', kind: 'event',    needsAction: false, read: true,  detail: 'no-op' },
    ];
    const back = deserialize(serialize(state));
    expect(back.meta.dispatches[0].needsAction).toBe(false);
    expect(back.meta.dispatches[0].read).toBe(true);
    expect(back.meta.dispatches[0].detail).toMatch(/expired/i);
    expect(back.meta.dispatches[1].needsAction).toBe(false);
  });

  it('returns null for blob with mismatched schema (forward-compat)', () => {
    expect(deserialize({ schema: 99, state: {} })).toBeNull();
  });

  it('returns null for null/undefined blob', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize(undefined)).toBeNull();
  });
});

describe('save / load — autosave slot', () => {
  it('save() persists, load() restores', () => {
    const state = createState('CHN');
    expect(save(state)).toBe(true);
    expect(hasSave()).toBe(true);
    const back = load();
    expect(back?.meta.homeCountryId).toBe('CHN');
  });

  it('hasSave() is false on a fresh storage', () => {
    expect(hasSave()).toBe(false);
  });

  it('load() returns null when storage is empty', () => {
    expect(load()).toBeNull();
  });

  it('load() returns null for malformed JSON in storage', () => {
    localStorage.setItem('tipping-point.save.v1', '{not-json');
    expect(load()).toBeNull();
  });

  it('load() returns null for a payload missing the schema field', () => {
    localStorage.setItem('tipping-point.save.v1', JSON.stringify({ state: {} }));
    expect(load()).toBeNull();
  });

  it('clearSave() removes the autosave key', () => {
    save(createState('USA'));
    expect(hasSave()).toBe(true);
    clearSave();
    expect(hasSave()).toBe(false);
  });

  it('save() returns false and does not throw when localStorage throws (quota)', () => {
    const state = createState('USA');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });
    expect(save(state)).toBe(false);
    expect(setItem).toHaveBeenCalled();
  });

  it('hasSave() returns false when localStorage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasSave()).toBe(false);
  });
});

describe('readSaveMeta', () => {
  it('returns a snapshot for a valid save', () => {
    const state = createState('IND');
    state.meta.year = 2031;
    state.meta.quarter = 3;
    state.world.tempAnomalyC = 1.45;
    state.world.co2ppm = 432.1;
    save(state);
    const meta = readSaveMeta();
    expect(meta).toMatchObject({
      homeCountryId: 'IND',
      year: 2031,
      quarter: 3,
      tempAnomalyC: 1.45,
      co2ppm: 432.1,
    });
    expect(typeof meta.savedAt).toBe('number');
  });

  it('returns null when there is nothing saved', () => {
    expect(readSaveMeta()).toBeNull();
  });

  it('returns null when storage holds a non-JSON value', () => {
    localStorage.setItem('tipping-point.save.v1', 'not json at all');
    expect(readSaveMeta()).toBeNull();
  });
});

describe('slot helpers', () => {
  it('exposes the expected slot ids', () => {
    expect(MANUAL_SLOT_IDS).toEqual(['a', 'b', 'c']);
    expect(ALL_SLOT_IDS).toEqual(['auto', 'a', 'b', 'c']);
    expect(SLOT_KEYS.auto).toBe('tipping-point.save.v1');
    expect(SLOT_LABELS.auto).toBe('Autosave');
    expect(SLOT_LABELS.a).toBeDefined();
  });

  it('saveToSlot / loadFromSlot round-trip per slot, isolated from each other', () => {
    const a = createState('USA');
    const b = createState('CHN');
    expect(saveToSlot('a', a)).toBe(true);
    expect(saveToSlot('b', b)).toBe(true);
    expect(loadFromSlot('a')?.meta.homeCountryId).toBe('USA');
    expect(loadFromSlot('b')?.meta.homeCountryId).toBe('CHN');
    // Autosave slot untouched.
    expect(hasSave()).toBe(false);
  });

  it('saveToSlot returns false for an unknown slot id', () => {
    expect(saveToSlot('phantom', createState('USA'))).toBe(false);
  });

  it('loadFromSlot returns null for an unknown slot id', () => {
    expect(loadFromSlot('phantom')).toBeNull();
  });

  it('loadFromSlot returns null for an empty slot', () => {
    expect(loadFromSlot('a')).toBeNull();
  });

  it('readSlotMeta returns null for an unknown slot id', () => {
    expect(readSlotMeta('phantom')).toBeNull();
  });

  it('readSlotMeta returns null for an empty slot', () => {
    expect(readSlotMeta('a')).toBeNull();
  });

  it('readSlotMeta surfaces savedAt + world snapshot for a written slot', () => {
    saveToSlot('b', createState('BRA'));
    const meta = readSlotMeta('b');
    expect(meta?.slotId).toBe('b');
    expect(meta?.homeCountryId).toBe('BRA');
  });

  it('deleteSlot returns true and clears the underlying key', () => {
    saveToSlot('c', createState('USA'));
    expect(loadFromSlot('c')).not.toBeNull();
    expect(deleteSlot('c')).toBe(true);
    expect(loadFromSlot('c')).toBeNull();
  });

  it('deleteSlot returns false for an unknown slot id', () => {
    expect(deleteSlot('phantom')).toBe(false);
  });

  it('listSlots returns one entry per slot id with meta=null when empty', () => {
    saveToSlot('a', createState('USA'));
    const slots = listSlots();
    expect(slots).toHaveLength(4);
    const a = slots.find(s => s.id === 'a');
    expect(a?.meta?.homeCountryId).toBe('USA');
    const b = slots.find(s => s.id === 'b');
    expect(b?.meta).toBeNull();
  });

  it('saveToSlot returns false on quota exceeded without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Quota'); err.name = 'QuotaExceededError'; throw err;
    });
    expect(saveToSlot('a', createState('USA'))).toBe(false);
  });
});

describe('installAutoSave', () => {
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
      handlers,
    };
  }

  it('writes immediately on `deployed`, `researchDone`, `netZero` events', () => {
    const state = createState('USA');
    const bus = makeBus();
    const { stop } = installAutoSave(state, bus, { intervalMs: 10_000 });
    expect(hasSave()).toBe(false);
    bus.emit('deployed', {});
    expect(hasSave()).toBe(true);
    clearSave();
    bus.emit('researchDone', {});
    expect(hasSave()).toBe(true);
    clearSave();
    bus.emit('netZero', {});
    expect(hasSave()).toBe(true);
    stop();
  });

  it('does not save on `tick` when status is not "running"', () => {
    const state = createState('USA');
    state.meta.status = 'won';
    const bus = makeBus();
    const { stop } = installAutoSave(state, bus, { intervalMs: 10_000 });
    bus.emit('tick', {});
    expect(hasSave()).toBe(false);
    stop();
  });

  it('throttles `tick` saves to the configured interval', () => {
    const state = createState('USA');
    const bus = makeBus();
    const { stop } = installAutoSave(state, bus, { intervalMs: 60_000 });
    bus.emit('tick', {}); // first tick within the window — writes once
    expect(hasSave()).toBe(true);
    clearSave();
    bus.emit('tick', {}); // second tick still inside the window — no write
    expect(hasSave()).toBe(false);
    stop();
  });

  it('stop() unsubscribes — later events do not write', () => {
    const state = createState('USA');
    const bus = makeBus();
    const { stop } = installAutoSave(state, bus, { intervalMs: 10_000 });
    stop();
    bus.emit('deployed', {});
    expect(hasSave()).toBe(false);
  });
});
