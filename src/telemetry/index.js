// Telemetry — pluggable track() with a no-op default.
//
// The game calls `track('deployed', { activityId, countryId, ... })` etc. at
// interesting moments. Where the data actually goes depends on the reporter
// you install via `setReporter()`:
//   - default (no reporter) → drops silently
//   - dev override (`?debug=1`) → auto-installs ConsoleReporter
//   - prod → swap in a real one (PostHog / Plausible / custom fetch) in one
//     place before calling `install(bus, state)` from main.js
//
// Events routed here should be **aggregate-meaningful**, not per-tick noise:
//   game_started, game_won, game_lost, country_selected,
//   research_done, deploy_milestone (every 10th deploy), event_fired.
//
// ─── Privacy ──────────────────────────────────────────────────────────────
// No PII is collected. The schema is gameplay facts only (which country,
// what grade, how long). If you ever add user identifiers, route them
// through an explicit opt-in screen first.

import { ENV } from '../config/env.js';

/** @typedef {{ track: (event: string, props?: Record<string, unknown>) => void }} Reporter */

/** @type {Reporter | null} */
let reporter = null;

/** Replace the active reporter. Pass `null` to disable. */
export function setReporter(next) {
  reporter = next ?? null;
}

/** Emit a single event. Never throws; reporter errors are swallowed. */
export function track(event, props = {}) {
  if (!reporter) return;
  try {
    reporter.track(event, props);
  } catch (err) {
    if (ENV.isDev) console.warn('[telemetry] reporter threw', err);
  }
}

// ─── Built-in reporters ────────────────────────────────────────────────────

/** Logs every event to the browser console. Good in dev/debug sessions. */
export const ConsoleReporter = {
  track(event, props) {
    console.info(`[telemetry] ${event}`, props);
  },
};

/**
 * Buffers events in memory so a DevTools panel or later flush can pick them
 * up. `drain()` returns + clears the buffer.
 */
export function MemoryReporter(cap = 500) {
  const buf = [];
  return {
    track(event, props) {
      buf.push({ event, props, at: Date.now() });
      if (buf.length > cap) buf.splice(0, buf.length - cap);
    },
    drain() {
      const out = buf.slice();
      buf.length = 0;
      return out;
    },
    peek() {
      return buf.slice();
    },
  };
}

// ─── Wire-up for the game engine ──────────────────────────────────────────
// Subscribe to high-signal bus events. Keep the set small so a session's
// event log stays readable (think "business events", not per-tick updates).

/**
 * @param {{ on: (t: string, fn: (p: unknown) => void) => () => void }} bus
 * @param {any} state
 * @param {{ autoDevReporter?: boolean }} [opts]
 * @returns {() => void} teardown — unsubs from all bus events
 */
export function install(bus, state, { autoDevReporter = true } = {}) {
  if (autoDevReporter && ENV.debug && !reporter) setReporter(ConsoleReporter);

  const unsubs = [];
  const sub = (type, fn) => unsubs.push(bus.on(type, fn));

  track('game_started', {
    homeCountry: state?.meta?.homeCountryId,
    seed: state?.meta?.seed,
  });

  sub('deployed', (p) => {
    const c = state?.world?.deployCount ?? {};
    const total = Object.values(c).reduce((t, byAct) =>
      t + Object.values(byAct).reduce((n, v) => n + v, 0), 0);
    if (total % 10 === 0) {
      track('deploy_milestone', { total, lastActivity: p?.activity?.id, lastCountry: p?.country?.id });
    }
  });

  sub('researchDone', (p) => track('research_done', {
    activity: p?.activity?.id,
    tick: state?.meta?.tick,
  }));

  sub('netZero', (p) => track('country_net_zero', {
    country: p?.country?.id,
    tick: state?.meta?.tick,
  }));

  sub('countrySelected', (p) => track('country_selected', { country: p?.id }));

  sub('eventFired', (p) => track('event_fired', {
    id: p?.event?.id,
    tone: p?.tone,
  }));

  sub('won', (p) => track('game_won', {
    grade: p?.grade,
    peakTemp: p?.peakTemp,
    perfect: p?.perfect,
    tick: state?.meta?.tick,
    co2ppm: state?.world?.co2ppm,
  }));

  sub('lost', (p) => track('game_lost', {
    reason: p?.reason,
    peakTemp: p?.peakTemp,
    tick: state?.meta?.tick,
    co2ppm: state?.world?.co2ppm,
  }));

  return function teardown() {
    unsubs.forEach((u) => u?.());
    track('session_ended', { tick: state?.meta?.tick });
  };
}
