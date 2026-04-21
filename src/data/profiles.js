// Country profiles — each starter is its own "civilization" with distinct
// flavor, strengths, challenges, and one signature mechanical bonus. There's
// no separate strategy pick: the country IS the strategy.
// `mod` mirrors the old strategy modifier shape so system code stays simple.

export const COUNTRY_PROFILES = {
  NDC: {
    difficulty: 'easy',
    title: 'Nordic Bloc',
    subtitle: 'Lighthouse of the North',
    writeup: 'Sweden, Norway, Finland, Denmark. You inherit the most advanced climate governance on the planet — clean grids, carbon pricing with teeth, and a population that already treats climate seriously. Your problem is not starting. It is scaling beyond your borders: your emissions are a rounding error, so victory means exporting your playbook.',
    strengths: ['Starting political will 85+', 'Clean energy mix already embedded', 'Trusted mediator across EU'],
    challenges: ['Tiny emissions footprint — you must lead, not defeat', 'Small market, limited manufacturing leverage'],
    recommended: 'Invest early in Policy to unlock diffusion-friendly treaties. Your activities spread fast — set the standard and let Europe follow.',
    bonusLabel: 'Lead by Example — adoption spreads 25% faster to neighbors',
    starter: ['offshore_wind', 'heat_pumps'],
    mod: { researchMult: 1.0, deployMult: 1.0, spreadMult: 1.25, cpMult: 1.0, natureBonus: 1.0 },
  },
  DEU: {
    difficulty: 'easy',
    title: 'Germany',
    subtitle: 'The Reluctant Engineer',
    writeup: 'A manufacturing titan mid-pivot. The Energiewende was real but incomplete, and legacy industry — chemicals, steel, autos — still drives policy. You have world-class R&D and an anxious public. You also have one of the last big coal phase-outs in Europe still to finish.',
    strengths: ['Strong research base (25% faster research)', 'Industrial capacity to build at scale', 'Central European leverage — four neighbors'],
    challenges: ['Heavy industry resists change', 'Political swings can undo progress'],
    recommended: 'Lean on Energy and Industry research. Green steel and industrial electrification unlock cascades across Europe.',
    bonusLabel: 'Made in Germany — research completes 15% faster',
    starter: ['solar_power', 'grid_mod'],
    mod: { researchMult: 0.85, deployMult: 1.0, spreadMult: 1.10, cpMult: 1.0, natureBonus: 1.0 },
  },
  GBR: {
    difficulty: 'med',
    title: 'United Kingdom',
    subtitle: 'The Financial Broker',
    writeup: 'London is where climate finance lives. You have the City, a functioning Climate Change Act, and a services economy that can decarbonize relatively cheaply. What you do not have is a lot of factories — your leverage comes from moving money, not building things.',
    strengths: ['15% more Credits per quarter (climate finance hub)', 'Mature policy infrastructure', 'Global reach via Commonwealth'],
    challenges: ['Limited manufacturing base', 'Trans-Atlantic political volatility'],
    recommended: 'Open with Policy and Finance branches. Your Credit advantage compounds — invest it into Tier 3 capstones early.',
    bonusLabel: 'City of London — +15% Carbon Credit income',
    starter: ['green_bonds', 'carbon_price'],
    mod: { researchMult: 1.0, deployMult: 1.0, spreadMult: 1.0, cpMult: 1.15, natureBonus: 1.0 },
  },
  JPN: {
    difficulty: 'med',
    title: 'Japan',
    subtitle: 'Precision and Patience',
    writeup: 'An aging, disciplined society with deep engineering culture and a stubborn dependence on imported fossil fuels. Post-Fukushima energy policy is still unresolved. You have an extraordinary appetite for long-term plans — and a narrow political corridor to execute them.',
    strengths: ['Research 15% faster', 'Disciplined implementation (reliable adoption)', 'Pacific Rim reach'],
    challenges: ['Limited land and domestic resources', 'Demographic pressure on state capacity'],
    recommended: 'Industry and Transport play to your strengths. Nuclear SMRs are politically available in a way they are not elsewhere.',
    bonusLabel: 'Monozukuri — research completes 15% faster',
    starter: ['nuclear_smr', 'hsr'],
    mod: { researchMult: 0.85, deployMult: 1.0, spreadMult: 1.0, cpMult: 1.0, natureBonus: 1.0 },
  },
  BRA: {
    difficulty: 'med',
    title: 'Brazil',
    subtitle: 'Guardian of the Canopy',
    writeup: 'Half of the global land-carbon story runs through your forests. You have hydro-dominant grids and a vibrant, polarized democracy. The Amazon is your greatest asset and your greatest liability — as it warms, it flips from sink to source.',
    strengths: ['Nature-based removals 60% more effective', 'Clean hydro base', 'Cultural soft power across Latin America'],
    challenges: ['Deforestation pressure from agriculture', 'Amazon dieback risk at +1.6°C'],
    recommended: 'Land branch is your superpower. Reforestation + Rewilding + Mangroves compound fast. Watch the temperature gauge.',
    bonusLabel: 'Forest Guardian — nature-based CO₂ removal 60% stronger',
    starter: ['reforestation', 'regen_ag'],
    mod: { researchMult: 1.0, deployMult: 1.0, spreadMult: 1.0, cpMult: 1.0, natureBonus: 1.6 },
  },
  USA: {
    difficulty: 'hard',
    title: 'United States',
    subtitle: 'The Swing Vote',
    writeup: "The world's second-largest emitter, its largest economy, and its most politically volatile climate actor. Every four years the policy regime flips. You have unmatched R&D, venture capital, and manufacturing — and a public that alternates between urgency and denial.",
    strengths: ['10% more Credits per quarter', 'Massive domestic market', 'Tech innovation flywheel'],
    challenges: ['Polarized politics — events hit harder here', 'Huge emissions base to decarbonize'],
    recommended: 'Build fast in the good years; every Tier 1 deploy matters. Global Carbon Market and Climate Finance amplify your reach.',
    bonusLabel: 'Dollar Diplomacy — +10% Carbon Credits, deploys cost 5% less',
    starter: ['ev_subsidies', 'green_bonds'],
    mod: { researchMult: 1.0, deployMult: 0.95, spreadMult: 1.0, cpMult: 1.10, natureBonus: 1.0 },
  },
  CHN: {
    difficulty: 'hard',
    title: 'China',
    subtitle: 'The Factory of the World',
    writeup: 'One country, a quarter of global emissions, and the deployment muscle of the industrial revolution compressed into a decade. You build solar panels cheaper than anyone. You also burn more coal than anyone. State capacity is enormous; political will has to be manufactured alongside the hardware.',
    strengths: ['Deployments cost 30% less', 'Unmatched build speed', 'Regional gravitational pull across Asia'],
    challenges: ['Largest emissions base on earth', 'Coal-dependent industrial core'],
    recommended: "Deploy aggressively. Your discount means Tier 2 activities are cheaper than most countries' Tier 1. Push Energy and Transport fast.",
    bonusLabel: 'Scale Advantage — deploys cost 30% less',
    starter: ['solar_power', 'ev_subsidies'],
    mod: { researchMult: 1.0, deployMult: 0.70, spreadMult: 1.0, cpMult: 1.0, natureBonus: 1.0 },
  },
  IND: {
    difficulty: 'hard',
    title: 'India',
    subtitle: 'The Leapfrogger',
    writeup: 'You are industrializing and decarbonizing at once — a thing nobody has done before. Cheap solar has bent your curve, but 1.4 billion people still need energy that most of them have never had. Coal is entrenched. The sun is free.',
    strengths: ['Spread 20% faster across South Asia', 'Youth-driven political pressure', 'Solar resource abundance'],
    challenges: ['Energy demand still rising', 'Thermal coal fleet locked in for decades'],
    recommended: 'Energy + Policy. Every solar deploy here ripples across neighbors. Carbon pricing is politically possible earlier here than in petrostates.',
    bonusLabel: 'Monsoon Majority — adoption spreads 20% faster regionally',
    starter: ['solar_power', 'cycling_infra'],
    mod: { researchMult: 1.0, deployMult: 1.0, spreadMult: 1.20, cpMult: 1.0, natureBonus: 1.0 },
  },
  SAU: {
    difficulty: 'vhard',
    title: 'Saudi Arabia',
    subtitle: 'Pivoting the Petrostate',
    writeup: 'The hardest opening in the game. Your economy is oil. Your politics is oil. Your foreign policy is oil. But you have sunlight in biblical quantities and a sovereign wealth fund that could buy a hemisphere. Pull this off and the whole Gulf follows.',
    strengths: ['20% more Credits (petrodollar reinvestment)', 'Vision-style top-down execution', 'Gulf bloc influence'],
    challenges: ['Starting political will only 45', 'Deep petrostate resistance to Energy/Policy'],
    recommended: 'Start with Solar and Green Bonds. Buy your way through Tier 2. Every Gulf neighbor that flips is a tectonic shift.',
    bonusLabel: 'Sovereign Wealth — +20% Carbon Credits',
    starter: ['solar_power', 'green_bonds'],
    mod: { researchMult: 1.0, deployMult: 1.0, spreadMult: 1.0, cpMult: 1.20, natureBonus: 1.0 },
  },
  RUS: {
    difficulty: 'vhard',
    title: 'Russia',
    subtitle: 'The Frozen Giant',
    writeup: 'A vast country with unmatched engineering heritage, frozen politics, and a tundra that is thawing faster every year. Methane plumes are rewriting your northern territory while oil and gas revenues defend the status quo. Your nuclear fleet is real. Your bureaucracy is slower.',
    strengths: ['25% faster research (Soviet engineering legacy)', 'Nuclear fleet intact', 'Vast land for nature-based solutions'],
    challenges: ['Permafrost methane threat accelerates with warming', 'Political will starts below 40', 'Petrostate economic structure'],
    recommended: 'Research-heavy. Nuclear SMRs, grid mod, industrial electrification. Keep temperature down or the tundra finishes you.',
    bonusLabel: 'Steel and Science — research 25% faster',
    starter: ['nuclear_smr', 'grid_mod'],
    mod: { researchMult: 0.75, deployMult: 1.0, spreadMult: 1.0, cpMult: 1.0, natureBonus: 1.0 },
  },
};

// Fallback modifier for non-profiled countries (e.g. a custom save that
// references an ID we no longer expose in the starter list).
export const DEFAULT_MOD = { researchMult: 1.0, deployMult: 1.0, spreadMult: 1.0, cpMult: 1.0, natureBonus: 1.0 };

// Ordered starter roster (easy → very hard) for the country-select screen.
export const STARTER_ORDER = ['NDC','DEU','GBR','JPN','BRA','USA','CHN','IND','SAU','RUS'];

export const DIFFICULTY_LABEL = { easy: 'EASY', med: 'MEDIUM', hard: 'HARD', vhard: 'VERY HARD' };

// Per-country starting adoption reflects real-world climate progress as of
// the mid-2020s. Derived from infra profile with country-specific overrides.
export const STARTING_ADOPTION_BY_INFRA = {
  service:      { energy: 0.12, transport: 0.10, industry: 0.08, land: 0.05, capture: 0.02, policy: 0.12 },
  industrial:   { energy: 0.10, transport: 0.05, industry: 0.10, land: 0.04, capture: 0.02, policy: 0.08 },
  petrostate:   { energy: 0.02, transport: 0.03, industry: 0.04, land: 0.03, capture: 0.02, policy: 0.02 },
  mixed:        { energy: 0.07, transport: 0.05, industry: 0.07, land: 0.07, capture: 0.01, policy: 0.06 },
  agricultural: { energy: 0.05, transport: 0.03, industry: 0.04, land: 0.12, capture: 0.01, policy: 0.04 },
};

export const COUNTRY_STARTING_OVERRIDES = {
  NDC: { energy:  0.12, policy:  0.08, transport:  0.04 },
  DEU: { energy:  0.10, transport: 0.04 },
  FRA: { energy:  0.15, policy:  0.04 },
  GBR: { energy:  0.06, policy:  0.05 },
  BEN: { energy:  0.06, policy:  0.06 },
  EUE: { energy:  0.03, policy:  0.03 },
  CHN: { energy:  0.05, industry: 0.04, transport: 0.03 },
  USA: { energy:  0.04, transport: 0.04 },
  JPN: { industry: 0.04, transport: 0.03 },
  KOR: { industry: 0.05 },
  BRA: { land:    0.06 },
  IND: { energy:  0.03 },
  SAU: { energy: -0.01, policy: -0.02 },
  IRN: { energy: -0.01, policy: -0.01 },
  RUS: { energy: -0.01, policy: -0.02 },
  GLF: { energy: -0.01 },
};

export function startingAdoption(country) {
  const base = { ...(STARTING_ADOPTION_BY_INFRA[country.infra] ?? STARTING_ADOPTION_BY_INFRA.mixed) };
  const overrides = COUNTRY_STARTING_OVERRIDES[country.id] ?? {};
  for (const k of Object.keys(base)) {
    base[k] = Math.max(0, Math.min(0.5, base[k] + (overrides[k] ?? 0)));
  }
  return base;
}
