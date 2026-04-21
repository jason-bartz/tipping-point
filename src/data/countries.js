// Country roster. 31 entries covering top emitters and regional blocs.
// `isoN3` matches Natural Earth numeric IDs for the world-atlas TopoJSON; many
// entries are blocs (NDC, BEN, GLF, SEA, EAF, EUE) that span multiple polygons.
// `neighbors` is an adjacency list. Edges are auto-symmetrized at state
// creation so the spread system always runs bidirectionally — declare an edge
// once and you're done.
//
// ─── Map position fields ───────────────────────────────────────────────────
// `mapX`, `mapY` are fractional pixel coordinates (0..1) on the native
// 1376×768 world-map.png. They are calibrated by eye against the hand-drawn
// pixel-art coastline, not computed from lat/lon — the artwork isn't strict
// equirectangular, so real lat/lon through any single projection misses by
// tens of pixels. The fractions mean dots stay pinned to the same point on
// the art at every window size. `lat`/`lon` are retained for gameplay
// semantics (distance, climate zones, labels) but are NOT used for drawing.
//
// ─── Population fields ─────────────────────────────────────────────────────
// `populationM`        starting population in millions (UN/World Bank 2024)
// `baseGrowthPerYear`  intrinsic demographic growth rate before climate impact
// `climateVulnerability` 0.8 (resilient) .. 3.0 (extreme heat/arid exposure).
//   Drives the climate-mortality curve in src/model/Population.js — higher
//   means excess warming kills faster. Roughly aligned with IPCC AR6
//   exposure maps: equatorial dense populations = 2.5–3.0, temperate
//   developed economies = 1.0–1.5, high-latitude = 0.8–1.0.

export const COUNTRIES = [
  { id: 'CHN', name: 'China',           isoN3: ['156'], lat: 35.8,  lon:  104.2, mapX: 0.785, mapY: 0.443, baseEmissionsGtCO2: 11.9, infra: 'industrial',  politicalWill: 55, populationM: 1412, baseGrowthPerYear: -0.001, climateVulnerability: 2.0, neighbors: ['RUS','IND','KOR','SEA'] },
  { id: 'USA', name: 'United States',   isoN3: ['840'], lat: 39.8,  lon:  -98.6, mapX: 0.229, mapY: 0.345, baseEmissionsGtCO2:  4.9, infra: 'service',     politicalWill: 48, populationM:  340, baseGrowthPerYear:  0.004, climateVulnerability: 2.0, neighbors: ['CAN','MEX'] },
  { id: 'IND', name: 'India',           isoN3: ['356'], lat: 20.6,  lon:   78.9, mapX: 0.708, mapY: 0.514, baseEmissionsGtCO2:  3.1, infra: 'mixed',       politicalWill: 50, populationM: 1430, baseGrowthPerYear:  0.008, climateVulnerability: 3.0, neighbors: ['CHN','SEA'] },
  { id: 'RUS', name: 'Russia',          isoN3: ['643'], lat: 61.5,  lon:  105.3, mapX: 0.727, mapY: 0.247, baseEmissionsGtCO2:  1.9, infra: 'petrostate',  politicalWill: 30, populationM:  143, baseGrowthPerYear: -0.003, climateVulnerability: 1.0, neighbors: ['CHN','NDC','EUE'] },
  { id: 'JPN', name: 'Japan',           isoN3: ['392'], lat: 36.2,  lon:  138.2, mapX: 0.872, mapY: 0.404, baseEmissionsGtCO2:  1.1, infra: 'industrial',  politicalWill: 58, populationM:  124, baseGrowthPerYear: -0.006, climateVulnerability: 1.5, neighbors: ['KOR','CHN','SEA'] },
  { id: 'DEU', name: 'Germany',         isoN3: ['276'], lat: 51.1,  lon:   10.4, mapX: 0.534, mapY: 0.286, baseEmissionsGtCO2:  0.7, infra: 'industrial',  politicalWill: 70, populationM:   84, baseGrowthPerYear:  0.001, climateVulnerability: 1.0, neighbors: ['FRA','POL','NDC','BEN'] },
  { id: 'IRN', name: 'Iran',            isoN3: ['364'], lat: 32.4,  lon:   53.7, mapX: 0.654, mapY: 0.430, baseEmissionsGtCO2:  0.7, infra: 'petrostate',  politicalWill: 25, populationM:   89, baseGrowthPerYear:  0.009, climateVulnerability: 2.8, neighbors: ['GLF','TUR'] },
  { id: 'KOR', name: 'South Korea',     isoN3: ['410'], lat: 35.9,  lon:  127.8, mapX: 0.870, mapY: 0.339, baseEmissionsGtCO2:  0.6, infra: 'industrial',  politicalWill: 55, populationM:   52, baseGrowthPerYear: -0.002, climateVulnerability: 1.5, neighbors: ['JPN','CHN'] },
  { id: 'SAU', name: 'Saudi Arabia',    isoN3: ['682'], lat: 23.9,  lon:   45.1, mapX: 0.620, mapY: 0.518, baseEmissionsGtCO2:  0.7, infra: 'petrostate',  politicalWill: 30, populationM:   37, baseGrowthPerYear:  0.015, climateVulnerability: 3.0, neighbors: ['GLF','EGY'] },
  { id: 'IDN', name: 'Indonesia',       isoN3: ['360'], lat: -0.8,  lon:  113.9, mapX: 0.866, mapY: 0.604, baseEmissionsGtCO2:  0.7, infra: 'agricultural',politicalWill: 50, populationM:  279, baseGrowthPerYear:  0.009, climateVulnerability: 2.8, neighbors: ['SEA','AUS'] },
  { id: 'CAN', name: 'Canada',          isoN3: ['124'], lat: 56.1,  lon: -106.3, mapX: 0.218, mapY: 0.260, baseEmissionsGtCO2:  0.6, infra: 'petrostate',  politicalWill: 62, populationM:   40, baseGrowthPerYear:  0.010, climateVulnerability: 0.9, neighbors: ['USA'] },
  { id: 'BRA', name: 'Brazil',          isoN3: ['076'], lat: -14.2, lon:  -51.9, mapX: 0.356, mapY: 0.638, baseEmissionsGtCO2:  0.5, infra: 'agricultural',politicalWill: 55, populationM:  217, baseGrowthPerYear:  0.005, climateVulnerability: 2.5, neighbors: ['ARG'] },
  { id: 'MEX', name: 'Mexico',          isoN3: ['484'], lat: 23.6,  lon: -102.5, mapX: 0.211, mapY: 0.449, baseEmissionsGtCO2:  0.5, infra: 'mixed',       politicalWill: 55, populationM:  129, baseGrowthPerYear:  0.007, climateVulnerability: 2.3, neighbors: ['USA'] },
  { id: 'AUS', name: 'Australia',       isoN3: ['036'], lat: -25.3, lon:  133.8, mapX: 0.872, mapY: 0.703, baseEmissionsGtCO2:  0.4, infra: 'petrostate',  politicalWill: 60, populationM:   26, baseGrowthPerYear:  0.012, climateVulnerability: 2.0, neighbors: ['IDN','SEA'] },
  { id: 'GBR', name: 'United Kingdom',  isoN3: ['826'], lat: 55.4,  lon:   -3.4, mapX: 0.483, mapY: 0.280, baseEmissionsGtCO2:  0.35,infra: 'service',     politicalWill: 68, populationM:   68, baseGrowthPerYear:  0.005, climateVulnerability: 1.0, neighbors: ['FRA','NDC'] },
  { id: 'TUR', name: 'Turkey',          isoN3: ['792'], lat: 38.9,  lon:   35.2, mapX: 0.605, mapY: 0.368, baseEmissionsGtCO2:  0.45,infra: 'mixed',       politicalWill: 45, populationM:   85, baseGrowthPerYear:  0.008, climateVulnerability: 2.2, neighbors: ['EUE','IRN','GLF','EGY'] },
  { id: 'ZAF', name: 'South Africa',    isoN3: ['710'], lat: -30.6, lon:   22.9, mapX: 0.552, mapY: 0.742, baseEmissionsGtCO2:  0.42,infra: 'industrial',  politicalWill: 50, populationM:   60, baseGrowthPerYear:  0.011, climateVulnerability: 2.3, neighbors: ['EAF'] },
  { id: 'ITA', name: 'Italy',           isoN3: ['380'], lat: 41.9,  lon:   12.6, mapX: 0.537, mapY: 0.376, baseEmissionsGtCO2:  0.33,infra: 'mixed',       politicalWill: 60, populationM:   59, baseGrowthPerYear: -0.002, climateVulnerability: 1.5, neighbors: ['FRA','EUE','BEN'] },
  { id: 'FRA', name: 'France',          isoN3: ['250'], lat: 46.6,  lon:    2.2, mapX: 0.505, mapY: 0.312, baseEmissionsGtCO2:  0.32,infra: 'service',     politicalWill: 68, populationM:   67, baseGrowthPerYear:  0.002, climateVulnerability: 1.2, neighbors: ['DEU','GBR','ITA','ESP','BEN'] },
  { id: 'POL', name: 'Poland',          isoN3: ['616'], lat: 51.9,  lon:   19.1, mapX: 0.570, mapY: 0.280, baseEmissionsGtCO2:  0.30,infra: 'industrial',  politicalWill: 50, populationM:   38, baseGrowthPerYear: -0.001, climateVulnerability: 1.1, neighbors: ['DEU','EUE','NDC'] },
  { id: 'THA', name: 'Thailand',        isoN3: ['764'], lat: 15.9,  lon:  100.9, mapX: 0.803, mapY: 0.475, baseEmissionsGtCO2:  0.29,infra: 'mixed',       politicalWill: 50, populationM:   71, baseGrowthPerYear:  0.002, climateVulnerability: 2.7, neighbors: ['SEA','CHN'] },
  { id: 'VNM', name: 'Vietnam',         isoN3: ['704'], lat: 14.1,  lon:  108.3, mapX: 0.828, mapY: 0.471, baseEmissionsGtCO2:  0.33,infra: 'industrial',  politicalWill: 55, populationM:  100, baseGrowthPerYear:  0.008, climateVulnerability: 2.7, neighbors: ['SEA','CHN'] },
  { id: 'EGY', name: 'Egypt',           isoN3: ['818'], lat: 26.8,  lon:   30.8, mapX: 0.581, mapY: 0.462, baseEmissionsGtCO2:  0.26,infra: 'mixed',       politicalWill: 48, populationM:  113, baseGrowthPerYear:  0.017, climateVulnerability: 3.0, neighbors: ['TUR','SAU','EAF'] },
  { id: 'ESP', name: 'Spain',           isoN3: ['724'], lat: 40.5,  lon:   -3.7, mapX: 0.480, mapY: 0.384, baseEmissionsGtCO2:  0.25,infra: 'service',     politicalWill: 65, populationM:   48, baseGrowthPerYear:  0.002, climateVulnerability: 1.6, neighbors: ['FRA','ITA'] },
  { id: 'ARG', name: 'Argentina',       isoN3: ['032'], lat: -38.4, lon:  -63.6, mapX: 0.309, mapY: 0.794, baseEmissionsGtCO2:  0.20,infra: 'agricultural',politicalWill: 55, populationM:   46, baseGrowthPerYear:  0.008, climateVulnerability: 1.8, neighbors: ['BRA'] },
  // ── Regional blocs ─────────────────────────────────────────────────────
  { id: 'NDC', name: 'Nordic Bloc',     isoN3: ['752','578','246','208'],         lat: 63,  lon: 16,  mapX: 0.534, mapY: 0.208, baseEmissionsGtCO2: 0.15, infra: 'service',     politicalWill: 85, populationM:  28, baseGrowthPerYear:  0.003, climateVulnerability: 0.8, neighbors: ['DEU','GBR','RUS','EUE'] },
  { id: 'BEN', name: 'Benelux',         isoN3: ['056','528','442'],               lat: 51.0,lon:  4.5, mapX: 0.516, mapY: 0.280, baseEmissionsGtCO2: 0.18, infra: 'service',     politicalWill: 75, populationM:  31, baseGrowthPerYear:  0.004, climateVulnerability: 1.1, neighbors: ['DEU','FRA','GBR'] },
  { id: 'GLF', name: 'Gulf States',     isoN3: ['784','414','634','048','512'],   lat: 24.4,lon: 54.6, mapX: 0.647, mapY: 0.495, baseEmissionsGtCO2: 0.55, infra: 'petrostate',  politicalWill: 35, populationM:  24, baseGrowthPerYear:  0.020, climateVulnerability: 3.0, neighbors: ['SAU','IRN','EGY'] },
  { id: 'SEA', name: 'Southeast Asia',  isoN3: ['608','458','702','116'],         lat: 3,   lon:111,   mapX: 0.839, mapY: 0.549, baseEmissionsGtCO2: 0.30, infra: 'mixed',       politicalWill: 50, populationM: 157, baseGrowthPerYear:  0.010, climateVulnerability: 2.8, neighbors: ['IDN','THA','VNM','CHN','IND'] },
  { id: 'EAF', name: 'East Africa',     isoN3: ['404','834','231','800'],         lat: -1,  lon: 37,   mapX: 0.589, mapY: 0.638, baseEmissionsGtCO2: 0.15, infra: 'agricultural',politicalWill: 55, populationM: 295, baseGrowthPerYear:  0.025, climateVulnerability: 2.8, neighbors: ['ZAF','EGY'] },
  { id: 'EUE', name: 'Eastern Europe',  isoN3: ['642','804','498'],               lat: 46,  lon: 25,   mapX: 0.600, mapY: 0.319, baseEmissionsGtCO2: 0.20, infra: 'industrial',  politicalWill: 55, populationM:  59, baseGrowthPerYear: -0.005, climateVulnerability: 1.2, neighbors: ['POL','ITA','TUR','RUS','NDC'] },
];

// Known country IDs — used by the state builder to drop phantom neighbor
// references (from stale saves or copy-paste typos) with a console warning
// instead of letting the spread system silently ignore them.
export const COUNTRY_IDS = new Set(COUNTRIES.map(c => c.id));
