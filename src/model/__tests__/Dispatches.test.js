// Smoke + behavior tests for the dispatch log. The log is the player's
// only persistent record of decisions, so the unread/needsAction
// bookkeeping has to stay airtight — silent drift here means the tab
// badge pulses forever or, worse, "Decide" buttons go nowhere.

import { describe, it, expect } from 'vitest';
import {
  logDispatch,
  markRead,
  markAllRead,
  resolveDecisionDispatch,
  unreadCount,
  pendingDecisionCount,
  filteredDispatches,
  DISPATCH_KINDS,
  DISPATCH_FILTERS,
} from '../Dispatches.js';

function makeState() {
  return {
    meta: { tick: 5, year: 2030, quarter: 2, dispatches: [] },
  };
}

function makeBus() {
  const events = [];
  return {
    emit: (type, payload) => events.push({ type, payload }),
    events,
  };
}

describe('logDispatch', () => {
  it('appends a record with id/tick/year/quarter filled from state', () => {
    const s = makeState();
    const bus = makeBus();
    const r = logDispatch(s, bus, { kind: 'event', title: 'A', body: 'B' });
    expect(r.id).toMatch(/^d_5_/);
    expect(r.tick).toBe(5);
    expect(r.year).toBe(2030);
    expect(r.quarter).toBe(2);
    expect(r.read).toBe(false);
    expect(r.needsAction).toBe(false);
    expect(s.meta.dispatches).toHaveLength(1);
    expect(s.meta.dispatches[0]).toBe(r);
  });

  it('unshifts (newest first)', () => {
    const s = makeState(); const bus = makeBus();
    logDispatch(s, bus, { kind: 'event', title: 'first' });
    logDispatch(s, bus, { kind: 'event', title: 'second' });
    expect(s.meta.dispatches[0].title).toBe('second');
  });

  it('emits DISPATCH_LOGGED and DISPATCH_UNREAD_CHANGED', () => {
    const s = makeState(); const bus = makeBus();
    logDispatch(s, bus, { kind: 'event', title: 'x' });
    const types = bus.events.map(e => e.type);
    expect(types).toContain('dispatchLogged');
    expect(types).toContain('dispatchUnreadChanged');
  });

  it('caps at 250 entries and prefers dropping read ones first', () => {
    const s = makeState(); const bus = makeBus();
    // Fill above the cap with mostly-read entries plus a few unread.
    for (let i = 0; i < 260; i++) {
      const r = logDispatch(s, bus, { kind: 'event', title: `t${i}` });
      // Mark every entry read except the last 10.
      if (i < 250) r.read = true;
    }
    expect(s.meta.dispatches.length).toBeLessThanOrEqual(250);
    // Unread ones survive.
    const unread = s.meta.dispatches.filter(d => !d.read);
    expect(unread.length).toBeGreaterThan(0);
  });
});

describe('markRead / markAllRead', () => {
  it('markRead flips a single dispatch and returns true', () => {
    const s = makeState(); const bus = makeBus();
    const r = logDispatch(s, bus, { kind: 'event', title: 'x' });
    expect(markRead(s, bus, r.id)).toBe(true);
    expect(r.read).toBe(true);
  });

  it('markRead returns false on unknown id or already-read', () => {
    const s = makeState(); const bus = makeBus();
    expect(markRead(s, bus, 'nope')).toBe(false);
    const r = logDispatch(s, bus, { kind: 'event' });
    markRead(s, bus, r.id);
    expect(markRead(s, bus, r.id)).toBe(false);
  });

  it('markAllRead skips needsAction items and returns the count flipped', () => {
    const s = makeState(); const bus = makeBus();
    logDispatch(s, bus, { kind: 'event', title: 'a' });
    logDispatch(s, bus, { kind: 'event', title: 'b' });
    logDispatch(s, bus, { kind: 'decision', title: 'pending', needsAction: true });
    const n = markAllRead(s, bus);
    expect(n).toBe(2);
    expect(s.meta.dispatches.find(d => d.needsAction)?.read).toBe(false);
  });

  it('markAllRead returns 0 when there is nothing to flip', () => {
    const s = makeState(); const bus = makeBus();
    expect(markAllRead(s, bus)).toBe(0);
  });
});

describe('resolveDecisionDispatch', () => {
  it('marks the matching needsAction dispatch resolved + read with a detail line', () => {
    const s = makeState(); const bus = makeBus();
    logDispatch(s, bus, { kind: 'decision', title: 'go?', needsAction: true, eventId: 'event_x' });
    const r = resolveDecisionDispatch(s, bus, 'event_x', 'Yes', '+5 will');
    expect(r.needsAction).toBe(false);
    expect(r.read).toBe(true);
    expect(r.detail).toMatch(/Chose: Yes/);
    expect(r.detail).toMatch(/\+5 will/);
  });

  it('returns null when no matching needsAction dispatch exists', () => {
    const s = makeState(); const bus = makeBus();
    expect(resolveDecisionDispatch(s, bus, 'phantom', 'Yes', '')).toBeNull();
  });
});

describe('counts', () => {
  it('unreadCount = number of unread regardless of needsAction', () => {
    const s = makeState(); const bus = makeBus();
    expect(unreadCount(s)).toBe(0);
    logDispatch(s, bus, { kind: 'event' });
    logDispatch(s, bus, { kind: 'event' });
    logDispatch(s, bus, { kind: 'decision', needsAction: true });
    expect(unreadCount(s)).toBe(3);
  });

  it('pendingDecisionCount = number with needsAction', () => {
    const s = makeState(); const bus = makeBus();
    expect(pendingDecisionCount(s)).toBe(0);
    logDispatch(s, bus, { kind: 'decision', needsAction: true });
    logDispatch(s, bus, { kind: 'decision', needsAction: true });
    logDispatch(s, bus, { kind: 'event' });
    expect(pendingDecisionCount(s)).toBe(2);
  });
});

describe('filteredDispatches', () => {
  it('returns all when filterId is "all" or missing', () => {
    const s = makeState(); const bus = makeBus();
    logDispatch(s, bus, { kind: 'event' });
    logDispatch(s, bus, { kind: 'decision' });
    expect(filteredDispatches(s, 'all')).toHaveLength(2);
    expect(filteredDispatches(s)).toHaveLength(2);
  });

  it('filters by exact kind', () => {
    const s = makeState(); const bus = makeBus();
    logDispatch(s, bus, { kind: 'event' });
    logDispatch(s, bus, { kind: 'decision' });
    logDispatch(s, bus, { kind: 'milestone' });
    expect(filteredDispatches(s, 'decision')).toHaveLength(1);
    expect(filteredDispatches(s, 'milestone')).toHaveLength(1);
  });
});

describe('catalog exports', () => {
  it('DISPATCH_KINDS lists all kinds with no duplicates', () => {
    expect(new Set(DISPATCH_KINDS).size).toBe(DISPATCH_KINDS.length);
    expect(DISPATCH_KINDS).toContain('decision');
    expect(DISPATCH_KINDS).toContain('event');
  });

  it('DISPATCH_FILTERS has stable ids', () => {
    const ids = DISPATCH_FILTERS.map(f => f.id);
    expect(ids).toContain('all');
    expect(ids).toContain('decision');
  });
});
