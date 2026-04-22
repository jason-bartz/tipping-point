// Dispatches are the persistent notification log. Every toast-worthy beat
// (events, news, research completions, deploy milestones, advisor whispers,
// pending decisions) is captured here so the player can read the full text
// at their own pace instead of catching truncated banners mid-scroll.
//
// Data is plain JSON — round-trips through save/load without transform.
//
// Shape:
//   {
//     id:        string  — stable, unique per dispatch
//     tick, year, quarter — when it happened
//     kind:      'decision' | 'event' | 'news' | 'research' | 'milestone'
//              | 'advisor' | 'deploy' | 'system'
//     title:     string  — short headline for the card
//     body:      string  — full text (can wrap)
//     detail?:   string  — optional secondary line (e.g. effects summary)
//     tone:      'good' | 'bad' | 'info' | 'flavor' | 'neutral'
//     read:      boolean — true once the player has opened the card
//     needsAction: boolean — true while an interactive event is pending
//     eventId?:  string  — links a 'decision' dispatch back to state.activeEvents
//   }

import { EVT } from '../core/EventBus.js';

// Cap retention. A 40-year game at one tick per couple-of-seconds produces
// a few hundred beats at most; 250 keeps history useful without bloating
// the save blob. The oldest already-read dispatches are dropped first.
const MAX_DISPATCHES = 250;

export const DISPATCH_KINDS = [
  'decision', 'event', 'news', 'research', 'milestone', 'advisor', 'deploy', 'system',
];

// Filter labels shown in the UI. Order matters — it's the visible row.
// News items are intentionally absent: the news ticker is the home for flavor
// headlines, and decision consequences ("echoes") are logged as events so they
// surface in the dispatches log without needing their own category.
export const DISPATCH_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'decision',  label: 'Decisions' },
  { id: 'event',     label: 'Events' },
  { id: 'advisor',   label: 'Advisors' },
  { id: 'milestone', label: 'Milestones' },
];

let _idCounter = 0;
function makeId(state) {
  // Seeded part keeps ids stable-ish across saves; counter guarantees
  // uniqueness within a session even if two dispatches land on one tick.
  _idCounter = (_idCounter + 1) >>> 0;
  return `d_${state.meta.tick}_${_idCounter.toString(36)}`;
}

/**
 * Append a dispatch record and emit DISPATCH_LOGGED. Returns the record.
 * Callers pass { kind, title, body, tone, ...optional }; tick/date/id are
 * filled in from state. Dropping: when the array exceeds MAX_DISPATCHES,
 * the oldest already-read item is removed; if none are read, the oldest
 * overall is removed (stale > unread in that edge case).
 */
export function logDispatch(state, bus, data) {
  if (!state.meta.dispatches) state.meta.dispatches = [];
  const record = {
    id: makeId(state),
    tick:    state.meta.tick,
    year:    state.meta.year,
    quarter: state.meta.quarter,
    kind:    data.kind || 'system',
    title:   data.title || '',
    body:    data.body  || '',
    detail:  data.detail || '',
    tone:    data.tone  || 'neutral',
    read:    false,
    needsAction: !!data.needsAction,
    eventId: data.eventId || null,
  };
  state.meta.dispatches.unshift(record);
  _trim(state);
  bus?.emit(EVT.DISPATCH_LOGGED, record);
  bus?.emit(EVT.DISPATCH_UNREAD_CHANGED, { count: unreadCount(state) });
  return record;
}

function _trim(state) {
  const arr = state.meta.dispatches;
  if (arr.length <= MAX_DISPATCHES) return;
  // Prefer dropping oldest read dispatches first (end of the array is oldest
  // since we unshift). When all remaining are unread, drop the true tail.
  while (arr.length > MAX_DISPATCHES) {
    let idx = -1;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].read && !arr[i].needsAction) { idx = i; break; }
    }
    if (idx === -1) idx = arr.length - 1; // fallback: drop oldest regardless
    arr.splice(idx, 1);
  }
}

export function markRead(state, bus, id) {
  const d = state.meta.dispatches?.find(x => x.id === id);
  if (!d || d.read) return false;
  d.read = true;
  bus?.emit(EVT.DISPATCH_UNREAD_CHANGED, { count: unreadCount(state) });
  return true;
}

export function markAllRead(state, bus) {
  const arr = state.meta.dispatches;
  if (!arr?.length) return 0;
  let n = 0;
  for (const d of arr) { if (!d.read && !d.needsAction) { d.read = true; n++; } }
  if (n > 0) bus?.emit(EVT.DISPATCH_UNREAD_CHANGED, { count: unreadCount(state) });
  return n;
}

// Resolve a pending-decision dispatch once the player has answered it. The
// row stays in the log (player can read what they chose) but shifts from
// "needs action, unread" to "read, answered".
export function resolveDecisionDispatch(state, bus, eventId, choiceLabel, effectsSummary) {
  const d = state.meta.dispatches?.find(x => x.needsAction && x.eventId === eventId);
  if (!d) return null;
  d.needsAction = false;
  d.read = true;
  d.detail = [`Chose: ${choiceLabel}`, effectsSummary].filter(Boolean).join(' · ');
  bus?.emit(EVT.DISPATCH_UNREAD_CHANGED, { count: unreadCount(state) });
  return d;
}

export function unreadCount(state) {
  const arr = state.meta.dispatches;
  if (!arr?.length) return 0;
  let n = 0;
  for (const d of arr) if (!d.read) n++;
  return n;
}

export function pendingDecisionCount(state) {
  const arr = state.meta.dispatches;
  if (!arr?.length) return 0;
  let n = 0;
  for (const d of arr) if (d.needsAction) n++;
  return n;
}

export function filteredDispatches(state, filterId) {
  const arr = state.meta.dispatches ?? [];
  if (filterId === 'all' || !filterId) return arr;
  return arr.filter(d => d.kind === filterId);
}
