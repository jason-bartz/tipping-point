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
  { id: 'geo_offer', weight: 2, tone: 'neutral', interactive: true, title: 'Geoengineering Offer',
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

  { id: 'nuclear_dilemma', weight: 2, tone: 'neutral', interactive: true, title: 'Nuclear Dilemma',
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

  { id: 'refugee_crisis', weight: 2, tone: 'neutral', interactive: true, title: 'Climate Refugee Crisis',
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
];
