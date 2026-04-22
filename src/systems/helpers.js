// Shim over the Economy model + a small display helper. Historic import
// point; the actual math has moved to src/model/Economy.js. New code should
// import from the model directly, but existing UI paths through this file
// keep working.

import { BALANCE } from '../config/balance.js';
import { researchCost } from '../model/Economy.js';

export const researchCostFor = researchCost;

// Ticks → human-readable seconds at current speed. Uses ceil so the countdown
// reads like an RTS timer ("18s" for all of 18.00–18.99s remaining).
export function formatSeconds(ticks, state) {
  const speed = state?.meta?.speed ?? 1;
  const rawSecs = Math.max(0, (ticks ?? 0) * (BALANCE.tickIntervalMs / 1000) / speed);
  const secs = rawSecs < 0.05 ? 0 : Math.ceil(rawSecs);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
