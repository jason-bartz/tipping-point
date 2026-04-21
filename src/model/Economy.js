// Economy model — pure cost + income math for Carbon Credits (the game's
// only currency).
//
// Three calculators:
//   1. researchCost — what a research kickoff costs right now (accounts for
//      country difficulty mod and the temporary "diamond" discount window).
//   2. deployCost   — what a player deploy costs in a given country, before
//      synergy multipliers (DeployEconomy layers synergy on top).
//   3. incomePerTick — Carbon Credits the player earns each tick, blending
//      a base rate with a per-netZero-country bonus.
//
// Kept tiny and synchronous. The UI and engine both read these — single
// source of truth for "what's the number right now."

import { BALANCE } from '../config/balance.js';

// Per-tick CP income, before synergy discounts are applied. Base × country
// modifier, plus 0.4 CP per country at Net Zero (diplomatic dividend).
export function incomePerTick(state) {
  const mod = state?.meta?.mod;
  const base = BALANCE.baseCPPerTick * (mod?.cpMult ?? 1);
  let nzCount = 0;
  for (const c of Object.values(state?.countries ?? {})) {
    if (c.netZero) nzCount += 1;
  }
  return base + nzCount * 0.4;
}

// Credits to start research on `activity`. Country modifier scales, diamond
// discount window may cut the final number. Floored at 1 so the cheapest
// activity is always researchable after a reward.
export function researchCost(state, activity, mod) {
  let cost = (activity?.researchCost ?? 1) * (mod?.researchMult ?? 1);
  if ((state?.world?.researchDiscountTicksRemaining ?? 0) > 0) {
    cost *= (1 - (state.world.researchDiscountPct ?? 0));
  }
  return Math.max(1, Math.ceil(cost));
}

// Credits to deploy `activity` in `country`. Country modifier scales, home
// discount applies. Does NOT apply synergy cost multipliers — DeployEconomy
// composes this with synergies to get the final charge.
export function deployCost(state, country, activity, mod) {
  let cost = (activity?.deployCost ?? 1) * (mod?.deployMult ?? 1);
  if (country?.isHome) cost *= (1 - BALANCE.homeDeployDiscount);
  return Math.max(1, Math.ceil(cost));
}
