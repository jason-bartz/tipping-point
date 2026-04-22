// Opportunity bubbles that pop on the map. Each type has a distinct strategic
// effect beyond its Credit payout — encourages active, informed play.
//
//   🌱 Grassroots         (54%): +2 credits, +4 Political Will in spawn country
//   🌻 Garden Plot         (8%): +1 credit,  +3% Land adoption in spawn country
//   🍃 ESG Shift          (23%): +3 credits, +4% adoption in country's leading sector
//   ⭐ Climate Rally      (12%): +5 credits, +6 Will in country, +4 Will in neighbors
//   💎 Policy Breakthrough (3%): +8 credits, 30% off research for 4 ticks
//
// Spawn probability is weighted toward high-emission countries — that's where
// the fight matters and the reward should feel commensurate.

export const COLLECTABLE_TYPES = {
  sprout:  { id: 'sprout',  icon: '<span class="gi gi-sprout"></span>',  label: 'Grassroots',           value: 2, effect: 'will_local',     effectLabel: '+4 Will' },
  garden:  { id: 'garden',  icon: '<span class="gi gi-sprout"></span>',  label: 'Garden Plot',          value: 1, effect: 'land_boost',     effectLabel: '+3% Land' },
  leaf:    { id: 'leaf',    icon: '<span class="gi gi-leaf"></span>',    label: 'ESG Shift',            value: 3, effect: 'adoption_boost', effectLabel: '+4% lead sector' },
  star:    { id: 'star',    icon: '<span class="gi gi-star"></span>',    label: 'Climate Rally',        value: 5, effect: 'will_region',    effectLabel: '+6 Will / +4 neighbors' },
  diamond: { id: 'diamond', icon: '<span class="gi gi-diamond"></span>', label: 'Policy Breakthrough', value: 8, effect: 'research_off',   effectLabel: '30% off research 4t' },
};

// Cumulative-probability table. Roll one uniform [0,1); whichever threshold
// you land under wins. Garden Plot is carved out of Grassroots' 60% share —
// flavored differently, functionally distinct.
export const COLLECTABLE_ROLL_TABLE = [
  { type: 'diamond', upTo: 0.03 },
  { type: 'star',    upTo: 0.15 },
  { type: 'leaf',    upTo: 0.38 },
  { type: 'garden',  upTo: 0.46 },
  { type: 'sprout',  upTo: 1.00 },
];
