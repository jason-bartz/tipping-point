// Research synergies. When the player has researched certain "key" activities,
// specific deploys (or whole categories of deploys) get bonuses — extra
// adoption yield, cheaper cost, or a will-cost refund. This is the hidden
// strategy layer: you don't *need* to know the combos to win, but finding them
// is what turns a competent run into a dominant one.
//
// Design rules for new synergies:
//   - Anchor on *research*, not deploys — the combo is a thinking payoff, not
//     a grinding payoff.
//   - Each synergy should have a clear real-world narrative (why solar + grid
//     modernization compound). Flavor matters.
//   - Bonuses stack multiplicatively. Three synergies at +30% each = ~2.2x, not
//     1.9x. Keep individual numbers modest so stacking feels rewarding but not
//     runaway.
//   - No prereq cycles: a synergy that requires activity A to boost activity A
//     is an infinite loop of nonsense. Lint below warns in dev.
//
// Shape:
//   {
//     targets: 'ACTIVITY_ID' | 'BRANCH:energy' | '*',  // what gets boosted
//     requires: string[],                              // researched IDs required (AND)
//     effect: {
//       yieldMult?: number,    // multiplier applied to adoption gain
//       costMult?: number,     // multiplier applied to deploy cost
//       willCostMult?: number, // multiplier on will cost (0 = refund, 1 = unchanged)
//     },
//     label: string,           // one-line UI description ("Charging grid ready")
//     id: string,              // stable id used as a badge key
//   }

export const SYNERGIES = [
  // ─── Energy + grid = electrification actually works ───────────────────
  {
    id: 'grid_ready_ev',
    targets: 'ev_subsidies',
    requires: ['grid_mod'],
    effect: { yieldMult: 1.5 },
    label: 'Grid ready for EVs',
  },
  {
    id: 'grid_ready_ev_mandate',
    targets: 'ev_mandates',
    requires: ['grid_mod'],
    effect: { yieldMult: 1.5 },
    label: 'Grid ready for EVs',
  },
  {
    id: 'grid_ready_industry',
    targets: 'industrial_electric',
    requires: ['grid_mod'],
    effect: { yieldMult: 1.4 },
    label: 'Electrification backbone online',
  },

  // ─── Carbon pricing = market signal boosts everything green ───────────
  {
    id: 'price_signal_energy',
    targets: 'BRANCH:energy',
    requires: ['carbon_price'],
    effect: { yieldMult: 1.3 },
    label: 'Carbon price rewards clean power',
  },
  {
    id: 'price_signal_industry',
    targets: 'BRANCH:industry',
    requires: ['carbon_price'],
    effect: { yieldMult: 1.25 },
    label: 'Carbon price prices out coal',
  },

  // ─── Finance = everything cheaper ──────────────────────────────────────
  {
    id: 'green_finance_global',
    targets: '*',
    requires: ['green_bonds'],
    effect: { costMult: 0.9 },
    label: 'Green bonds finance the buildout',
  },
  {
    id: 'climate_finance_devworld',
    targets: '*',
    requires: ['climate_finance'],
    effect: { costMult: 0.85, willCostMult: 0.5 },
    label: 'Climate Finance Pact unlocks capital + consent',
  },

  // ─── Land bundles — regen ag + reforestation compound ──────────────────
  {
    id: 'soil_carbon_stack',
    targets: 'reforestation',
    requires: ['regen_ag'],
    effect: { yieldMult: 1.4 },
    label: 'Soil carbon compounds with forests',
  },
  {
    id: 'farm_forest_stack',
    targets: 'regen_ag',
    requires: ['reforestation'],
    effect: { yieldMult: 1.4 },
    label: 'Agroforestry co-benefits',
  },
  {
    id: 'blue_carbon_stack',
    targets: 'mangrove',
    requires: ['kelp_forests'],
    effect: { yieldMult: 1.3 },
    label: 'Blue-carbon shoreline-to-seabed chain',
  },

  // ─── Capture tech compounds with methane enforcement ───────────────────
  {
    id: 'methane_capture_combo',
    targets: 'BRANCH:capture',
    requires: ['methane_plus'],
    effect: { yieldMult: 1.35 },
    label: 'Methane crackdown frees capture budgets',
  },

  // ─── FFSC + renewables: cutting subsidies makes clean win on price ─────
  {
    id: 'subsidy_cut_solar',
    targets: 'solar_power',
    requires: ['ffsc'],
    effect: { yieldMult: 1.4 },
    label: 'Fossil subsidies gone — solar wins on price',
  },
  {
    id: 'subsidy_cut_wind',
    targets: 'wind_power',
    requires: ['ffsc'],
    effect: { yieldMult: 1.4 },
    label: 'Fossil subsidies gone — wind wins on price',
  },

  // ─── Heat pumps + retrofits: the building decarb flywheel ──────────────
  {
    id: 'envelope_first',
    targets: 'heat_pumps',
    requires: ['retrofits'],
    effect: { yieldMult: 1.3 },
    label: 'Insulated envelopes let heat pumps shine',
  },

  // ─── Transport bundles ─────────────────────────────────────────────────
  {
    id: 'rail_after_ice',
    targets: 'hsr',
    requires: ['ice_phaseout'],
    effect: { yieldMult: 1.3 },
    label: 'No-combustion laws fill trains',
  },
];

// ─── Lookup helpers ────────────────────────────────────────────────────────

// Return every synergy that currently applies to (activity, country).
// Pure: takes state snapshot, returns a fresh array. Safe to call per-frame.
export function activeSynergiesFor(state, activity) {
  if (!activity) return [];
  const researched = state?.world?.researched;
  if (!researched) return [];
  const out = [];
  for (const s of SYNERGIES) {
    if (!matchesTarget(s.targets, activity)) continue;
    if (!s.requires.every(r => researched.has(r))) continue;
    out.push(s);
  }
  return out;
}

function matchesTarget(target, activity) {
  if (target === '*') return true;
  if (typeof target === 'string' && target.startsWith('BRANCH:')) {
    return activity.branch === target.slice(7);
  }
  return target === activity.id;
}

// Combine a list of synergies into one effect object for math:
//   { yieldMult, costMult, willCostMult }
// Multipliers compound multiplicatively.
export function combineEffects(synergies) {
  let yieldMult = 1, costMult = 1, willCostMult = 1;
  for (const s of synergies) {
    if (s.effect?.yieldMult    != null) yieldMult    *= s.effect.yieldMult;
    if (s.effect?.costMult     != null) costMult     *= s.effect.costMult;
    if (s.effect?.willCostMult != null) willCostMult *= s.effect.willCostMult;
  }
  return { yieldMult, costMult, willCostMult };
}

// Dev-only self-check. Flags accidental self-loops (synergy requires itself).
// Safe to run at module load — it's a one-shot.
if (typeof globalThis !== 'undefined' && typeof console !== 'undefined') {
  for (const s of SYNERGIES) {
    if (typeof s.targets === 'string' && !s.targets.startsWith('BRANCH:') && s.targets !== '*') {
      if (s.requires.includes(s.targets)) {
        console.warn(`[synergies] ${s.id} requires its own target ${s.targets}`);
      }
    }
  }
}
