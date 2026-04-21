// Plague-Inc style opportunity bubbles. Each type has a distinct strategic
// effect beyond its Credit payout — encourages active, informed play.
//
//   🌱 Grassroots         (60%): +3 credits, +4 Political Will in spawn country
//   🍃 ESG Shift          (25%): +5 credits, +4% adoption in country's leading sector
//   ⭐ Climate Rally      (12%): +8 credits, +6 Will in country, +4 Will in neighbors
//   💎 Policy Breakthrough (3%): +14 credits, 30% off research for 4 ticks
//
// Spawn probability is weighted toward high-emission countries — that's where
// the fight matters and the reward should feel commensurate.

export const COLLECTABLE_TYPES = {
  sprout:  { id: 'sprout',  icon: '<span class="gi gi-sprout"></span>',  label: 'Grassroots',           value: 3,  effect: 'will_local',     effectLabel: '+4 Will' },
  leaf:    { id: 'leaf',    icon: '<span class="gi gi-leaf"></span>',    label: 'ESG Shift',            value: 5,  effect: 'adoption_boost', effectLabel: '+4% lead sector' },
  star:    { id: 'star',    icon: '<span class="gi gi-star"></span>',    label: 'Climate Rally',        value: 8,  effect: 'will_region',    effectLabel: '+6 Will / +4 neighbors' },
  diamond: { id: 'diamond', icon: '<span class="gi gi-diamond"></span>', label: 'Policy Breakthrough', value: 14, effect: 'research_off',   effectLabel: '30% off research 4t' },
};

// Cumulative-probability table. Roll one uniform [0,1); whichever threshold
// you land under wins.
export const COLLECTABLE_ROLL_TABLE = [
  { type: 'diamond', upTo: 0.03 },
  { type: 'star',    upTo: 0.15 },
  { type: 'leaf',    upTo: 0.40 },
  { type: 'sprout',  upTo: 1.00 },
];
