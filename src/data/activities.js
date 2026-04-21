// Research tree. Tiers determine cost/time bands:
//   T1: 1–3 credits | 2–3 ticks      T2: 4–7 | 4–5
//   T3: 10–14 | 7–9                  T4: 22–30 | 12–16
//
// Optional per-activity political fields (omit = ungated incentive):
//   willRequirement: number — country's political will must be ≥ this to deploy
//   willCost:        number — deploy drains this much will (models backlash)
// Incentives (subsidies, R&D, infrastructure) generally have neither — they
// pass with a signature. Mandates / taxes / phase-outs require a political
// coalition, so the player has to earn will before they can spend it.

export const BRANCHES = {
  energy:    { label: 'Energy',    color: '#f5c518', icon: '<span class="gi gi-energy"></span>' },
  transport: { label: 'Transport', color: '#4fb3ff', icon: '<span class="gi gi-transport"></span>' },
  industry:  { label: 'Industry',  color: '#ff7a45', icon: '<span class="gi gi-industry"></span>' },
  land:      { label: 'Land',      color: '#4ade80', icon: '<span class="gi gi-land"></span>' },
  capture:   { label: 'Capture',   color: '#c084fc', icon: '<span class="gi gi-capture"></span>' },
  policy:    { label: 'Policy',    color: '#f472b6', icon: '<span class="gi gi-policy"></span>' },
};

export const TIER_META = {
  1: { label: 'Entry',     hint: 'Proven tech. Cheap, fast.' },
  2: { label: 'Scale',     hint: 'Builds on the basics.' },
  3: { label: 'Transform', hint: 'Cross-branch leverage.' },
  4: { label: 'Capstone',  hint: 'Endgame. Expensive. Slow. Planet-changing.' },
};

export const ACTIVITIES = [
  // ═══════════════ ENERGY ═══════════════
  { id: 'solar_power',          branch: 'energy',    tier: 1, name: 'Solar Power',             prereqs: [],                                         researchCost: 2,  researchTicks: 2,  deployCost: 2,  deployAdoption: 0.15, desc: 'Subsidize solar PV. Cheap, fast, already cheaper than coal.' },
  { id: 'wind_power',           branch: 'energy',    tier: 1, name: 'Wind Power',              prereqs: [],                                         researchCost: 2,  researchTicks: 2,  deployCost: 2,  deployAdoption: 0.15, desc: 'Onshore wind. Quiet where nobody lives, loud where they do.' },
  { id: 'geothermal',           branch: 'energy',    tier: 1, name: 'Geothermal',              prereqs: [],                                         researchCost: 2,  researchTicks: 3,  deployCost: 2,  deployAdoption: 0.12, desc: 'Drill for heat, not oil.' },
  { id: 'grid_mod',             branch: 'energy',    tier: 1, name: 'Grid Modernization',      prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.18, desc: 'Smart meters, batteries, demand response. The grid graduates.' },
  { id: 'nuclear_smr',          branch: 'energy',    tier: 1, name: 'Nuclear SMRs',            prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.25, desc: 'Small modular reactors. Cheaper to build, slightly scarier to explain.' },
  { id: 'solar_mandate',        branch: 'energy',    tier: 2, name: 'Solar Mandate',           prereqs: ['solar_power'],                            researchCost: 5,  researchTicks: 4,  deployCost: 4,  deployAdoption: 0.20, willRequirement: 45, willCost: 4, desc: 'Rooftop solar mandate for new construction.' },
  { id: 'perovskite_tandem',    branch: 'energy',    tier: 2, name: 'Perovskite Tandems',      prereqs: ['solar_power'],                            researchCost: 5,  researchTicks: 4,  deployCost: 4,  deployAdoption: 0.18, desc: 'Next-gen tandem solar cells. Record-breaking efficiency in mass production.' },
  { id: 'offshore_wind',        branch: 'energy',    tier: 2, name: 'Offshore Wind',           prereqs: ['wind_power'],                             researchCost: 6,  researchTicks: 5,  deployCost: 5,  deployAdoption: 0.22, desc: 'Giant turbines nobody has to look at.' },
  { id: 'solar_export',         branch: 'energy',    tier: 3, name: 'Solar Export Grid',      prereqs: ['solar_mandate','grid_mod'],               researchCost: 11, researchTicks: 7,  deployCost: 7,  deployAdoption: 0.22, desc: 'Continental DC backbone. Sahara solar in Berlin by Tuesday.' },
  { id: 'virtual_power_plants', branch: 'energy',    tier: 3, name: 'Virtual Power Plants',   prereqs: ['grid_mod','offshore_wind'],               researchCost: 12, researchTicks: 8,  deployCost: 8,  deployAdoption: 0.24, desc: 'Millions of home batteries and EVs act as one coordinated plant.' },
  { id: 'fusion_commercial',    branch: 'energy',    tier: 4, name: 'Commercial Fusion',       prereqs: ['nuclear_smr','solar_export'],             researchCost: 26, researchTicks: 14, deployCost: 14, deployAdoption: 0.30, desc: 'Stars on earth, at grid scale. Electricity too cheap to bother metering.' },

  // ═══════════════ TRANSPORT ═══════════════
  { id: 'cycling_infra',        branch: 'transport', tier: 1, name: 'Cycling Infrastructure',  prereqs: [],                                         researchCost: 1,  researchTicks: 2,  deployCost: 1,  deployAdoption: 0.10, desc: 'Protected bike lanes. Streets become for people.' },
  { id: 'ev_subsidies',         branch: 'transport', tier: 1, name: 'EV Subsidies',            prereqs: [],                                         researchCost: 2,  researchTicks: 2,  deployCost: 2,  deployAdoption: 0.15, desc: 'Tax credits for EV buyers. Works. Ends too soon.' },
  { id: 'hsr',                  branch: 'transport', tier: 1, name: 'High-Speed Rail',         prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.15, desc: 'Trains that show up on time replace short-haul flights.' },
  { id: 'saf',                  branch: 'transport', tier: 1, name: 'Sustainable Aviation Fuel', prereqs: [],                                       researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.12, desc: 'Biofuels and e-kerosene. Flying guilt drops slightly.' },
  { id: 'micromobility',        branch: 'transport', tier: 2, name: 'Micromobility Networks',  prereqs: ['cycling_infra'],                          researchCost: 4,  researchTicks: 4,  deployCost: 3,  deployAdoption: 0.15, desc: 'E-scooters, cargo bikes, car-share hubs. Urban driving drops a third.' },
  { id: 'ev_mandates',          branch: 'transport', tier: 2, name: 'EV Mandates',             prereqs: ['ev_subsidies'],                           researchCost: 6,  researchTicks: 5,  deployCost: 5,  deployAdoption: 0.20, willRequirement: 50, willCost: 5, desc: 'Mandate EV share of new sales. Automakers comply.' },
  { id: 'ice_phaseout',         branch: 'transport', tier: 3, name: 'ICE Phaseout',            prereqs: ['ev_mandates'],                            researchCost: 12, researchTicks: 8,  deployCost: 7,  deployAdoption: 0.25, willRequirement: 65, willCost: 8, desc: 'Ban new combustion engine sales. Gas stations become art galleries.' },
  { id: 'ev_fast_grid',         branch: 'transport', tier: 3, name: 'EV Fast-Charge Grid',     prereqs: ['ev_mandates','grid_mod'],                 researchCost: 12, researchTicks: 8,  deployCost: 8,  deployAdoption: 0.22, desc: 'Ubiquitous 15-minute charging. Range anxiety disappears.' },
  { id: 'maglev_network',       branch: 'transport', tier: 4, name: 'Maglev Network',          prereqs: ['hsr','ice_phaseout'],                     researchCost: 24, researchTicks: 13, deployCost: 13, deployAdoption: 0.26, desc: 'Continental vacuum-tube rail. Flying becomes quaint.' },

  // ═══════════════ INDUSTRY ═══════════════
  { id: 'heat_pumps',           branch: 'industry',  tier: 1, name: 'Heat Pumps',              prereqs: [],                                         researchCost: 2,  researchTicks: 2,  deployCost: 2,  deployAdoption: 0.18, desc: 'Reverse fridges that heat buildings.' },
  { id: 'circular_econ',        branch: 'industry',  tier: 1, name: 'Circular Economy',        prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.15, desc: 'Products must be repairable.' },
  { id: 'green_steel',          branch: 'industry',  tier: 1, name: 'Green Steel',             prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.20, desc: 'Hydrogen-based steelmaking.' },
  { id: 'green_cement',         branch: 'industry',  tier: 1, name: 'Green Cement',            prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.16, desc: 'Cement without the 8% of global emissions. Finally.' },
  { id: 'retrofits',            branch: 'industry',  tier: 2, name: 'Building Retrofits',      prereqs: ['heat_pumps'],                             researchCost: 5,  researchTicks: 5,  deployCost: 4,  deployAdoption: 0.18, desc: 'Insulate the housing stock. Boring. Effective.' },
  { id: 'passive_house',        branch: 'industry',  tier: 3, name: 'Passive House Code',      prereqs: ['retrofits'],                              researchCost: 10, researchTicks: 7,  deployCost: 6,  deployAdoption: 0.22, willRequirement: 55, willCost: 5, desc: 'Near-zero heating energy for new buildings.' },
  { id: 'industrial_electric',  branch: 'industry',  tier: 3, name: 'Industrial Electrification', prereqs: ['heat_pumps','grid_mod'],               researchCost: 12, researchTicks: 8,  deployCost: 8,  deployAdoption: 0.22, desc: 'High-temp heat pumps and electric arc furnaces. Fossil fuels leave the factory floor.' },
  { id: 'hydrogen_industrial',  branch: 'industry',  tier: 3, name: 'Hydrogen Industry',       prereqs: ['green_steel','green_cement'],             researchCost: 13, researchTicks: 8,  deployCost: 9,  deployAdoption: 0.24, desc: 'Green H₂ replaces coking coal and natural gas across heavy industry.' },

  // ═══════════════ LAND ═══════════════
  { id: 'reforestation',        branch: 'land',      tier: 1, name: 'Reforestation',           prereqs: [],                                         researchCost: 2,  researchTicks: 2,  deployCost: 2,  deployAdoption: 0.15, desc: 'Plant trees. A lot of them. Right ones, right places.' },
  { id: 'regen_ag',             branch: 'land',      tier: 1, name: 'Regenerative Agriculture', prereqs: [],                                        researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.15, desc: 'Farming that builds soil carbon.' },
  { id: 'plant_subsidy',        branch: 'land',      tier: 1, name: 'Plant-Based Subsidies',   prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.15, willRequirement: 40, willCost: 4, desc: 'Shift subsidies from beef to beans.' },
  { id: 'mangrove',             branch: 'land',      tier: 1, name: 'Mangrove Restoration',    prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.12, desc: 'Wet carbon sinks. Huge bang for the buck.' },
  { id: 'rewilding',            branch: 'land',      tier: 2, name: 'Mass Rewilding',          prereqs: ['reforestation'],                          researchCost: 6,  researchTicks: 5,  deployCost: 5,  deployAdoption: 0.20, desc: 'Return land to nature. Beavers are hired.' },
  { id: 'biochar',              branch: 'land',      tier: 2, name: 'Biochar Programs',        prereqs: ['regen_ag'],                               researchCost: 5,  researchTicks: 4,  deployCost: 4,  deployAdoption: 0.15, desc: 'Pyrolyze ag waste, bury the carbon. Fields turn black, soil thrives.' },
  { id: 'kelp_forests',         branch: 'land',      tier: 2, name: 'Ocean Kelp Forests',      prereqs: ['mangrove'],                               researchCost: 6,  researchTicks: 5,  deployCost: 5,  deployAdoption: 0.18, desc: 'Vast kelp farms sequester carbon and feed the sea.' },
  { id: 'alt_proteins',         branch: 'land',      tier: 3, name: 'Alternative Proteins',    prereqs: ['plant_subsidy','regen_ag'],               researchCost: 12, researchTicks: 8,  deployCost: 8,  deployAdoption: 0.22, willRequirement: 55, willCost: 5, desc: 'Precision fermentation and cultivated meat. Cattle herds shrink by half.' },

  // ═══════════════ CAPTURE ═══════════════
  { id: 'enhanced_weathering',  branch: 'capture',   tier: 1, name: 'Enhanced Weathering',     prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.10, desc: 'Spread olivine dust. Rock meets atmosphere.' },
  { id: 'beccs',                branch: 'capture',   tier: 1, name: 'Bioenergy + CCS',         prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.12, desc: 'Burn biomass, bury the CO2.' },
  { id: 'dac',                  branch: 'capture',   tier: 1, name: 'Direct Air Capture',      prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 4,  deployAdoption: 0.15, desc: 'Suck CO2 out of the sky. Expensive. Improving.' },
  { id: 'ocean_alkalinity',     branch: 'capture',   tier: 2, name: 'Ocean Alkalinity',        prereqs: ['enhanced_weathering'],                    researchCost: 6,  researchTicks: 5,  deployCost: 5,  deployAdoption: 0.15, desc: 'Dose surface seas with alkali to lock CO₂ as bicarbonate.' },
  { id: 'dac_network',          branch: 'capture',   tier: 2, name: 'DAC Network',             prereqs: ['dac'],                                    researchCost: 8,  researchTicks: 5,  deployCost: 6,  deployAdoption: 0.20, desc: 'DAC at scale, powered by surplus renewables.' },
  { id: 'beccs_network',        branch: 'capture',   tier: 3, name: 'BECCS Network',           prereqs: ['beccs','dac'],                            researchCost: 12, researchTicks: 8,  deployCost: 8,  deployAdoption: 0.22, desc: 'Continental network of bioenergy plants with capture and storage.' },
  { id: 'gigaton_capture',      branch: 'capture',   tier: 4, name: 'Gigaton Capture',         prereqs: ['dac_network','beccs_network'],            researchCost: 28, researchTicks: 15, deployCost: 15, deployAdoption: 0.30, desc: 'Industrial-scale removal. The atmosphere runs in reverse.' },

  // ═══════════════ POLICY ═══════════════
  { id: 'green_bonds',          branch: 'policy',    tier: 1, name: 'Green Bonds',             prereqs: [],                                         researchCost: 2,  researchTicks: 2,  deployCost: 2,  deployAdoption: 0.15, desc: 'Public debt for public good.' },
  { id: 'carbon_price',         branch: 'policy',    tier: 1, name: 'Carbon Pricing',          prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.18, willRequirement: 50, willCost: 6, desc: 'Price carbon. Externalities become numbers.' },
  { id: 'ffsc',                 branch: 'policy',    tier: 1, name: 'Fossil Fuel Subsidy Cut', prereqs: [],                                         researchCost: 3,  researchTicks: 3,  deployCost: 3,  deployAdoption: 0.20, willRequirement: 55, willCost: 7, desc: 'Stop paying the problem.' },
  { id: 'methane_plus',         branch: 'policy',    tier: 2, name: 'Methane Pledge Plus',     prereqs: ['carbon_price'],                           researchCost: 5,  researchTicks: 4,  deployCost: 4,  deployAdoption: 0.20, willRequirement: 55, willCost: 5, desc: 'Satellite enforcement of methane leakage. Oil and gas go quiet.' },
  { id: 'global_carbon_market', branch: 'policy',    tier: 2, name: 'Global Carbon Market',    prereqs: ['carbon_price'],                           researchCost: 7,  researchTicks: 5,  deployCost: 5,  deployAdoption: 0.25, willRequirement: 60, willCost: 6, desc: 'Linked carbon markets. Arbitrage does the work.' },
  { id: 'climate_finance',      branch: 'policy',    tier: 3, name: 'Climate Finance Pact',    prereqs: ['green_bonds','ffsc'],                     researchCost: 10, researchTicks: 7,  deployCost: 7,  deployAdoption: 0.22, willRequirement: 60, willCost: 5, desc: 'Rich world finances poor world decarbonization.' },
  { id: 'loss_damage',          branch: 'policy',    tier: 4, name: 'Loss & Damage Fund',      prereqs: ['climate_finance','global_carbon_market'], researchCost: 22, researchTicks: 12, deployCost: 11, deployAdoption: 0.24, willRequirement: 65, willCost: 7, desc: 'Compensation for climate-vulnerable nations. Funded, finally.' },
  { id: 'planetary_treaty',     branch: 'policy',    tier: 4, name: 'Planetary Treaty',        prereqs: ['loss_damage','methane_plus'],             researchCost: 30, researchTicks: 16, deployCost: 15, deployAdoption: 0.30, willRequirement: 70, willCost: 8, desc: 'Binding global framework. Teeth, enforcement, tribunals.' },
];
