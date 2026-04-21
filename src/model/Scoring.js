// Scoring model — pure win/lose/grade calculators.
//
// Two shape functions:
//   - evaluateOutcome(state, peakTemp) → { status, reason?, perfect? }
//       status ∈ 'running' | 'won' | 'lost'
//       'won' carries { perfect: bool } (perfect = S-tier conditions)
//       'lost' carries { reason: string }
//   - grade(state, peakTemp, perfect) → 'S' | 'A' | 'B' | 'C' | 'D'
//
// Intent: the scoring system becomes a thin writer — it reads this, sets
// state.meta.status, and emits events. The UI calls `grade()` directly to
// render post-game cards without reaching into the system.

import { BALANCE } from '../config/balance.js';

// Net Zero percentage of all countries. Used for both win checks and
// post-game display. Returns a value in [0, 1].
export function netZeroPct(state) {
  const cs = Object.values(state?.countries ?? {});
  if (!cs.length) return 0;
  return cs.filter(c => c.netZero).length / cs.length;
}

// Have we crossed the "clearly past peak" CO₂ threshold yet? True when the
// peak is at least BALANCE.reversalCO2DropPpm above current — i.e. CO₂ has
// actually turned the corner.
export function co2PeakPassed(world) {
  return ((world?.peakCO2ppm ?? 0) - (world?.co2ppm ?? Infinity)) >= BALANCE.reversalCO2DropPpm;
}

// Returns null if still running, or { status, reason?, perfect? } on end.
// Peak temperature is an argument (not derived here) because ScoringSystem
// maintains it across ticks as a max-cumulative — easier to pass in than to
// re-derive from the sometimes-lossy tempHistory.
export function evaluateOutcome(state, peakTemp) {
  const w = state?.world ?? {};

  if ((w.tempAnomalyC ?? 0) >= BALANCE.lossTempC) {
    return {
      status: 'lost',
      reason: `Temperature crossed +${BALANCE.lossTempC.toFixed(1)}°C. The Hothouse Earth cascade is locked in. Civilization cannot adapt fast enough.`,
    };
  }

  if (!co2PeakPassed(w)) return null;

  const nz = netZeroPct(state);
  const perfect = w.co2ppm <= BALANCE.perfectWinCO2ppm
               && peakTemp  <= BALANCE.perfectWinTempC
               && nz        >= BALANCE.perfectWinNzPct;
  const standard = w.co2ppm <= BALANCE.winCO2ppm
                && peakTemp  <= BALANCE.winTempCeilingC
                && nz        >= BALANCE.winCountryNetZeroPct;

  if (perfect || standard) {
    return { status: 'won', perfect: !!perfect };
  }
  return null;
}

// Letter grade. Mirrors the old ScoringSystem thresholds. Kept here so the
// end-of-game UI can render the grade without importing a system.
export function grade(state, peakTemp, perfect) {
  const w = state?.world ?? {};
  if (perfect || (w.co2ppm <= 350 && peakTemp <= 1.5)) return 'S';
  if (w.co2ppm <= 375 && peakTemp <= 1.7) return 'A';
  if (w.co2ppm <= 395 && peakTemp <= 1.9) return 'B';
  if (w.co2ppm <= 420 && peakTemp <= 2.3) return 'C';
  return 'D';
}

// Average adoption across all countries' branches. Useful for history /
// dashboards; pure so it round-trips.
export function worldAvgAdoption(state) {
  const cs = Object.values(state?.countries ?? {});
  if (!cs.length) return 0;
  const keys = ['energy', 'transport', 'industry', 'land', 'capture', 'policy'];
  let t = 0;
  for (const c of cs) {
    let s = 0;
    for (const k of keys) s += c.adoption?.[k] ?? 0;
    t += s / keys.length;
  }
  return t / cs.length;
}

// Average political will across countries.
export function worldAvgWill(state) {
  const cs = Object.values(state?.countries ?? {});
  if (!cs.length) return 0;
  let t = 0;
  for (const c of cs) t += c.politicalWill ?? 0;
  return t / cs.length;
}
