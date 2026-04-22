// Event pool — designed like a D&D DM's table. Events fire on a per-tick RNG
// roll (BALANCE.eventFireChancePerTick), then a weighted pick runs among
// those whose `guard` passes. Targeted events select a country dynamically.
//
// Event shape:
//   { id, weight, tone: 'good'|'bad'|'neutral',
//     title,    headline          — string or (state, ctx) => string
//     target?                      — (state, rng) => country (event skipped if null)
//     guard?                       — (state) => boolean
//     effects?: Effect[]           — declarative effects (preferred)
//     apply?:   (state, ctx) => void  — escape hatch for odd cases
//     interactive?: true           — pops a choice modal
//     choices?: [{ key, label, headline, tone, effects?, apply? }]
//   }
//
// Effects schema: see src/model/Events.js. If both `effects` and `apply` are
// provided, effects run first, then apply. Most events are now fully
// declarative; a handful use `apply` for compound logic that's not worth
// expressing as a new op.
//
// All random draws on the event go through state.meta.rng so replays and
// saves are deterministic-ish (bounded by what mulberry32 guarantees).

export const EVENT_POOL = [
  // ═══════════════ GLOBAL CRISES (always eligible) ═══════════════
  { id: 'oil_lobby', weight: 3, tone: 'bad', title: 'Oil Lobby Wins Exemption',
    headline: 'Oil exporters win a UN carve-out. Petrostate resolve weakens.',
    effects: [
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -12 },
    ] },

  { id: 'heat_dome', weight: 4, tone: 'bad', title: 'Record Heat Dome',
    headline: 'Unprecedented heat wave kills thousands. Public demands action.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: 4 },
      { op: 'addWorld', field: 'societalStress', value: 6 },
    ] },

  { id: 'recession', weight: 2, tone: 'bad', title: 'Global Recession',
    headline: 'Markets crater. Green budgets first to the chopping block.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -8 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
    ] },

  { id: 'wildfire', weight: 3, tone: 'bad', title: 'Megafire Season',
    headline: 'Boreal forests burn. Carbon sinks turn to sources for a season.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.5 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
    ] },

  { id: 'greenwash', weight: 2, tone: 'bad', title: 'Greenwashing Scandal',
    headline: 'Major polluter caught faking credits. Public trust dips.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 3 },
      { op: 'addWorld', field: 'climatePoints', value: -4 },
    ] },

  { id: 'supply_shock', weight: 2, tone: 'bad', title: 'Supply Chain Shock',
    headline: 'Rare earth bottleneck. Clean energy rollouts stall.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -5 },
    ] },

  { id: 'cyber_grids', weight: 2, tone: 'bad', title: 'Grid Cyber Attack',
    headline: 'State-backed hackers hit renewable grids. Electrification wobbles.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.03 },
      { op: 'addWorld', field: 'societalStress', value: 3 },
    ] },

  { id: 'populist_surge', weight: 2, tone: 'bad', title: 'Populist Backlash',
    headline: '"Green costs too much" becomes a winning slogan worldwide.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: -6 },
    ] },

  { id: 'fossil_subs_return', weight: 2, tone: 'bad', title: 'Fossil Subsidies Return',
    headline: 'Emergency fuel subsidies rolled out. Climate fund raided.',
    effects: [
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'adoption.policy', value: -0.05 },
      { op: 'addWorld', field: 'climatePoints', value: -4 },
    ] },

  // ═══════════════ GUARDED TIPPING-POINT DOOM ═══════════════
  { id: 'methane_burp', weight: 1, tone: 'bad', title: 'Permafrost Methane Burp',
    guard: (s) => s.world.tempAnomalyC > 1.7,
    headline: 'Arctic permafrost thaws. Methane plumes spike atmospheric CO₂e.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 1.5 },
      { op: 'addWorld', field: 'societalStress', value: 5 },
    ] },

  { id: 'arctic_ice_free', weight: 1, tone: 'bad', title: 'Summer Arctic Ice-Free',
    guard: (s) => s.world.tempAnomalyC > 1.9,
    headline: 'First ice-free Arctic summer. Albedo collapses. Warming accelerates.',
    effects: [
      { op: 'addWorld', field: 'tempAnomalyC', value: 0.12, max: 3.0 },
      { op: 'addWorld', field: 'societalStress', value: 6 },
    ] },

  { id: 'amazon_dieback', weight: 1, tone: 'bad', title: 'Amazon Dieback',
    guard: (s) => s.countries.BRA && s.countries.BRA.adoption.land < 0.4 && s.world.tempAnomalyC > 1.6,
    headline: 'Amazon shifts from rainforest to savanna. Massive carbon release.',
    // Specific country targeted by id — not a random target, so we keep the
    // Brazil-adoption tweak in `apply` for clarity. The world hits we model
    // declaratively.
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 1.0 },
      { op: 'addWorld', field: 'societalStress', value: 6 },
    ],
    apply: (s) => {
      const brz = s.countries.BRA;
      if (brz) brz.adoption.land = Math.max(0, brz.adoption.land - 0.2);
    } },

  { id: 'coral_bleach', weight: 2, tone: 'bad', title: 'Global Coral Bleaching',
    guard: (s) => s.world.tempAnomalyC > 1.5,
    headline: 'Reefs 90% dead. Coastal fisheries collapse. Trust in targets erodes.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: -5 },
      { op: 'addWorld', field: 'societalStress', value: 5 },
    ] },

  { id: 'carbon_bomb', weight: 1, tone: 'bad', title: 'Carbon Bomb Approved',
    guard: (s) => !s.world.researched.has('ffsc'),
    headline: 'A mega oilfield is greenlit. A decade of emissions locked in.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.4 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -5 },
    ] },

  // ═══════════════ GLOBAL OPPORTUNITIES ═══════════════
  { id: 'solar_breakthrough', weight: 3, tone: 'good', title: 'Solar Efficiency Leap',
    headline: 'Perovskite tandem cells hit 33% in mass production.',
    effects: [{ op: 'addWorld', field: 'climatePoints', value: 10 }] },

  { id: 'youth_surge', weight: 3, tone: 'good', title: 'Youth Climate Surge',
    headline: 'Student strikes go viral. Governments blink on climate policy.',
    effects: [{ op: 'addAllCountries', field: 'politicalWill', value: 6 }] },

  { id: 'fusion', weight: 1, tone: 'good', title: 'Fusion Ignition',
    headline: 'Net-energy-gain fusion confirmed. Timeline to grid: uncertain.',
    effects: [{ op: 'addWorld', field: 'climatePoints', value: 14 }] },

  { id: 'battery', weight: 2, tone: 'good', title: 'Sodium-Ion Battery Leap',
    headline: 'Cheap grid storage at scale. Renewables become dispatchable.',
    effects: [{ op: 'addWorld', field: 'climatePoints', value: 8 }] },

  { id: 'methane_pledge', weight: 2, tone: 'good', title: 'Methane Pledge Expands',
    headline: 'More signatories, real teeth. Oil and gas leakage drops.',
    effects: [{ op: 'addAllCountries', field: 'adoption.policy', value: 0.04 }] },

  { id: 'green_bonds_sub', weight: 2, tone: 'good', title: 'Green Bonds Oversubscribed',
    headline: 'Bond issue 4x oversubscribed. Capital floods clean projects.',
    effects: [{ op: 'addWorld', field: 'climatePoints', value: 8 }] },

  { id: 'cop_win', weight: 2, tone: 'good', title: 'COP Summit Delivers',
    headline: 'Historic deal signed. Commitments become binding.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 10 },
      { op: 'addAllCountries', field: 'adoption.policy', value: 0.03 },
    ] },

  { id: 'hydrogen_scales', weight: 2, tone: 'good', title: 'Green Hydrogen Scales',
    headline: 'Electrolyzer costs drop 60%. Industry starts to decarbonize.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 10 },
      { op: 'addAllCountries', field: 'adoption.industry', value: 0.03 },
    ] },

  { id: 'dac_cheap', weight: 2, tone: 'good', title: 'DAC Cost Collapses',
    headline: 'Direct air capture hits $100/tonne. Removal markets boom.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 8 },
      { op: 'addAllCountries', field: 'adoption.capture', value: 0.04 },
    ] },

  { id: 'cultural_shift', weight: 2, tone: 'good', title: 'Cultural Shift',
    headline: 'Bikes, heat pumps, plant-based food — the default cool.',
    effects: [{ op: 'addAllCountries', field: 'politicalWill', value: 5 }] },

  { id: 'shareholder_revolt', weight: 2, tone: 'good', title: 'Shareholder Revolt',
    headline: 'Pension funds force climate mandates on all holdings.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 6 },
      { op: 'addCountries', where: { infra: ['industrial', 'service'] }, field: 'adoption.industry', value: 0.02 },
    ] },

  { id: 'transit_wave', weight: 2, tone: 'good', title: 'Transit Renaissance',
    headline: 'Cities rip out highways, add trains. Traffic deaths drop.',
    effects: [
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.transport', value: 0.05 },
    ] },

  { id: 'zero_waste', weight: 2, tone: 'good', title: 'Zero-Waste Movement',
    headline: 'Right-to-repair laws spread. Circular economy goes mainstream.',
    effects: [{ op: 'addAllCountries', field: 'adoption.industry', value: 0.03 }] },

  { id: 'urban_greening', weight: 2, tone: 'good', title: 'Urban Greening Boom',
    headline: 'Cities plant a billion trees. Heat islands cool, birds return.',
    effects: [
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.land', value: 0.04 },
    ] },

  { id: 'peat_restored', weight: 2, tone: 'good', title: 'Peatlands Restored',
    headline: 'Rewetting projects take off. Peat bogs become carbon banks.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 6 },
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
    ] },

  // ═══════════════ COUNTRY-TARGETED (dynamic headlines) ═══════════════
  { id: 'election_flip_good', weight: 3, tone: 'good', title: 'Green Landslide',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `${ctx.target.name} elects a green government in a landslide.`,
    effects: [{ op: 'addTarget', field: 'politicalWill', value: 20 }] },

  { id: 'denier_elected', weight: 2, tone: 'bad', title: 'Climate Skeptic Elected',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.baseEmissionsGtCO2 > 0.8)),
    headline: (s, ctx) => `${ctx.target.name} elects a climate skeptic. Green programs rolled back.`,
    effects: [
      { op: 'addTargetAllBranches', value: -0.15 },
      { op: 'addTarget', field: 'politicalWill', value: -20 },
    ] },

  { id: 'climate_mayor', weight: 3, tone: 'good', title: 'Climate Mayor Elected',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `Climate champion takes office in ${ctx.target.name}'s largest city.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: 8 },
      { op: 'addTargetRandomBranch', value: 0.03, branches: ['energy', 'transport', 'land'] },
    ] },

  { id: 'protests_erupt', weight: 3, tone: 'neutral', title: 'Climate Protests Erupt',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `Climate protests paralyze ${ctx.target.name}. Politicians cave.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: 10 },
      { op: 'addWorld', field: 'societalStress', value: 3 },
    ] },

  { id: 'strike_industrial', weight: 2, tone: 'bad', title: 'Industrial Strike',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'industrial')),
    headline: (s, ctx) => `Workers walk out across ${ctx.target?.name}. Green transition now center-stage.`,
    effects: [
      { op: 'addTarget', field: 'adoption.industry', value: -0.04 },
      { op: 'addTarget', field: 'politicalWill', value: 4 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'wildfire_local', weight: 3, tone: 'bad', title: 'Wildfires Rage',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `Catastrophic wildfires sweep ${ctx.target.name}. Forests to ash.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: -0.06 },
      { op: 'addTarget', field: 'politicalWill', value: -4 },
      { op: 'addWorld', field: 'co2ppm', value: 0.2 },
    ] },

  { id: 'flood_local', weight: 3, tone: 'bad', title: 'Record Flooding',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `Thousand-year floods hit ${ctx.target.name}. Climate denial gets quieter there.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: 6 },
      { op: 'addWorld', field: 'societalStress', value: 3 },
    ] },

  { id: 'drought_local', weight: 2, tone: 'bad', title: 'Mega-Drought',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural')),
    headline: (s, ctx) => `${ctx.target?.name} enters its third year of drought. Crops fail, rivers dry.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: -0.05 },
      { op: 'addTarget', field: 'politicalWill', value: -5 },
    ] },

  // ═══════════════ DISASTER EVENTS (interactive, hero-image) ═══════════════
  // These differ from the fire-and-forget local beats above: each pops a
  // modal with a pixel-art hero image and a "spend to protect" vs "eat the
  // damage" choice. Cadence is extra-gated in EventSystem by
  // BALANCE.disasterMinGapTicks so a run can't get carpet-bombed. Guards are
  // temp-tiered so early-game sees only a small pool; late-game unlocks
  // hurricanes, blizzards, and the drought→famine chain.

  { id: 'wildfire_disaster', weight: 3, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Wildfires Rage', heroImage: '/disasters/wildfires.webp',
    guard: (s) => s.world.tempAnomalyC >= 1.2,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.climateVulnerability >= 1.5)),
    headline: (s, ctx) => `Megafires consume forests across ${ctx.target?.name}. Smoke blackens the sky for a thousand miles. Evacuations underway.`,
    choices: [
      { key: 'deploy_aid', label: 'Deploy emergency aid ($$$)', headline: 'Federal crews mobilize. Lines hold. The forests are still gone, but the towns are not.', tone: 'neutral',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -6 },
          { op: 'addTarget', field: 'adoption.land', value: -0.03 },
          { op: 'addTarget', field: 'politicalWill', value: 4 },
          { op: 'addWorld', field: 'co2ppm', value: 0.3 },
        ],
        echo: { delayTicks: 10, tone: 'good',
          headline: (s, ctx) => `Two years on, ${ctx?.target?.name ?? 'the country'} credits the rapid response for saving three towns. The reforestation line-item finally passes.` } },
      { key: 'let_burn', label: 'Let it burn, focus elsewhere', headline: 'Towns lost. Satellite images go viral. The land will not recover this decade.', tone: 'bad',
        effects: [
          { op: 'addTarget', field: 'adoption.land', value: -0.08 },
          { op: 'addTarget', field: 'politicalWill', value: -10 },
          { op: 'addWorld', field: 'co2ppm', value: 0.7 },
          { op: 'addWorld', field: 'societalStress', value: 4 },
        ],
        echo: { delayTicks: 12, tone: 'bad',
          headline: (s, ctx) => `Three years on, ${ctx?.target?.name ?? 'the country'}'s forest belt has shifted north by a hundred miles. What burned did not grow back.` } },
    ] },

  { id: 'flood_disaster', weight: 3, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Catastrophic Flooding', heroImage: '/disasters/flood.webp',
    guard: (s) => s.world.tempAnomalyC >= 1.2,
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `A month's rain falls in a day across ${ctx.target?.name}. Rivers jump banks. Subways fill. Denial gets quiet.`,
    choices: [
      { key: 'rebuild_green', label: 'Fund resilient rebuild ($$$)', headline: 'New levees rise. Wetlands restored. The next flood will hit softer ground.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -8 },
          { op: 'addTarget', field: 'adoption.policy', value: 0.05 },
          { op: 'addTarget', field: 'politicalWill', value: 8 },
          { op: 'addWorld', field: 'societalStress', value: 2 },
        ],
        echo: { delayTicks: 14, tone: 'good',
          headline: (s, ctx) => `Three years on, ${ctx?.target?.name ?? 'the region'}'s rebuild is the template. Insurance premiums actually fall.` } },
      { key: 'cheap_rebuild', label: 'Rebuild as-is, it was fine before', headline: 'Cranes go up. Concrete returns. The architects quietly bet on the next one.', tone: 'bad',
        effects: [
          { op: 'addTarget', field: 'adoption.policy', value: -0.04 },
          { op: 'addTarget', field: 'politicalWill', value: -6 },
          { op: 'addWorld', field: 'societalStress', value: 4 },
        ],
        echo: { delayTicks: 14, tone: 'bad',
          headline: (s, ctx) => `Three years on, ${ctx?.target?.name ?? 'the region'} floods again. The headlines write themselves.` } },
    ] },

  { id: 'tornado_disaster', weight: 2, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Tornado Outbreak', heroImage: '/disasters/tornado.webp',
    guard: (s) => s.world.tempAnomalyC >= 1.2,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => Math.abs(c.lat ?? 0) >= 20 && Math.abs(c.lat ?? 0) <= 55)),
    headline: (s, ctx) => `A supercell outbreak carves a hundred-mile scar across ${ctx.target?.name}. Entire towns are rubble by morning.`,
    choices: [
      { key: 'retool_industry', label: 'Rebuild with clean industry', headline: 'Rebuild contracts go to electrified factories. A tragedy becomes a pilot program.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -4 },
          { op: 'addTarget', field: 'adoption.industry', value: 0.04 },
          { op: 'addTarget', field: 'politicalWill', value: 4 },
        ],
        echo: { delayTicks: 12, tone: 'good',
          headline: (s, ctx) => `Three years on, the rebuilt corridor in ${ctx?.target?.name ?? 'the region'} is the greenest industrial zone on the continent.` } },
      { key: 'rebuild_same', label: 'Rebuild what was there', headline: 'Foundations re-poured. Same pipes. Same grid. Same vulnerabilities.', tone: 'bad',
        effects: [
          { op: 'addTarget', field: 'adoption.industry', value: -0.03 },
          { op: 'addTarget', field: 'politicalWill', value: -4 },
          { op: 'addWorld', field: 'societalStress', value: 2 },
        ],
        echo: { delayTicks: 10, tone: 'bad',
          headline: (s, ctx) => `Two years on, ${ctx?.target?.name ?? 'the region'} is hit by another outbreak. The rebuilt structures fail the same way.` } },
    ] },

  { id: 'drought_disaster', weight: 3, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Multi-Year Drought', heroImage: '/disasters/drought.webp',
    guard: (s) => s.world.tempAnomalyC >= 1.4,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural' || c.climateVulnerability >= 2.0)),
    headline: (s, ctx) => `${ctx.target?.name} enters its fifth dry year. Aquifers dropping. Breadbasket turning to dust.`,
    choices: [
      { key: 'water_aid', label: 'Water infrastructure package ($$$)', headline: 'Desal plants commissioned. Irrigation modernized. Farms hold the line.', tone: 'good',
        apply: (s, ctx) => {
          s.world.climatePoints = (s.world.climatePoints ?? 0) - 8;
          if (ctx.target) {
            ctx.target.adoption.land = Math.max(0, Math.min(1, (ctx.target.adoption.land ?? 0) - 0.03));
            ctx.target.politicalWill = Math.max(8, Math.min(100, (ctx.target.politicalWill ?? 0) + 6));
          }
          // Short famine window: if the drought bites again inside 12 ticks,
          // famine becomes eligible. Expires silently otherwise.
          s.meta.droughtFamineUntilTick = s.meta.tick + 12;
        },
        summaryOverride: '-8 Credits · -0.03 Land · +6 Will',
        echo: { delayTicks: 12, tone: 'good',
          headline: (s, ctx) => `Three years on, ${ctx?.target?.name ?? 'the region'}'s new water system is studied worldwide. Yields are climbing.` } },
      { key: 'ride_it_out', label: "Ride it out, it's a dry spell", headline: 'Wells deepen. Farms fold. Grain prices jump. Queues form at food banks.', tone: 'bad',
        apply: (s, ctx) => {
          if (ctx.target) {
            ctx.target.adoption.land = Math.max(0, Math.min(1, (ctx.target.adoption.land ?? 0) - 0.08));
            ctx.target.politicalWill = Math.max(8, Math.min(100, (ctx.target.politicalWill ?? 0) - 10));
          }
          s.world.societalStress = Math.max(0, (s.world.societalStress ?? 0) + 5);
          // Longer famine window when nothing was done — the crops keep
          // failing and the next event lands harder.
          s.meta.droughtFamineUntilTick = s.meta.tick + 16;
        },
        summaryOverride: '-0.08 Land · -10 Will · +5 Stress',
        echo: { delayTicks: 10, tone: 'bad',
          headline: (s, ctx) => `Two years on, the drought has become the climate. ${ctx?.target?.name ?? 'The region'}'s farm belt is abandoned.` } },
    ] },

  { id: 'hurricane_disaster', weight: 3, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Category 6 Hurricane', heroImage: '/disasters/hurricane.webp',
    guard: (s) => s.world.tempAnomalyC >= 1.5,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.climateVulnerability >= 2.0)),
    headline: (s, ctx) => `A storm the ocean should not have been warm enough to birth makes landfall in ${ctx.target?.name}. Winds off the charts.`,
    advisorStances: [
      { advisor: 'diplomat',  supports: 'mobilize', stance: 'Open the treasury. A functioning state now is cheaper than a failed state later.' },
      { advisor: 'industrialist', supports: 'triage', stance: 'We cannot bankrupt the transition to rebuild every coast. Hard choices, now.' },
    ],
    choices: [
      { key: 'mobilize', label: 'Full emergency mobilization ($$$)', headline: 'National guard, aid convoys, federal rebuild. The country holds together.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -12 },
          { op: 'addTarget', field: 'politicalWill', value: 8 },
          { op: 'addAllCountries', field: 'politicalWill', value: 3 },
          { op: 'addWorld', field: 'societalStress', value: 3 },
        ],
        echo: { delayTicks: 16, tone: 'good',
          headline: (s, ctx) => `Four years on, ${ctx?.target?.name ?? 'the country'}'s coast is rebuilt with seawalls, mangroves, and a carbon tax to pay for it.` } },
      { key: 'triage', label: 'Triage and move on', headline: 'The cameras leave. The affected stay. The politics go rancid.', tone: 'bad',
        effects: [
          { op: 'addTarget', field: 'adoption.energy', value: -0.06 },
          { op: 'addTarget', field: 'adoption.transport', value: -0.05 },
          { op: 'addTarget', field: 'politicalWill', value: -12 },
          { op: 'addWorld', field: 'societalStress', value: 6 },
          { op: 'addWorld', field: 'co2ppm', value: 0.4 },
        ],
        echo: { delayTicks: 14, tone: 'bad',
          headline: (s, ctx) => `Three years on, the triage zones in ${ctx?.target?.name ?? 'the country'} are still there. They are now called districts.` } },
    ] },

  { id: 'famine_disaster', weight: 3, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Famine', heroImage: '/disasters/famine.webp',
    // Chain: only eligible if a drought_disaster landed recently and set the
    // window. Without that flag, famine is never on the table — preserves
    // cause-and-effect.
    guard: (s) => s.world.tempAnomalyC >= 1.7 && (s.meta.droughtFamineUntilTick ?? 0) > s.meta.tick,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural' || c.climateVulnerability >= 2.2)),
    headline: (s, ctx) => `Grain reserves hit zero in ${ctx.target?.name}. What drought began, markets finish. Food riots in three capitals.`,
    choices: [
      { key: 'aid_package', label: 'Global food aid package ($$$$)', headline: 'Convoys roll. Ports open. Nobody calls it a success, but fewer people die.', tone: 'neutral',
        apply: (s, ctx) => {
          s.world.climatePoints = (s.world.climatePoints ?? 0) - 14;
          s.world.societalStress = Math.max(0, (s.world.societalStress ?? 0) - 2);
          if (ctx.target) {
            ctx.target.politicalWill = Math.max(8, Math.min(100, (ctx.target.politicalWill ?? 0) + 6));
          }
          for (const c of Object.values(s.countries)) {
            c.politicalWill = Math.max(8, Math.min(100, (c.politicalWill ?? 0) + 2));
          }
          s.meta.droughtFamineUntilTick = 0; // consume the chain
        },
        summaryOverride: '-14 Credits · -2 Stress · +6 Will (target) · +2 Will (all)',
        echo: { delayTicks: 14, tone: 'neutral',
          headline: () => 'Three years on, the aid logistics built during the famine now run vaccine, seed, and disaster supply for a dozen countries.' } },
      { key: 'market_forces', label: 'Let the market handle it', headline: 'Grain flows to who can pay. Streets fill. Governments fall.', tone: 'bad',
        apply: (s, ctx) => {
          if (ctx.target) {
            ctx.target.politicalWill = Math.max(8, (ctx.target.politicalWill ?? 0) - 14);
            ctx.target.adoption.land = Math.max(0, (ctx.target.adoption.land ?? 0) - 0.05);
          }
          for (const c of Object.values(s.countries)) {
            c.politicalWill = Math.max(8, (c.politicalWill ?? 0) - 3);
          }
          s.world.societalStress = Math.max(0, (s.world.societalStress ?? 0) + 8);
          s.meta.droughtFamineUntilTick = 0;
        },
        summaryOverride: '-14 Will (target) · -0.05 Land · -3 Will (all) · +8 Stress',
        echo: { delayTicks: 12, tone: 'bad',
          headline: (s, ctx) => `Three years on, ${ctx?.target?.name ?? 'the country'} is under a new government whose climate priorities are, to put it generously, different.` } },
    ] },

  { id: 'blizzard_disaster', weight: 2, tone: 'bad', interactive: true, disaster: true,
    category: 'unintended', title: 'Polar Vortex Collapse', heroImage: '/disasters/blizzard.webp',
    guard: (s) => s.world.tempAnomalyC >= 1.7,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => Math.abs(c.lat ?? 0) >= 35)),
    headline: (s, ctx) => `The polar vortex buckles. ${ctx.target?.name} sits under Arctic air for two weeks. Grids fail. Pipes burst. A warming climate, frozen.`,
    choices: [
      { key: 'grid_harden', label: 'Harden the grid ($$$)', headline: 'Weatherized substations, storage, distributed backup. The next vortex hits and the lights stay on.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -10 },
          { op: 'addTarget', field: 'adoption.energy', value: 0.05 },
          { op: 'addTarget', field: 'politicalWill', value: 6 },
        ],
        echo: { delayTicks: 16, tone: 'good',
          headline: (s, ctx) => `Four years on, ${ctx?.target?.name ?? 'the country'}'s grid is the most reliable in the hemisphere. The blackout is taught in engineering schools.` } },
      { key: 'subsidize_gas', label: 'Subsidize natural gas heating', headline: 'Pipeline expansion fast-tracked. Pilot lights stay lit. So does the fossil industry.', tone: 'bad',
        effects: [
          { op: 'addTarget', field: 'adoption.energy', value: -0.07 },
          { op: 'addTarget', field: 'politicalWill', value: -4 },
          { op: 'addWorld', field: 'co2ppm', value: 0.6 },
          { op: 'addWorld', field: 'societalStress', value: 2 },
        ],
        echo: { delayTicks: 14, tone: 'bad',
          headline: (s, ctx) => `Three years on, the gas buildout in ${ctx?.target?.name ?? 'the country'} has added a decade to its fossil dependency. The next vortex comes anyway.` } },
    ] },

  { id: 'petro_discovery', weight: 2, tone: 'bad', title: 'New Oilfield Discovery',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'petrostate')),
    headline: (s, ctx) => `${ctx.target?.name} announces massive new oilfield. Stocks up, will down.`,
    effects: [
      { op: 'addTarget', field: 'adoption.energy', value: -0.1 },
      { op: 'addTarget', field: 'politicalWill', value: -10 },
    ] },

  { id: 'renewable_record', weight: 3, tone: 'good', title: 'Renewable Record',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.adoption.energy > 0.3)),
    headline: (s, ctx) => `${ctx.target?.name} runs on 100% renewables for a week. Engineers celebrate quietly.`,
    effects: [
      { op: 'addTarget', field: 'adoption.energy', value: 0.05 },
      { op: 'addWorld', field: 'climatePoints', value: 5 },
    ] },

  { id: 'climate_lawsuit', weight: 2, tone: 'good', title: 'Climate Lawsuit Won',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `${ctx.target?.name}'s supreme court rules climate inaction unconstitutional.`,
    effects: [
      { op: 'addTarget', field: 'adoption.policy', value: 0.05 },
      { op: 'addTarget', field: 'politicalWill', value: 8 },
    ] },

  { id: 'pipeline_cancelled', weight: 2, tone: 'good', title: 'Pipeline Cancelled',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'petrostate')),
    headline: (s, ctx) => `Planned pipeline through ${ctx.target?.name} cancelled after mass protests.`,
    effects: [
      { op: 'addTarget', field: 'adoption.policy', value: 0.04 },
      { op: 'addWorld', field: 'climatePoints', value: 5 },
    ] },

  { id: 'minister_resigns', weight: 2, tone: 'bad', title: 'Climate Minister Resigns',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `${ctx.target?.name}'s climate minister quits in protest. Gridlock sets in.`,
    effects: [{ op: 'addTarget', field: 'politicalWill', value: -10 }] },

  { id: 'minister_rockstar', weight: 2, tone: 'good', title: 'Minister Delivers',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `${ctx.target?.name}'s climate minister hailed as visionary after surprise reforms.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: 12 },
      { op: 'addWorld', field: 'climatePoints', value: 5 },
    ] },

  { id: 'viral_activist', weight: 3, tone: 'good', title: 'Viral Activist',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `A teen from ${ctx.target?.name} goes viral. Climate is cool again.`,
    effects: [
      { op: 'addTargetRandomBranch', value: 0.03 },
      { op: 'addTarget', field: 'politicalWill', value: 5 },
    ] },

  { id: 'indigenous_pact', weight: 2, tone: 'good', title: 'Indigenous Stewardship Pact',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural' || c.infra === 'mixed')),
    headline: (s, ctx) => `Indigenous land stewardship pact signed in ${ctx.target?.name}. Forest guardians empowered.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: 0.05 },
      { op: 'addWorld', field: 'climatePoints', value: 5 },
    ] },

  // ═══════════════ INTERACTIVE (player chooses) ═══════════════
  { id: 'geo_offer', weight: 2, tone: 'neutral', interactive: true, category: 'unintended', title: 'Geoengineering Offer',
    guard: (s) => s.world.tempAnomalyC > 1.8,
    headline: 'A billionaire offers to fund stratospheric aerosol injection. Temporary cooling, unknown end game.',
    advisorStances: [
      { advisor: 'industrialist', supports: 'accept', stance: 'Buying a decade of cooler summers is cheap at any price. Take it.' },
      { advisor: 'scientist',     supports: 'decline', stance: 'This is a thermostat we do not know how to turn off. Do not pull the lever.' },
    ],
    choices: [
      { key: 'accept', label: 'Accept the funding', headline: 'Aerosols deployed. Temperature pauses. Termination risk lingers.', tone: 'bad',
        // Temperature cut is special — non-additive floor. Keep as apply().
        apply: (s) => {
          s.world.tempAnomalyC = Math.max(1.5, s.world.tempAnomalyC - 0.3);
          s.world.societalStress += 10;
        },
        // apply() is imperative; hand-write the player-facing receipt.
        summaryOverride: '−0.30°C immediate · +10 Stress',
        echo: { delayTicks: 18, tone: 'bad',
          headline: (s) => `Four years on, the aerosol program holds — temperature pinned near +${s.world.tempAnomalyC.toFixed(1)}°C. Nobody is sure how to end it.` } },
      { key: 'decline', label: 'Decline politely', headline: 'Offer declined. Billionaire tweets through it.', tone: 'good',
        effects: [{ op: 'addWorld', field: 'climatePoints', value: 4 }],
        echo: { delayTicks: 14, tone: 'good',
          headline: () => 'Three years on: the geoengineering refusal is cited in every major climate syllabus as a moment of nerve.' } },
    ] },

  { id: 'petro_deal', weight: 2, tone: 'neutral', interactive: true, title: 'Petrostate Deal',
    guard: (s) => s.world.researched.has('carbon_price'),
    headline: 'A petrostate will join your carbon market — if aviation is exempt.',
    advisorStances: [
      { advisor: 'diplomat', supports: 'accept', stance: 'An imperfect deal that brings them inside is worth more than a perfect one they refuse.' },
      { advisor: 'activist', supports: 'refuse', stance: 'Carve-outs always become the policy. Every exemption is a decade we lose.' },
    ],
    choices: [
      { key: 'accept', label: 'Grant the exemption', headline: 'Deal struck. Aviation exemption will need work later.', tone: 'neutral',
        effects: [
          { op: 'addCountries', where: { infra: 'petrostate' }, field: 'adoption.policy', value: 0.1 },
          { op: 'addWorld', field: 'co2ppm', value: -0.4 },
        ],
        echo: { delayTicks: 16, tone: 'neutral',
          headline: () => 'Four years on: petrostates are trading inside the carbon market; the aviation carve-out is still a fight.' } },
      { key: 'refuse', label: 'No exemptions', headline: 'Ministry refuses. Talks stall. Activists cheer.', tone: 'good',
        effects: [{ op: 'addAllCountries', field: 'politicalWill', value: 2 }],
        echo: { delayTicks: 16, tone: 'neutral',
          headline: () => 'Four years on: the carbon market sits without its petrostate signatories. Harder talks ahead — but no exemptions written in.' } },
    ] },

  { id: 'nuclear_dilemma', weight: 2, tone: 'neutral', interactive: true, category: 'unintended', title: 'Nuclear Dilemma',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra !== 'agricultural')),
    headline: (s, ctx) => `${ctx.target?.name} proposes a massive nuclear buildout. Clean baseload — or another kind of risk?`,
    advisorStances: [
      { advisor: 'industrialist', supports: 'build', stance: 'Clean baseload is tonnage we can bank. The protests will pass; the gigawatts will not.' },
      { advisor: 'activist',      supports: 'block', stance: 'Renewables are cheaper, faster, and do not come with a 24,000-year receipt.' },
    ],
    choices: [
      { key: 'build', label: 'Greenlight the reactors', headline: 'Reactors approved. Clean energy booms; local protests swell.', tone: 'neutral',
        effects: [
          { op: 'addTarget', field: 'adoption.energy', value: 0.1 },
          { op: 'addTarget', field: 'politicalWill', value: -12 },
          { op: 'addWorld', field: 'co2ppm', value: -0.3 },
        ],
        echo: { delayTicks: 20, tone: 'neutral',
          headline: (s, ctx) => `Five years on: ${ctx?.target?.name ?? 'the host country'}'s reactors are online. Clean baseload, quiet protests, and a waste problem kicked 50 years downfield.` } },
      { key: 'block', label: 'Block them, double down on renewables', headline: 'Plans shelved. Renewables must carry the load.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 5 },
          { op: 'addTarget', field: 'politicalWill', value: 4 },
          { op: 'addAllCountries', field: 'adoption.energy', value: 0.02 },
        ],
        echo: { delayTicks: 20, tone: 'good',
          headline: (s, ctx) => `Five years on: ${ctx?.target?.name ?? 'the country'} is running mostly on wind and solar. Engineers quietly admit they were surprised it worked.` } },
    ] },

  { id: 'carbon_tariff', weight: 2, tone: 'neutral', interactive: true, title: 'Carbon Tariff Proposal',
    guard: (s) => s.world.researched.has('carbon_price'),
    headline: 'A trade bloc proposes carbon border tariffs. Partners balk. Your call.',
    advisorStances: [
      { advisor: 'diplomat',     supports: 'impose', stance: 'Border tariffs are leverage. Use them while we still hold the lever.' },
      { advisor: 'industrialist', supports: 'hold',  stance: 'Tariffs choke the supply chains we still need to retool. Not this year.' },
    ],
    choices: [
      { key: 'impose', label: 'Impose the tariff', headline: 'Tariff imposed. Clean imports dominate; trade tensions rise.', tone: 'neutral',
        effects: [
          { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.policy', value: 0.05 },
          { op: 'addCountries', where: { infra: 'industrial' }, field: 'politicalWill', value: -4 },
          { op: 'addAllCountries', field: 'adoption.industry', value: 0.02 },
          { op: 'addWorld', field: 'co2ppm', value: -0.5 },
        ],
        echo: { delayTicks: 16, tone: 'good',
          headline: () => 'Four years on: the carbon tariff has survived three WTO challenges. Dirty steel costs more than clean steel on the world market.' } },
      { key: 'hold', label: 'Hold off on the tariff', headline: 'Tariff shelved. Trade stays smooth. Coal stays cheap.', tone: 'bad',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 5 },
          { op: 'addWorld', field: 'co2ppm', value: 0.2 },
        ],
        echo: { delayTicks: 16, tone: 'bad',
          headline: () => 'Four years on: supply chains are calm, and dirty steel is still the cheapest option. The window to price carbon at the border has closed.' } },
    ] },

  { id: 'billionaire_pledge', weight: 2, tone: 'neutral', interactive: true, title: "Billionaire's Pledge",
    headline: 'A tech tycoon offers $50B for climate — with strings attached.',
    advisorStances: [
      { advisor: 'industrialist', supports: 'take',   stance: 'Fifty billion in the tonnage column. We would be fools to leave this on the table.' },
      { advisor: 'activist',      supports: 'reject', stance: 'One man rewriting policy with a checkbook is the problem, not the cure.' },
    ],
    choices: [
      { key: 'take', label: 'Take the money', headline: 'Cash flows. So does the cynicism about billionaire saviors.', tone: 'neutral',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 25 },
          { op: 'addAllCountries', field: 'politicalWill', value: -4 },
          { op: 'addAllCountries', field: 'adoption.energy', value: 0.03 },
        ],
        echo: { delayTicks: 14, tone: 'neutral',
          headline: () => "Three years on: the tycoon's $50B is spent, and his name is on half the labs. 'Cathedral or monument?' becomes the op-ed of the year." } },
      { key: 'reject', label: 'Reject and crowdfund instead', headline: 'Grassroots funding wave inspires millions.', tone: 'good',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 8 },
          { op: 'addWorld', field: 'climatePoints', value: 4 },
          { op: 'addAllCountries', field: 'adoption.policy', value: 0.02 },
        ],
        echo: { delayTicks: 14, tone: 'good',
          headline: () => 'Three years on: the crowdfunding network that replaced the pledge now outraises major foundations. The climate movement has a wallet.' } },
    ] },

  { id: 'refugee_crisis', weight: 2, tone: 'neutral', interactive: true, category: 'unintended', title: 'Climate Refugee Crisis',
    guard: (s) => s.world.tempAnomalyC > 1.6,
    headline: 'Millions displaced by climate disasters. Borders become the question.',
    advisorStances: [
      { advisor: 'activist', supports: 'open',  stance: 'These are climate migrants that we made. Shut the door and we forfeit the moral case.' },
      { advisor: 'diplomat', supports: 'close', stance: 'Open borders under this pressure will fracture the coalitions we need. Close them — for now.' },
    ],
    choices: [
      { key: 'open', label: 'Open borders, fund resettlement', headline: 'Humanitarian response rallies global political will.', tone: 'good',
        effects: [
          { op: 'addCountries', where: { infra: ['service', 'industrial'] }, field: 'politicalWill', value: 8 },
          { op: 'addWorld', field: 'climatePoints', value: -5 },
          { op: 'addAllCountries', field: 'adoption.policy', value: 0.03 },
        ],
        echo: { delayTicks: 16, tone: 'good',
          headline: () => 'Four years on: the resettlement programs are quietly the most popular climate policy ever passed. Climate justice stopped being an abstraction.' } },
      { key: 'close', label: 'Close borders', headline: 'Walls go up. Nativism rises. Climate slips off the agenda.', tone: 'bad',
        effects: [{ op: 'addAllCountries', field: 'politicalWill', value: -5 }],
        echo: { delayTicks: 16, tone: 'bad',
          headline: () => 'Four years on: the border closures outlived their crisis. Climate migration became a permanent wedge issue; the movement lost a generation of allies.' } },
    ] },

  { id: 'patent_leak', weight: 2, tone: 'neutral', interactive: true, title: 'Patent Leak',
    guard: (s) => s.world.researched.size > 5,
    headline: 'Green tech patents leak to the developing world. Share them freely — or lock them down?',
    advisorStances: [
      { advisor: 'scientist',     supports: 'share', stance: 'Science does not work behind a paywall. Speed of adoption is the whole point.' },
      { advisor: 'industrialist', supports: 'lock',  stance: 'Without enforceable IP, no one bankrolls the next breakthrough. Lock it down.' },
    ],
    choices: [
      { key: 'share', label: 'Open-source it', headline: 'Patents freed. Adoption accelerates across three emerging markets.', tone: 'good',
        effects: [
          { op: 'addRandomBranches', count: 3, value: 0.04, branches: ['energy', 'transport', 'industry'] },
          { op: 'addWorld', field: 'climatePoints', value: -5 },
          { op: 'addWorld', field: 'co2ppm', value: -0.3 },
        ],
        echo: { delayTicks: 16, tone: 'good',
          headline: () => 'Four years on: the open patents became the basis of three national green-industrial policies. Nobody wants the old system back.' } },
      { key: 'lock', label: 'Sue and lock down', headline: 'Lawyers win. Adoption stalls. Licensing fees accrue.', tone: 'bad',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 6 },
          { op: 'addAllCountries', field: 'adoption.industry', value: -0.02 },
        ],
        echo: { delayTicks: 16, tone: 'bad',
          headline: () => 'Four years on: the patent fortress holds — and licensing fees are still a line item in every climate bill. Adoption is slower than it should be.' } },
    ] },

  // ═══════════════ POOL v2 EXPANSION ═══════════════
  // Mix of realistic and tongue-in-cheek. The director samples weighted; not
  // every event is intended to appear in every run. Keep weights ≤3 so the
  // deeper pool stays visible.

  // ─── Global realistic (bad) ───────────────────────────────────────────
  { id: 'glacier_collapse', weight: 1, tone: 'bad', title: 'Glacier Collapse',
    guard: (s) => s.world.tempAnomalyC > 1.8,
    headline: 'A major Himalayan glacier lets go. Downstream water security is now a headline.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 5 },
      { op: 'addWorld', field: 'tempAnomalyC', value: 0.04, max: 3.0 },
    ] },

  { id: 'antarctic_shelf', weight: 1, tone: 'bad', title: 'Antarctic Shelf Calving',
    guard: (s) => s.world.tempAnomalyC > 2.0,
    headline: 'A Florida-sized ice shelf breaks free. Sea-level projections are revised upward — again.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 7 },
      { op: 'addAllCountries', field: 'politicalWill', value: 3 },
    ] },

  { id: 'jet_stream_wobble', weight: 2, tone: 'bad', title: 'Jet Stream Wobble',
    guard: (s) => s.world.tempAnomalyC > 1.5,
    headline: 'A stalled jet stream bakes Europe and drowns South Asia in the same week.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 5 },
      { op: 'addAllCountries', field: 'politicalWill', value: 3 },
    ] },

  { id: 'mosquito_pandemic', weight: 2, tone: 'bad', title: 'Tropical Disease Surge',
    guard: (s) => s.world.tempAnomalyC > 1.6,
    headline: 'Warming-fueled vectors spread dengue into a dozen new countries.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 4 },
      { op: 'addAllCountries', field: 'politicalWill', value: 2 },
    ] },

  { id: 'insurance_retreat', weight: 2, tone: 'bad', title: 'Insurers Quit the Coast',
    headline: 'The largest reinsurer pulls out of coastal real estate. Bond markets notice.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 3 },
      { op: 'addCountries', where: { infra: ['service', 'industrial'] }, field: 'politicalWill', value: 4 },
    ] },

  { id: 'cop_walkout', weight: 2, tone: 'bad', title: 'COP Walkout',
    headline: 'Small island states walk out of COP. The year\'s summit ends in silence.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -6 },
      { op: 'addAllCountries', field: 'politicalWill', value: -3 },
    ] },

  { id: 'methane_leak', weight: 2, tone: 'bad', title: 'Methane Super-Leak Exposed',
    headline: 'Satellite detects a gas field venting for a year undetected. The numbers are worse than reported.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.3 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -4 },
    ] },

  { id: 'climate_gag_order', weight: 2, tone: 'bad', title: 'Climate Data Gag Order',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.politicalWill < 50)),
    headline: (s, ctx) => `${ctx.target?.name} bars government scientists from publishing climate data. Outcry follows.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: -8 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'crop_failure', weight: 2, tone: 'bad', title: 'Breadbasket Harvest Fails',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural')),
    headline: (s, ctx) => `${ctx.target?.name}'s harvest comes in 30% short. Grain markets convulse.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: -0.04 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
    ] },

  { id: 'fossil_bailout', weight: 2, tone: 'bad', title: 'Stranded-Asset Bailout',
    headline: 'Governments quietly underwrite $200B of stranded fossil infrastructure. The transition pays for itself — backwards.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -10 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -2 },
    ] },

  // ─── Global tongue-in-cheek (bad) ─────────────────────────────────────
  { id: 'suv_arms_race', weight: 2, tone: 'bad', title: 'SUV Arms Race',
    headline: 'Automakers unveil a seven-ton personal truck. "For your safety," the ad claims, "from people driving ours."',
    effects: [
      { op: 'addAllCountries', field: 'adoption.transport', value: -0.02 },
    ] },

  { id: 'clean_coal_rebrand', weight: 2, tone: 'bad', title: '"Clean Coal" Gets a Rebrand',
    headline: 'Lobbyists rename it "legacy carbon." Same smokestacks, new logo.',
    effects: [
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'adoption.policy', value: -0.04 },
    ] },

  { id: 'beef_lobby', weight: 2, tone: 'bad', title: 'Beef Lobby Strikes Back',
    headline: 'A $500M ad campaign convinces millions that plants, too, emit.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: -0.02 },
      { op: 'addAllCountries', field: 'politicalWill', value: -2 },
    ] },

  { id: 'flat_earth_summit', weight: 1, tone: 'bad', title: 'Flat Earth Summit (Sponsored)',
    headline: 'An oil major sponsors a flat-earth summit. Somehow the climate deniers show up too.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 2 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -3 },
    ] },

  { id: 'crypto_mining_boom', weight: 2, tone: 'bad', title: 'Crypto Mining Boom',
    headline: 'A new memecoin consumes the electricity of Belgium. Belgium declines comment.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.2 },
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.02 },
    ] },

  { id: 'billionaire_rocket', weight: 1, tone: 'bad', title: 'Billionaire Rocket Theater',
    headline: 'A tech mogul launches a private rocket to "inspire" climate action. The carbon receipts land in 24 hours.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 2 },
      { op: 'addAllCountries', field: 'politicalWill', value: -1 },
    ] },

  // ─── Global realistic (good) ──────────────────────────────────────────
  { id: 'heat_pump_boom', weight: 3, tone: 'good', title: 'Heat Pump Boom',
    headline: 'Installs outpace gas furnaces for the first time. Chinese factories can\'t keep up.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.03 },
    ] },

  { id: 'ev_recycling_solved', weight: 2, tone: 'good', title: 'Battery Recycling Cracked',
    headline: 'A closed-loop EV battery process hits 95% recovery. The "mineral problem" gets 30% smaller.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 8 },
      { op: 'addAllCountries', field: 'adoption.transport', value: 0.03 },
    ] },

  { id: 'rooftop_solar_mandate', weight: 2, tone: 'good', title: 'Rooftop Solar Mandates Spread',
    headline: 'Ten states now require new homes to ship solar-ready. Distributed energy wins.',
    effects: [
      { op: 'addCountries', where: { infra: ['service', 'industrial'] }, field: 'adoption.energy', value: 0.04 },
    ] },

  { id: 'divestment_wave', weight: 2, tone: 'good', title: 'Divestment Wave',
    headline: 'Six of the ten largest pension funds pull out of fossil equities this quarter.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 7 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -3 },
    ] },

  { id: 'kelp_farms_scale', weight: 2, tone: 'good', title: 'Kelp Farms Scale',
    headline: 'Industrial kelp cultivation takes off. Ocean carbon sinks, feed, and fertilizer — all at once.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
      { op: 'addWorld', field: 'climatePoints', value: 4 },
    ] },

  { id: 'wind_corridor_pact', weight: 2, tone: 'good', title: 'Wind Corridor Pact',
    headline: 'A continental HVDC corridor opens. Cheap wind flows a thousand miles.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.03 },
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ] },

  { id: 'vertical_farm_ipo', weight: 2, tone: 'good', title: 'Vertical Farm Unicorn IPOs',
    headline: 'A vertical farming giant goes public. Urban lettuce is suddenly a real industry.',
    effects: [
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.land', value: 0.03 },
    ] },

  { id: 'curriculum_shift', weight: 2, tone: 'good', title: 'Curriculum Shift',
    headline: 'Most OECD school systems now teach climate in every subject. A generation grows up fluent.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: 4 },
    ] },

  { id: 'mayor_coalition', weight: 2, tone: 'good', title: 'Mayor Coalition Agrees',
    headline: 'The 100 largest cities sign a binding decarbonization compact — ignoring their national governments.',
    effects: [
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.policy', value: 0.05 },
      { op: 'addWorld', field: 'climatePoints', value: 4 },
    ] },

  { id: 'dac_grid_tied', weight: 2, tone: 'good', title: 'DAC Goes Grid-Tied',
    guard: (s) => s.world.researched.has('dac') || s.world.researched.size > 6,
    headline: 'Direct air capture plants synchronize with wind farms. Negative emissions get dispatchable.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.capture', value: 0.04 },
      { op: 'addWorld', field: 'climatePoints', value: 6 },
    ] },

  // ─── Global tongue-in-cheek (good) ────────────────────────────────────
  { id: 'bitcoin_halving', weight: 2, tone: 'good', title: 'Bitcoin Halving Crash',
    headline: 'A crash wipes out half the crypto mining fleet overnight. Grids exhale.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 5 },
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.01 },
    ] },

  { id: 'pope_endorses', weight: 1, tone: 'good', title: 'The Climate Pope',
    headline: 'A papal encyclical names carbon extraction "a sin against creation." A billion people read the fine print.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: 4 },
    ] },

  { id: 'lab_meat_cheaper', weight: 2, tone: 'good', title: 'Lab Meat Undercuts Beef',
    headline: 'Cultivated chicken hits grocery parity. The cows watch, unimpressed.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ] },

  { id: 'influencer_vegan', weight: 2, tone: 'good', title: 'Influencer Vegan Wave',
    headline: 'Three top-ten influencers go plant-based in one month. Beef prices wobble for reasons no economist predicted.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
    ] },

  { id: 'streaming_hd_cap', weight: 1, tone: 'good', title: 'Streaming HD Cap',
    headline: 'Regulators cap default streaming bitrate. Nobody notices. Data centers shed 4% of load.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ] },

  { id: 'tech_ceo_trees', weight: 1, tone: 'good', title: 'Tech CEO Discovers Trees',
    headline: 'Man in black turtleneck explains photosynthesis on stage. Stock up 4%.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
      { op: 'addWorld', field: 'climatePoints', value: 2 },
    ] },

  { id: 'insurance_green_discount', weight: 2, tone: 'good', title: 'Insurance Rewards Green',
    headline: 'Major insurer offers 30% discounts for low-carbon households. Underwriting goes political.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.02 },
      { op: 'addAllCountries', field: 'politicalWill', value: 2 },
    ] },

  // ─── Country-targeted realistic ───────────────────────────────────────
  { id: 'climate_constitution', weight: 2, tone: 'good', title: 'Climate Clause in the Constitution',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `${ctx.target?.name} amends its constitution to protect a "stable climate." Lawsuits come next.`,
    effects: [
      { op: 'addTarget', field: 'adoption.policy', value: 0.08 },
      { op: 'addTarget', field: 'politicalWill', value: 6 },
    ] },

  { id: 'capital_inland', weight: 2, tone: 'neutral', title: 'Capital Moves Inland',
    guard: (s) => s.world.tempAnomalyC > 1.8,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'service' || c.infra === 'agricultural')),
    headline: (s, ctx) => `${ctx.target?.name} announces it will relocate its capital inland. The logistics alone take a decade.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: 6 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'climate_haven', weight: 2, tone: 'good', title: 'Climate Haven Declared',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.climateVulnerability < 1.0)),
    headline: (s, ctx) => `${ctx.target?.name} markets itself as a climate haven. Migration applications spike.`,
    effects: [
      { op: 'addTarget', field: 'adoption.policy', value: 0.03 },
      { op: 'addTarget', field: 'politicalWill', value: 4 },
    ] },

  { id: 'renewable_50pct', weight: 2, tone: 'good', title: 'Quiet 50% Milestone',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.adoption.energy >= 0.4 && c.adoption.energy < 0.6)),
    headline: (s, ctx) => `${ctx.target?.name} quietly passes 50% renewable generation. No press conference — just a plot on a dashboard.`,
    effects: [
      { op: 'addTarget', field: 'adoption.energy', value: 0.04 },
      { op: 'addWorld', field: 'climatePoints', value: 4 },
    ] },

  { id: 'oil_exec_convicted', weight: 1, tone: 'good', title: 'Oil Executive Convicted',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra !== 'petrostate')),
    headline: (s, ctx) => `${ctx.target?.name}'s supreme court sentences an oil CEO for climate fraud. Boards rewrite their bylaws overnight.`,
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 8 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -5 },
    ] },

  { id: 'rewilding_wolves', weight: 2, tone: 'good', title: 'Rewilding Wins',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural' || c.infra === 'mixed')),
    headline: (s, ctx) => `${ctx.target?.name} reintroduces apex predators and returns a million hectares to wilderness.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: 0.05 },
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ] },

  { id: 'nimby_wind_block', weight: 2, tone: 'bad', title: 'Wind Farm Vetoed',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.adoption.energy > 0.2)),
    headline: (s, ctx) => `${ctx.target?.name}'s flagship offshore wind project is killed by coastal homeowners citing "ocean aesthetics."`,
    effects: [
      { op: 'addTarget', field: 'adoption.energy', value: -0.04 },
      { op: 'addTarget', field: 'politicalWill', value: -3 },
    ] },

  { id: 'teen_hackers', weight: 1, tone: 'neutral', title: 'Teen Hackers Leak Big Oil',
    headline: 'A collective of 16-year-olds publishes internal climate risk assessments from three majors. The documents are damning.',
    effects: [
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -6 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'mushroom_mayor', weight: 1, tone: 'neutral', title: 'Fungi Party Wins',
    target: (s, rng) => rng.pick(Object.values(s.countries)),
    headline: (s, ctx) => `${ctx.target?.name}'s new ruling coalition includes the Mycological Party. Their platform: "Everything is connected. Plant more mushrooms."`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: 0.05 },
      { op: 'addTarget', field: 'politicalWill', value: 3 },
    ] },

  // ─── INTERACTIVE (pool v2) ────────────────────────────────────────────
  { id: 'cow_tax', weight: 2, tone: 'neutral', interactive: true, title: 'Ruminant Tax',
    headline: 'A methane tax on beef and dairy passes committee. Farmers mobilize. Hold the line — or trade it away?',
    advisorStances: [
      { advisor: 'scientist', supports: 'impose', stance: 'The methane math is unambiguous. A carbon price on burps is the single biggest lever left untouched.' },
      { advisor: 'industrialist', supports: 'trade', stance: 'You do not win farm country by taxing grandma. Keep the goal, lose the poster.' },
    ],
    choices: [
      { key: 'impose', label: 'Hold the line, impose the tax', headline: 'Tax passes. Beef prices rise, farmers march, methane falls.', tone: 'good',
        effects: [
          { op: 'addAllCountries', field: 'adoption.land', value: 0.04 },
          { op: 'addCountries', where: { infra: 'agricultural' }, field: 'politicalWill', value: -6 },
          { op: 'addWorld', field: 'co2ppm', value: -0.6 },
        ],
        echo: { delayTicks: 14, tone: 'good',
          headline: () => 'Three years on: methane emissions from agriculture are down 12%. Beef is a luxury item. Lab chicken dominates the freezer aisle.' } },
      { key: 'trade', label: 'Trade it for a subsidy package', headline: 'Tax scrapped; green-farming subsidies replace it. Slower, softer.', tone: 'neutral',
        effects: [
          { op: 'addCountries', where: { infra: 'agricultural' }, field: 'adoption.land', value: 0.03 },
          { op: 'addAllCountries', field: 'politicalWill', value: 2 },
        ],
        echo: { delayTicks: 14, tone: 'neutral',
          headline: () => 'Three years on: the subsidy package helped at the margins. Methane is down a few percent. Nobody has burned an effigy, which is its own kind of win.' } },
    ] },

  { id: 'private_jet_ban', weight: 2, tone: 'neutral', interactive: true, title: 'Private Jet Ban',
    headline: 'A coalition proposes banning private aviation from your airspace. Billionaires draft lawsuits. Signal or substance?',
    advisorStances: [
      { advisor: 'activist',   supports: 'ban',  stance: 'Five percent of people cause half the aviation emissions. Ground them and let the rest of us breathe.' },
      { advisor: 'diplomat',   supports: 'pass', stance: 'Symbolic bans make enemies with the people who fund every climate foundation on the planet. Not yet.' },
    ],
    choices: [
      { key: 'ban', label: 'Ban private jets', headline: 'Jets grounded. Commercial classes fuller than ever. Hypocrisy index falls 40%.', tone: 'good',
        effects: [
          { op: 'addCountries', where: { infra: ['service', 'industrial'] }, field: 'adoption.transport', value: 0.03 },
          { op: 'addAllCountries', field: 'politicalWill', value: 5 },
          { op: 'addWorld', field: 'co2ppm', value: -0.2 },
        ],
        echo: { delayTicks: 14, tone: 'good',
          headline: () => "Three years on: the private-jet ban is the single most popular climate policy ever measured. 'Hypocrisy tax' enters the dictionary." } },
      { key: 'pass', label: 'Pass — keep the coalition', headline: 'Ban shelved. The funding keeps flowing, and so do the jets.', tone: 'bad',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 4 },
          { op: 'addAllCountries', field: 'politicalWill', value: -3 },
        ],
        echo: { delayTicks: 14, tone: 'bad',
          headline: () => 'Three years on: the private-jet caucus is louder than ever. Every climate summit has a parking lot problem.' } },
    ] },

  { id: 'sunshade_research', weight: 1, tone: 'neutral', interactive: true, title: 'Space Sunshade Proposal',
    guard: (s) => s.world.tempAnomalyC > 1.7 && s.world.researched.size > 4,
    headline: 'A consortium proposes a trillion-dollar orbital sunshade research program. Science fiction — or insurance?',
    advisorStances: [
      { advisor: 'scientist',   supports: 'fund',   stance: 'Orbital solutions are reversible. We study them now, or we freelance them in a crisis.' },
      { advisor: 'activist',    supports: 'refuse', stance: 'A shade in space is the ultimate excuse not to decarbonize here on Earth.' },
    ],
    choices: [
      { key: 'fund', label: 'Fund the research', headline: 'Program approved. Half the astrophysics community quietly enlists.', tone: 'neutral',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -8 },
          { op: 'addAllCountries', field: 'adoption.capture', value: 0.02 },
        ],
        echo: { delayTicks: 20, tone: 'neutral',
          headline: () => "Five years on: the sunshade research pipeline has produced zero shades and a dozen unrelated breakthroughs. Funding it was never really about the shades." } },
      { key: 'refuse', label: 'Refuse — stay grounded', headline: 'Proposal rejected. "Fix the fossil problem first," the statement reads.', tone: 'good',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 4 },
          { op: 'addWorld', field: 'climatePoints', value: 3 },
        ],
        echo: { delayTicks: 20, tone: 'good',
          headline: () => 'Five years on: the sunshade refusal is cited as the moment governments stopped reaching for magic wands. Attention returned to the ground.' } },
    ] },

  { id: 'water_auction', weight: 2, tone: 'neutral', interactive: true, title: 'Water Rights Auction',
    guard: (s) => s.world.tempAnomalyC > 1.5,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural' || c.infra === 'mixed')),
    headline: (s, ctx) => `${ctx.target?.name} proposes auctioning scarce river-water rights to the highest bidder. Farmers and cities lobby opposite directions.`,
    advisorStances: [
      { advisor: 'industrialist', supports: 'auction', stance: 'Price discovery moves water where it\'s most valuable. That\'s how allocation is supposed to work.' },
      { advisor: 'activist',      supports: 'public',  stance: 'Water is a right, not a commodity. The minute you auction it, the poor are priced out.' },
    ],
    choices: [
      { key: 'auction', label: 'Auction the rights', headline: 'Water trades at market prices. Industry wins. Smallholders sue.', tone: 'bad',
        effects: [
          { op: 'addTarget', field: 'adoption.land', value: -0.03 },
          { op: 'addTarget', field: 'politicalWill', value: -6 },
          { op: 'addWorld', field: 'climatePoints', value: 5 },
        ],
        echo: { delayTicks: 16, tone: 'bad',
          headline: (s, ctx) => `Four years on: ${ctx?.target?.name ?? 'the country'}'s water markets are efficient and unequal. The legal fights outlived the drought that started them.` } },
      { key: 'public', label: 'Keep it public', headline: 'Rights stay allocated by committee. Slow, political, and everyone still has water.', tone: 'good',
        effects: [
          { op: 'addTarget', field: 'adoption.land', value: 0.03 },
          { op: 'addTarget', field: 'politicalWill', value: 6 },
          { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
        ],
        echo: { delayTicks: 16, tone: 'good',
          headline: (s, ctx) => `Four years on: ${ctx?.target?.name ?? 'the country'}'s public water model is being copied across three continents. Commoditizing the river is no longer on the table.` } },
    ] },

  // ═══════════════ POOL v3 — EXPANSION ═══════════════
  // Additions from the design review: positive systemic wins, absurd-but-real
  // consequences, the hermit saga (wired in Pass 2), grade-school inventor
  // cluster, and the NYC flood disaster beat that only fires when the world
  // is already cooking.

  // ─── Positive passive (realistic) ────────────────────────────────────
  { id: 'food_labeling_standard', weight: 2, tone: 'good', title: 'Global Food-Labeling Standard',
    headline: 'UN passes a single expiration-date standard. "Best by" gets retired. Food waste drops overnight.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
      { op: 'addWorld', field: 'societalStress', value: -2 },
    ] },

  { id: 'co2_cooling_tech', weight: 2, tone: 'good', title: 'CO₂-Based Cooling Scales',
    guard: (s) => s.world.researched.size > 5,
    headline: 'A startup shows CO₂ refrigerants beat HFCs on price and performance. Supermarkets switch first.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.industry', value: 0.04 },
      { op: 'addWorld', field: 'climatePoints', value: 5 },
    ] },

  { id: 'pneumatic_valves_mandate', weight: 2, tone: 'good', title: 'Pneumatic Valves Mandated',
    headline: 'Oil and gas operators must replace leaking pneumatic valves. Methane emissions fall sharply.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: -0.5 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -3 },
    ] },

  { id: 'whale_stewardship', weight: 2, tone: 'good', title: 'Whale Poop Is a Carbon Sink',
    headline: 'New studies price a single blue whale at $15M in fixed carbon. Whaling laws rewrite themselves.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 6 },
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
    ] },

  { id: 'epr_mandate', weight: 2, tone: 'good', title: 'Extended Producer Responsibility Expands',
    headline: 'Manufacturers are now on the hook for their products end-to-end. Packaging gets simple again.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.industry', value: 0.04 },
      { op: 'addAllCountries', field: 'adoption.policy', value: 0.02 },
    ] },

  { id: 'organic_waste_capture', weight: 2, tone: 'good', title: 'Organic Waste Captured Globally',
    headline: 'Municipal composting hits near-universal coverage. Landfill methane plunges.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: -0.3 },
      { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
    ] },

  { id: 'fifteen_minute_cities', weight: 2, tone: 'good', title: '15-Minute Cities Catch On',
    headline: 'Dozens of mid-sized cities redesign around walkable districts. Car trips down 30%.',
    effects: [
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.transport', value: 0.05 },
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.land', value: 0.02 },
    ] },

  { id: 'sidewalks_act', weight: 2, tone: 'good', title: 'America Passes the Sidewalks Act',
    target: (s) => s.countries.USA || null,
    headline: (s, ctx) => `${ctx.target?.name ?? 'The United States'} requires sidewalks in new subdivisions. Walkability reaches the suburbs for the first time in 80 years.`,
    effects: [
      { op: 'addTarget', field: 'adoption.transport', value: 0.05 },
      { op: 'addTarget', field: 'politicalWill', value: 4 },
    ] },

  // ─── Positive passive (tongue-in-cheek) ──────────────────────────────
  { id: 'bottle_color_swap', weight: 2, tone: 'good', title: 'Pop Brand Changes Bottle Color',
    headline: 'A global soda brand swaps its green plastic for clear. Recycling rates jump — turns out the tint was the problem.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.industry', value: 0.02 },
    ] },

  { id: 'popstar_reusable_container', weight: 2, tone: 'good', title: 'Popstar Brings Their Own Container',
    headline: "The world's biggest pop star pulls a bento box out of her handbag at a restaurant. One-use packaging sales drop 22% for a month.",
    effects: [
      { op: 'addAllCountries', field: 'adoption.industry', value: 0.02 },
      { op: 'addWorld', field: 'climatePoints', value: 2 },
    ] },

  { id: 'bag_cleanup_app', weight: 2, tone: 'good', title: 'Bag Pollution App Goes Viral',
    headline: 'An app that scores you for bagging roadside plastic sparks a global cleanup movement. Parks look different.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: 3 },
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
    ] },

  { id: 'gen_z_fewer_children', weight: 2, tone: 'neutral', title: 'Gen Z Opts Out of Parenthood',
    headline: 'Global surveys confirm a durable fertility decline: younger cohorts cite climate anxiety as a top reason for delaying or skipping parenthood.',
    guard: (s) => s.world.tempAnomalyC > 1.4,
    // Apply a durable −15% birth-rate modifier worldwide. Durable flag keeps
    // it from decaying — this is a generational shift, not a transient dip.
    apply: (s) => {
      for (const c of Object.values(s.countries)) {
        const delta = -(c.birthRatePerYear ?? 0) * 0.15;
        c.birthRateModifier = (c.birthRateModifier ?? 0) + delta;
        c.birthRateModifierDurable = true;
      }
    } },

  // ─── Negative passive (realistic) ────────────────────────────────────
  { id: 'middle_east_war', weight: 1, tone: 'bad', title: 'War Erupts in the Middle East',
    guard: (s) => s.meta.tick > 12,
    headline: 'Regional war breaks out across oil corridors. Offset markets freeze for the calendar year.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -10 },
      { op: 'addWorld', field: 'societalStress', value: 6 },
      { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: -8 },
      { op: 'addWorld', field: 'co2ppm', value: 0.3 },
    ],
    // Transient death-rate spike in the affected region + neighboring Gulf
    // states. Decays with the usual PopulationSystem curve.
    apply: (s) => {
      for (const id of ['GLF', 'SAU', 'IRN', 'EGY']) {
        const c = s.countries[id];
        if (c) c.deathRateModifier = (c.deathRateModifier ?? 0) + 0.004;
      }
    } },

  { id: 'offset_bifurcation', weight: 2, tone: 'bad', title: 'Offset Registry Splits',
    headline: 'A venture-backed registry launches a "removals" tag. The industry bifurcates; project devs drown in paperwork.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -6 },
      { op: 'addAllCountries', field: 'adoption.capture', value: -0.02 },
    ] },

  { id: 'landfill_bankruptcy', weight: 2, tone: 'bad', title: 'Landfill Operator Collapses',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra !== 'petrostate')),
    headline: (s, ctx) => `${ctx.target?.name}'s largest landfill operator files bankruptcy. Municipalities inherit the leachate — and the bill.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: -5 },
      { op: 'addWorld', field: 'co2ppm', value: 0.2 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'cop_semantic_fight', weight: 2, tone: 'bad', title: 'COP Stalls on a Single Word',
    headline: 'Delegates spend the entire summit fighting over "phase-out" vs "phase-down" — and "shall" vs "should." Nothing passes.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -5 },
      { op: 'addAllCountries', field: 'politicalWill', value: -3 },
    ] },

  { id: 'plastics_distraction', weight: 2, tone: 'bad', title: 'Plastics Narrative Swamps the Agenda',
    headline: 'The plastics crisis eats every op-ed for a year. Carbon goals drift. Both matter — only one has a 2030 deadline.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -4 },
      { op: 'addAllCountries', field: 'politicalWill', value: -2 },
    ] },

  { id: 'datacenter_spike', weight: 2, tone: 'bad', title: 'Data Centers Blow Past Projections',
    guard: (s) => s.meta.year >= 2028,
    headline: 'AI training runs push grid demand past every forecast. New gas plants get fast-tracked to keep up.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.4 },
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.03 },
    ] },

  { id: 'water_systems_collapse', weight: 2, tone: 'bad', title: 'Water Systems Collapse',
    guard: (s) => s.world.tempAnomalyC > 1.8,
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural' || c.infra === 'mixed')),
    headline: (s, ctx) => `${ctx.target?.name}'s water infrastructure buckles under a multi-year drought. Rationing goes permanent.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: -0.06 },
      { op: 'addTarget', field: 'politicalWill', value: -6 },
      { op: 'addWorld', field: 'societalStress', value: 5 },
    ] },

  { id: 'wildfire_smog', weight: 2, tone: 'bad', title: 'Continental Smog Event',
    guard: (s) => s.world.tempAnomalyC > 1.5,
    headline: 'Wildfire smoke parks over three time zones for six weeks. Hospitals fill; outdoor work stops.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 5 },
      { op: 'addAllCountries', field: 'politicalWill', value: 3 },
    ] },

  { id: 'keystone_species_loss', weight: 2, tone: 'bad', title: 'Keystone Species Disappear',
    guard: (s) => s.world.tempAnomalyC > 1.6,
    headline: 'Three keystone species — a pollinator, a predator, a grazer — are declared functionally extinct in the same year.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: -0.04 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
    ] },

  { id: 'marine_dieoff', weight: 2, tone: 'bad', title: 'Marine Life Die-Off',
    guard: (s) => s.world.tempAnomalyC > 1.6,
    headline: 'Ocean temperatures trigger a fish-stock collapse across two major fisheries. Protein markets panic.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -6 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
      { op: 'addAllCountries', field: 'adoption.land', value: -0.02 },
    ] },

  { id: 'nyc_flood', weight: 2, tone: 'bad', title: 'New York Floods',
    guard: (s) => s.world.tempAnomalyC > 2.0 && s.world.societalStress > 30,
    target: (s) => s.countries.USA || null,
    headline: () => 'A Category 4 storm surge inundates Lower Manhattan. Subway system dark for weeks; insurers start pricing the end of the city.',
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: 8 },
      { op: 'addWorld', field: 'societalStress', value: 8 },
      { op: 'addAllCountries', field: 'adoption.policy', value: 0.02 },
    ] },

  // ─── Negative passive (tongue-in-cheek) ──────────────────────────────
  { id: 'ice_rink_mania', weight: 2, tone: 'bad', title: 'Dictator Discovers Ice Hockey',
    headline: 'A Korean leader becomes obsessed with hockey, orders rinks in every city. Refrigerant emissions go vertical.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.3 },
      { op: 'addAllCountries', field: 'adoption.industry', value: -0.01 },
    ] },

  { id: 'wind_cycling_fallacy', weight: 2, tone: 'bad', title: '"Windmills Cause Emissions," Pundit Claims',
    headline: 'A viral op-ed argues renewable variability forces coal to cycle, "making it dirtier than baseload." The math does not check out; the ratings do.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: -3 },
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.02 },
    ] },

  // ─── Grade-school kid inventors (tongue-in-cheek positive cluster) ───
  // Three independent events. Each fires on its own weight — not a saga, just
  // a thematic cluster that reinforces "solutions come from everywhere."
  { id: 'grade_school_capture', weight: 2, tone: 'good', title: 'Fifth Grader Invents Capture Toy',
    headline: 'A ten-year-old\'s science-fair project turns out to be a working ambient carbon absorber. The patent office is confused.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 6 },
      { op: 'addAllCountries', field: 'adoption.capture', value: 0.02 },
    ] },

  { id: 'grade_school_solar', weight: 2, tone: 'good', title: 'Kids Build a Solar Road',
    headline: "A middle-school class paves their parking lot with their own photovoltaic tiles. It works. Engineers have questions.",
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.02 },
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ] },

  { id: 'grade_school_ocean', weight: 2, tone: 'good', title: 'Third Graders Clean an Ocean',
    headline: 'Schoolchildren in a coastal town invent a plastic-scooping drone. It does more cleanup in a summer than the previous decade of policy.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
      { op: 'addAllCountries', field: 'politicalWill', value: 3 },
    ] },

  // ─── Interactive (pool v3) ───────────────────────────────────────────
  { id: 'carbon_bank_children', weight: 2, tone: 'neutral', interactive: true, category: 'unintended', title: 'Carbon Bank at Birth',
    guard: (s) => s.world.researched.has('carbon_price') || s.world.researched.size > 6,
    headline: 'A proposal: every child is born with a lifetime carbon allowance. Radical accountability — or rationing the right to exist?',
    advisorStances: [
      { advisor: 'scientist', supports: 'enact', stance: 'A per-capita ceiling is the fairest carbon math we have ever been offered. Enact it.' },
      { advisor: 'diplomat',  supports: 'shelve', stance: 'Giving a newborn a debt ledger is a PR catastrophe. Governments that sign this do not survive the next election.' },
    ],
    choices: [
      { key: 'enact', label: 'Enact the lifetime carbon bank', headline: 'Bill passes. Every child gets a lifetime allowance — and a receipt.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'co2ppm', value: -0.5 },
          { op: 'addAllCountries', field: 'adoption.policy', value: 0.05 },
          { op: 'addAllCountries', field: 'politicalWill', value: -8 },
          { op: 'addWorld', field: 'societalStress', value: 4 },
        ],
        // Durable policy-driven birth-rate drop. A lifetime carbon ceiling
        // prices the decision to have a child; demographers read this as a
        // ~10% structural dip. Flag durable so PopulationSystem doesn't
        // decay it.
        apply: (s) => {
          for (const c of Object.values(s.countries)) {
            const delta = -(c.birthRatePerYear ?? 0) * 0.10;
            c.birthRateModifier = (c.birthRateModifier ?? 0) + delta;
            c.birthRateModifierDurable = true;
          }
        },
        summaryOverride: '−10% global birth rate (durable)',
        echo: { delayTicks: 16, tone: 'neutral',
          headline: () => "Four years on: the carbon bank is working and unpopular. Birth rates keep falling; so do emissions. Nobody is sure which caused which." } },
      { key: 'shelve', label: 'Shelve it', headline: 'Proposal dies in committee. Op-ed writers relax.', tone: 'neutral',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 2 },
        ],
        echo: { delayTicks: 14, tone: 'neutral',
          headline: () => 'Three years on: the carbon-bank idea keeps surfacing. No one has a better answer to per-capita emissions.' } },
    ] },

  { id: 'patents_cancelled_g7', weight: 2, tone: 'neutral', interactive: true, category: 'unintended', title: 'G7 Climate Patent Cancellation',
    guard: (s) => s.world.researched.size > 6,
    headline: 'The G7 proposes cancelling all climate-related patents to speed deployment in the Global South. Labs push back hard.',
    advisorStances: [
      { advisor: 'scientist',     supports: 'cancel', stance: 'IP is a speed tax. Drop it and adoption doubles in three years. The labs will survive; the reefs will not.' },
      { advisor: 'industrialist', supports: 'keep',   stance: 'Without enforceable IP the next breakthrough never gets funded. You are mortgaging 2040 for a headline in 2027.' },
    ],
    choices: [
      { key: 'cancel', label: 'Cancel the patents', headline: 'Patents void. Global South deployment pipelines light up in weeks.', tone: 'good',
        effects: [
          { op: 'addRandomBranches', count: 4, value: 0.05 },
          { op: 'addWorld', field: 'co2ppm', value: -0.4 },
          { op: 'addWorld', field: 'climatePoints', value: -6 },
        ],
        echo: { delayTicks: 18, tone: 'neutral',
          headline: () => 'Five years on: adoption is genuinely faster. The private R&D pipeline is genuinely thinner. Both are true.' } },
      { key: 'keep', label: 'Keep the patents, subsidize licensing instead', headline: 'Patents preserved; a licensing fund softens the blow.', tone: 'neutral',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: -3 },
          { op: 'addAllCountries', field: 'adoption.industry', value: 0.02 },
        ],
        echo: { delayTicks: 16, tone: 'neutral',
          headline: () => 'Four years on: the licensing fund got everyone what they needed, just two years slower than the cancellation would have.' } },
    ] },

  { id: 'billionaire_overview_effect', weight: 2, tone: 'good', interactive: true, title: 'Billionaire Sees Earth From Orbit',
    headline: "A billionaire returns from a space jaunt visibly shaken. Announces a $100B climate fund — 'no strings, fast deployment.' Accept?",
    advisorStances: [
      { advisor: 'diplomat', supports: 'accept', stance: 'Hundred billion with no strings is a gift. Take it. Thank him publicly. Move on.' },
      { advisor: 'activist', supports: 'demand', stance: 'Strings are the only leverage we have. Demand governance or this becomes his vanity monument.' },
    ],
    choices: [
      { key: 'accept', label: 'Accept the fund as-is', headline: 'Hundred billion unlocked. Deployment teams are hiring the same week.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 30 },
          { op: 'addAllCountries', field: 'adoption.energy', value: 0.03 },
          { op: 'addAllCountries', field: 'adoption.capture', value: 0.02 },
        ],
        echo: { delayTicks: 16, tone: 'neutral',
          headline: () => 'Four years on: the fund shipped more tonnage than any government program. It also rewrote who gets to set climate priorities.' } },
      { key: 'demand', label: 'Demand public governance', headline: 'Negotiations drag on for a year. A smaller, governed fund emerges.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 12 },
          { op: 'addAllCountries', field: 'politicalWill', value: 6 },
          { op: 'addAllCountries', field: 'adoption.policy', value: 0.03 },
        ],
        echo: { delayTicks: 14, tone: 'good',
          headline: () => 'Three years on: the governed fund is smaller, slower, and durable. Its board outlives the billionaire.' } },
    ] },

  { id: 'whale_tax_debate', weight: 2, tone: 'neutral', interactive: true, title: 'The Whale Tax',
    headline: 'A coalition proposes taxing industrial whale-kills at $15M each — the carbon-sink value of a living whale. Commercial fleets lobby furiously.',
    advisorStances: [
      { advisor: 'scientist',     supports: 'impose', stance: 'Whales are a measurable carbon sink. Pricing their ecological service is conservation math, not sentiment.' },
      { advisor: 'industrialist', supports: 'table',  stance: 'Taxing specific species picks winners and losers across four industries. Start with carbon, end with whales — not the other way around.' },
    ],
    choices: [
      { key: 'impose', label: 'Impose the whale tax', headline: 'Tax passes. Whaling fleets pivot or fold. Ocean carbon numbers look better on paper.', tone: 'good',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 4 },
          { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
          { op: 'addCountries', where: { infra: 'industrial' }, field: 'politicalWill', value: -3 },
        ],
        echo: { delayTicks: 14, tone: 'good',
          headline: () => 'Three years on: the whale tax is quietly the most cost-effective ocean climate policy on the books.' } },
      { key: 'table', label: 'Table it for now', headline: 'Tax shelved. Fleets celebrate. Marine biologists keep publishing the math.', tone: 'neutral',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 2 },
        ],
        echo: { delayTicks: 16, tone: 'neutral',
          headline: () => 'Four years on: "ecosystem pricing" enters mainstream economics textbooks. The whale tax is an inevitability, just not this year.' } },
    ] },

  // ─── IPCC narrative pulse — scripted-cadence events ──────────────────
  // Force-picked by EventSystem every BALANCE.ipccCadenceTicks (every 4
  // years). Tag `ipcc: true` is what makes them eligible for the cadence
  // pick — otherwise they behave as normal passive events, so they can also
  // surface off-cadence at low weight if nothing else wants to fire.
  { id: 'ipcc_synthesis', weight: 1, tone: 'neutral', ipcc: true, title: 'IPCC Synthesis Report',
    headline: (s) => `The IPCC publishes its synthesis report. Current trajectory: +${(s.world.tempAnomalyC + 0.4).toFixed(1)}°C by 2100. Decarbonization pace must roughly double.`,
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: 3 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'ipcc_phase_fight', weight: 1, tone: 'bad', ipcc: true, title: 'IPCC Delegates Deadlock',
    headline: 'Delegates spend the full IPCC plenary fighting over "phase-out" vs "phase-down" and "shall" vs "should." Final text keeps all four.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: -3 },
      { op: 'addAllCountries', field: 'politicalWill', value: -2 },
    ] },

  { id: 'ipcc_cap_left', weight: 1, tone: 'neutral', ipcc: true, title: 'IPCC: The Budget Is Smaller Than We Thought',
    headline: (s) => `New modeling cuts the remaining 1.5°C carbon budget by a third. At current rates, it runs out before ${s.meta.year + 6}.`,
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 3 },
      { op: 'addAllCountries', field: 'politicalWill', value: 4 },
    ] },

  { id: 'ipcc_nature_scaled', weight: 1, tone: 'good', ipcc: true, title: 'IPCC: Nature-Based Solutions Scale',
    headline: 'IPCC working group finds nature-based removals are delivering 40% above projections. Protected-area expansion is the single biggest lever this year.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
      { op: 'addWorld', field: 'climatePoints', value: 4 },
    ] },

  // ─── Hermit saga — recurring character, four beats ────────────────────
  // Stages advance through state.meta.hermitStage. Each event guards on
  // current stage + a light game-state condition so the arc paces itself
  // across a playthrough. The final beat is interactive and reads world
  // state so the outcome flavor matches the actual situation.
  { id: 'hermit_sighting', weight: 3, tone: 'neutral', title: 'Man in a Cabin',
    guard: (s) => (s.meta.hermitStage ?? 0) === 0 && s.meta.tick > 10,
    headline: "A reporter finds a hermit living off-grid — solar panels, own garden, a sweater knit from his own sheep's wool. He declines an interview.",
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 1 },
    ],
    apply: (s) => { s.meta.hermitStage = 1; } },

  { id: 'hermit_treatise', weight: 3, tone: 'good', title: 'The Hermit Publishes',
    guard: (s) => (s.meta.hermitStage ?? 0) === 1 && s.meta.tick > 20,
    headline: "The cabin hermit's privately-printed treatise on self-sufficient living leaks online. Three chapters on passive cooling go mildly viral.",
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
      { op: 'addAllCountries', field: 'adoption.energy', value: 0.02 },
      { op: 'addWorld', field: 'climatePoints', value: 4 },
    ],
    apply: (s) => { s.meta.hermitStage = 2; } },

  { id: 'hermit_breakthrough', weight: 2, tone: 'good', title: 'Hermit Solves One Thing Completely',
    guard: (s) => (s.meta.hermitStage ?? 0) === 2 && s.world.researched.size > 6,
    headline: 'The hermit — still declining to leave his cabin — emails a working proof for a cheap atmospheric carbon sink. Engineers replicate it in a weekend.',
    effects: [
      { op: 'addWorld', field: 'climatePoints', value: 14 },
      { op: 'addAllCountries', field: 'adoption.capture', value: 0.05 },
      { op: 'addWorld', field: 'co2ppm', value: -0.5 },
    ],
    apply: (s) => { s.meta.hermitStage = 3; } },

  { id: 'hermit_emergence', weight: 2, tone: 'neutral', interactive: true, title: 'The Hermit Emerges',
    guard: (s) => (s.meta.hermitStage ?? 0) === 3 && s.meta.tick > 60,
    headline: (s) => {
      const nz = Object.values(s.countries).filter(c => c.netZero).length;
      const total = Object.values(s.countries).length;
      const ratio = total ? nz / total : 0;
      if (ratio > 0.5) return 'The hermit walks out of his cabin for the first time in decades. He finds a visibly cooler, quieter world. He wanted to know if it worked.';
      if (ratio > 0.2) return 'The hermit walks out of his cabin. The world is recognizable — stressed, smoky, but intact. He asks a reporter, quietly, "did we make it?"';
      return 'The hermit walks out of his cabin. The forest around it is dying. He looks at the reporter and asks what year it is.';
    },
    choices: [
      { key: 'celebrate', label: 'Bring him to the UN', headline: "The hermit addresses the General Assembly in a hand-knit sweater. He says the transition was always a cultural problem. People listen.", tone: 'good',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 8 },
          { op: 'addWorld', field: 'climatePoints', value: 10 },
        ],
        echo: { delayTicks: 12, tone: 'good',
          headline: () => 'Three years on: the hermit has gone home again. "Cabin-Pragmatism" is a recognized political philosophy in four countries.' } },
      { key: 'return', label: 'Let him go back to the cabin', headline: 'He returns to his sheep. The world keeps his treatise. Nobody asks him to come back again.', tone: 'good',
        effects: [
          { op: 'addAllCountries', field: 'adoption.land', value: 0.03 },
          { op: 'addWorld', field: 'climatePoints', value: 5 },
        ],
        echo: { delayTicks: 12, tone: 'good',
          headline: () => 'Three years on: the cabin still stands. So does the treatise. So, mostly, does the world.' } },
    ] },

  { id: 'global_pandemic_shutdown', weight: 1, tone: 'neutral', interactive: true, category: 'unintended', title: 'Pandemic Shutdown Decision',
    guard: (s) => s.world.societalStress > 25,
    headline: 'A novel respiratory pandemic hits. Coordinated global shutdown would clear the skies — and break the economy. Impose it?',
    advisorStances: [
      { advisor: 'activist', supports: 'shutdown', stance: 'The last shutdown gave us the cleanest air a generation has breathed. This one saves lives either way.' },
      { advisor: 'diplomat', supports: 'targeted', stance: 'A global shutdown fractures the coalitions we rely on. Go targeted, keep the supply chains, keep the trust.' },
    ],
    choices: [
      { key: 'shutdown', label: 'Coordinate a global shutdown', headline: 'World activity halts. Skies clear. Unemployment spikes. Transmission drops.', tone: 'neutral',
        effects: [
          { op: 'addWorld', field: 'co2ppm', value: -0.8 },
          { op: 'addWorld', field: 'climatePoints', value: -12 },
          { op: 'addWorld', field: 'societalStress', value: 6 },
          { op: 'addAllCountries', field: 'politicalWill', value: -4 },
        ],
        // Transient death-rate spike from the pandemic itself. Not durable —
        // PopulationSystem decays it over ~3.5 years, matching the real-world
        // shape of excess-death curves.
        apply: (s) => {
          for (const c of Object.values(s.countries)) {
            c.deathRateModifier = (c.deathRateModifier ?? 0) + 0.003;
          }
        },
        summaryOverride: '+0.3% global death rate (transient)',
        echo: { delayTicks: 12, tone: 'neutral',
          headline: () => "Three years on: the shutdown was the cleanest quarter in measurement history. Nobody agrees it was worth it; nobody agrees it wasn't." } },
      { key: 'targeted', label: 'Targeted measures, keep the economy open', headline: 'Targeted controls deployed. Transmission slower but sustained. Emissions unchanged.', tone: 'neutral',
        effects: [
          { op: 'addWorld', field: 'societalStress', value: 3 },
          { op: 'addAllCountries', field: 'politicalWill', value: 1 },
        ],
        echo: { delayTicks: 12, tone: 'neutral',
          headline: () => 'Three years on: the targeted response is a case study in what public-health schools teach — and what climate schools wish we had tried.' } },
    ] },

  // ═══════════════ POOL v4 — NEGATIVE REBALANCE ═══════════════
  // The passive pool skewed good-over-bad by ~28% weight (128 vs 100) pre-v4,
  // which let a passive player drift gently toward wins. These 14 events add
  // ~+27 bad weight to land the pool near parity. Themes chosen to fill
  // gaps: hard-sector inertia, backfires from good intentions, champion-
  // country backslides, AI-era misinformation, plus two new guarded tipping
  // points. Voice stays grounded — most events have a systemic cause, not a
  // villain.

  // ─── Passive bad (realistic) ─────────────────────────────────────────
  { id: 'heavy_industry_stall', weight: 2, tone: 'bad', title: 'Heavy Industry Stalls',
    headline: 'Steel, cement and aluminum decarbonization slips another decade. The capex is real, the green-steel buyers are thin, and nobody wants to move first.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.industry', value: -0.03 },
      { op: 'addWorld', field: 'climatePoints', value: -6 },
    ] },

  { id: 'permit_backlog', weight: 3, tone: 'bad', title: 'Interconnect Queue Breaks',
    guard: (s) => s.meta.tick > 20,
    headline: 'Transmission-interconnect queues clear the decade mark. Finished wind and solar sit idle, waiting on copper and a court date.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.03 },
      { op: 'addWorld', field: 'climatePoints', value: -5 },
    ] },

  { id: 'biofuel_deforestation', weight: 2, tone: 'bad', title: 'Biofuel Mandate Backfires',
    guard: (s) => s.world.researched.size > 4,
    headline: 'A decade-old biofuel mandate is audited. The tropical forests lost to feedstock farms now emit more than the fuel saves. Retractions all around.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: -0.04 },
      { op: 'addWorld', field: 'co2ppm', value: 0.3 },
    ] },

  { id: 'deepfake_ceo_scandal', weight: 2, tone: 'bad', title: 'Deepfake Discredits a Champion',
    headline: 'An AI-generated video shows a prominent climate-positive CEO taking a bribe. It is fake; the damage is real. Three ESG funds pull out by Friday.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 4 },
      { op: 'addAllCountries', field: 'politicalWill', value: -4 },
    ] },

  { id: 'climate_denial_court_win', weight: 2, tone: 'bad', title: 'Supreme Court Strikes Down Climate Law',
    guard: (s) => s.world.researched.size > 4,
    headline: 'A closely-watched ruling voids a cornerstone emissions regulation on administrative-law grounds. Successor legislation, timing: unclear.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.policy', value: -0.04 },
      { op: 'addWorld', field: 'climatePoints', value: -4 },
    ] },

  { id: 'renewable_recall', weight: 2, tone: 'bad', title: 'Wind Turbine Blade Recall',
    headline: 'Blade defects force a global recall of a best-selling turbine model. Installations pause for six months while fleets are inspected.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.03 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'heatwave_blackout_cascade', weight: 2, tone: 'bad', title: 'Heatwave Blackout Cascade',
    guard: (s) => s.world.tempAnomalyC > 1.5,
    headline: 'A three-country heat dome pushes AC demand past grid capacity. Rolling blackouts kill hundreds; every remaining coal plant comes back online.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.energy', value: -0.02 },
      { op: 'addAllCountries', field: 'politicalWill', value: -3 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
    ] },

  { id: 'green_champion_backslide', weight: 2, tone: 'bad', title: 'Champion Country Backslides',
    // Punishes concentration: the better you make a country, the more
    // valuable (and fragile) it is. Skipped early-game when no country has
    // both high energy and policy adoption.
    guard: (s) => Object.values(s.countries).some(c => !c.netZero && (c.adoption?.energy ?? 0) > 0.4 && (c.adoption?.policy ?? 0) > 0.3),
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => !c.netZero && (c.adoption?.energy ?? 0) > 0.4 && (c.adoption?.policy ?? 0) > 0.3)),
    headline: (s, ctx) => `${ctx.target?.name} elects a coalition running on "climate pragmatism." The flagship policies are softened in the first month.`,
    effects: [
      { op: 'addTarget', field: 'adoption.policy', value: -0.05 },
      { op: 'addTarget', field: 'adoption.energy', value: -0.03 },
      { op: 'addTarget', field: 'politicalWill', value: -6 },
    ] },

  { id: 'fertilizer_crunch', weight: 2, tone: 'bad', title: 'Fertilizer Supply Crunch',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'agricultural')),
    headline: (s, ctx) => `Nitrogen-fertilizer prices spike 4× across ${ctx.target?.name}. Regen-ag programs lose funding to emergency subsidies for the old system.`,
    effects: [
      { op: 'addTarget', field: 'adoption.land', value: -0.05 },
      { op: 'addTarget', field: 'politicalWill', value: -4 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  { id: 'climate_journalist_killed', weight: 2, tone: 'bad', title: 'Climate Journalist Killed',
    target: (s, rng) => rng.pick(Object.values(s.countries).filter(c => c.infra === 'petrostate')),
    headline: (s, ctx) => `An investigative reporter covering oil lobbying in ${ctx.target?.name} is killed in a "targeted hit-and-run." Sector coverage freezes for the year.`,
    effects: [
      { op: 'addTarget', field: 'politicalWill', value: -6 },
      { op: 'addAllCountries', field: 'politicalWill', value: -2 },
      { op: 'addWorld', field: 'societalStress', value: 4 },
    ] },

  { id: 'youth_burnout', weight: 2, tone: 'bad', title: 'Youth Climate Movement Fatigues',
    guard: (s) => s.meta.tick > 40,
    headline: 'After a decade in the streets, the climate-youth wave enters a burnout cycle. Turnout at the annual march halves; op-eds start writing its eulogy.',
    effects: [
      { op: 'addAllCountries', field: 'politicalWill', value: -4 },
      { op: 'addWorld', field: 'societalStress', value: 2 },
    ] },

  // ─── Passive bad (tongue-in-cheek) ───────────────────────────────────
  { id: 'ski_country_goes_bust', weight: 2, tone: 'bad', title: 'Ski Country Goes Bust',
    guard: (s) => s.world.tempAnomalyC > 1.5,
    headline: 'Two alpine nations declare their ski-tourism industries structurally insolvent. The snow cannons gave up first.',
    effects: [
      { op: 'addCountries', where: { infra: ['service', 'mixed'] }, field: 'politicalWill', value: -3 },
      { op: 'addWorld', field: 'societalStress', value: 3 },
    ] },

  // ─── Guarded tipping-points (new) ────────────────────────────────────
  { id: 'ocean_stratification', weight: 1, tone: 'bad', title: 'Ocean Stratification Locks In',
    guard: (s) => s.world.tempAnomalyC > 1.7,
    headline: 'Warmer surface waters stop mixing with the deep ocean. The ocean carbon pump slows — years earlier than any model projected.',
    effects: [
      { op: 'addWorld', field: 'co2ppm', value: 0.6 },
      { op: 'addAllCountries', field: 'adoption.capture', value: -0.02 },
    ] },

  { id: 'sahel_monsoon_fails', weight: 1, tone: 'bad', title: 'Sahel Monsoon Fails',
    guard: (s) => s.world.tempAnomalyC > 1.8,
    headline: 'The West African monsoon fails for the third year running. Regional food systems collapse; displacement pressure reaches the coasts.',
    effects: [
      { op: 'addWorld', field: 'societalStress', value: 5 },
      { op: 'addAllCountries', field: 'politicalWill', value: -3 },
    ] },

  // ═══════════════ POOL v5 — FARMING / GARDENING CLUSTER ═══════════════
  // Small-weight positive cluster tied to the new home_gardening activity and
  // the Garden Plot collectable. Themed around grassroots food systems —
  // individually low-impact, collectively a real lever. Voice mirrors the
  // grade-school inventor cluster: tongue-in-cheek with a grain of truth.

  { id: 'community_gardens_boom', weight: 2, tone: 'good', title: 'Community Gardens Boom',
    headline: 'Every vacant lot in three dozen cities becomes a raised bed. Parks departments are thrilled, insurers are confused.',
    effects: [
      { op: 'addCountries', where: { infra: ['service', 'mixed'] }, field: 'adoption.land', value: 0.03 },
      { op: 'addAllCountries', field: 'politicalWill', value: 2 },
    ] },

  { id: 'victory_gardens_return', weight: 2, tone: 'good', title: 'Victory Gardens Return',
    headline: 'Wartime-era backyard gardening campaigns get a retro rebrand. A million front lawns become tomato patches.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
      { op: 'addWorld', field: 'climatePoints', value: 3 },
    ] },

  { id: 'balcony_farming_wave', weight: 2, tone: 'good', title: 'Balcony Farming Goes Viral',
    headline: 'A dense-city micro-gardening app hits 30M users. The joke phrase "vertical urbanism" starts meaning something.',
    effects: [
      { op: 'addCountries', where: { infra: 'service' }, field: 'adoption.land', value: 0.04 },
    ] },

  { id: 'school_garden_movement', weight: 2, tone: 'good', title: 'Every School Gets a Garden',
    headline: 'School-district food-literacy mandates take root. Kids grow lunch; cafeteria carbon footprints crater.',
    effects: [
      { op: 'addAllCountries', field: 'adoption.land', value: 0.02 },
      { op: 'addAllCountries', field: 'politicalWill', value: 2 },
    ] },
];
