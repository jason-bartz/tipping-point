// Curated Red List. ~45 real species across mammals, birds, amphibians,
// reptiles, fish, invertebrates, plants. Base statuses reflect real-world
// IUCN listings circa 2024 so the game's opening roster mirrors reality;
// SpeciesSystem mutates status as climate stress accumulates.
//
// Fields:
//   id              — stable key; never shown to the player
//   name            — display name used in headlines
//   scientific      — italicized Latin in detail lines
//   taxon           — mammal | bird | amphibian | reptile | fish |
//                     invertebrate | plant   (drives emoji + filter chip)
//   region          — flavor string for context-rich headlines
//   baseStatus      — starting IUCN code; see STATUS_ORDER
//   tempSensitivity — 0.2 (hardy) → 1.5 (fragile). Scales decline roll.
//                     Corals, ice-dependent mammals, highland-endemics
//                     sit high; generalists sit lower.
//   rediscoverable  — eligible for Lazarus-taxon recovery if declared
//                     EW/EX and the climate trend reverses. Reserved for
//                     species with real historical rediscovery precedent
//                     or deep relictual lineages.
//
// IUCN ladder used by the system (low → high extinction risk):
//   LC → NT → VU → EN → CR → EW → EX

// Ordered worst-to-best so `STATUS_ORDER.indexOf(code)` gives a comparable
// rank. Used by SpeciesSystem to step a species up or down the ladder.
export const STATUS_ORDER = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'];

export const STATUS_LABELS = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in the Wild',
  EX: 'Extinct',
};

// Emoji chip used in headlines + dispatch cards. Kept minimal — one per
// taxon, not per species, so the visual language stays readable.
export const TAXON_EMOJI = {
  mammal: '🐾',
  bird: '🪶',
  amphibian: '🐸',
  reptile: '🦎',
  fish: '🐟',
  invertebrate: '🦋',
  plant: '🌿',
};

export const SPECIES = [
  // ─── Mammals ────────────────────────────────────────────────────────────
  { id: 'snow_leopard',     name: 'Snow leopard',        scientific: 'Panthera uncia',            taxon: 'mammal',  region: 'Central Asian highlands', baseStatus: 'VU', tempSensitivity: 0.9, rediscoverable: true },
  { id: 'vaquita',          name: 'Vaquita',             scientific: 'Phocoena sinus',            taxon: 'mammal',  region: 'Gulf of California',      baseStatus: 'CR', tempSensitivity: 1.3, rediscoverable: false },
  { id: 'polar_bear',       name: 'Polar bear',          scientific: 'Ursus maritimus',           taxon: 'mammal',  region: 'Arctic',                   baseStatus: 'VU', tempSensitivity: 1.4, rediscoverable: false },
  { id: 'amur_leopard',     name: 'Amur leopard',        scientific: 'Panthera pardus orientalis',taxon: 'mammal',  region: 'Russian Far East',         baseStatus: 'CR', tempSensitivity: 1.1, rediscoverable: false },
  { id: 'sumatran_orangutan', name: 'Sumatran orangutan',scientific: 'Pongo abelii',              taxon: 'mammal',  region: 'Sumatra',                  baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'saola',            name: 'Saola',               scientific: 'Pseudoryx nghetinhensis',   taxon: 'mammal',  region: 'Annamite Range',           baseStatus: 'CR', tempSensitivity: 0.9, rediscoverable: true },
  { id: 'javan_rhino',      name: 'Javan rhino',         scientific: 'Rhinoceros sondaicus',      taxon: 'mammal',  region: 'Ujung Kulon, Java',        baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'forest_elephant',  name: 'African forest elephant', scientific: 'Loxodonta cyclotis',    taxon: 'mammal',  region: 'Congo Basin',              baseStatus: 'CR', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'mountain_gorilla', name: 'Mountain gorilla',    scientific: 'Gorilla beringei beringei', taxon: 'mammal',  region: 'Virunga Massif',           baseStatus: 'EN', tempSensitivity: 0.7, rediscoverable: false },
  { id: 'iberian_lynx',     name: 'Iberian lynx',        scientific: 'Lynx pardinus',             taxon: 'mammal',  region: 'Iberian Peninsula',        baseStatus: 'VU', tempSensitivity: 0.7, rediscoverable: false },
  { id: 'red_wolf',         name: 'Red wolf',            scientific: 'Canis rufus',               taxon: 'mammal',  region: 'North Carolina',           baseStatus: 'CR', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'sunda_pangolin',   name: 'Sunda pangolin',      scientific: 'Manis javanica',            taxon: 'mammal',  region: 'Southeast Asia',           baseStatus: 'CR', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'sumatran_tiger',   name: 'Sumatran tiger',      scientific: 'Panthera tigris sumatrae',  taxon: 'mammal',  region: 'Sumatra',                  baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'giant_panda',      name: 'Giant panda',         scientific: 'Ailuropoda melanoleuca',    taxon: 'mammal',  region: 'Sichuan',                  baseStatus: 'VU', tempSensitivity: 0.7, rediscoverable: false },
  { id: 'black_rhino',      name: 'Black rhino',         scientific: 'Diceros bicornis',          taxon: 'mammal',  region: 'Southern Africa',          baseStatus: 'CR', tempSensitivity: 0.7, rediscoverable: false },

  // ─── Birds ──────────────────────────────────────────────────────────────
  { id: 'california_condor',name: 'California condor',   scientific: 'Gymnogyps californianus',   taxon: 'bird',    region: 'American West',            baseStatus: 'CR', tempSensitivity: 0.7, rediscoverable: false },
  { id: 'kakapo',           name: 'Kākāpō',              scientific: 'Strigops habroptilus',      taxon: 'bird',    region: 'New Zealand',              baseStatus: 'CR', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'philippine_eagle', name: 'Philippine eagle',    scientific: 'Pithecophaga jefferyi',     taxon: 'bird',    region: 'Philippines',              baseStatus: 'CR', tempSensitivity: 0.9, rediscoverable: false },
  { id: 'spoonbill_sandpiper', name: 'Spoon-billed sandpiper', scientific: 'Calidris pygmaea',    taxon: 'bird',    region: 'Eurasian Flyway',          baseStatus: 'CR', tempSensitivity: 1.1, rediscoverable: false },
  { id: 'hyacinth_macaw',   name: 'Hyacinth macaw',      scientific: 'Anodorhynchus hyacinthinus',taxon: 'bird',    region: 'Pantanal',                 baseStatus: 'VU', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'regent_honeyeater',name: 'Regent honeyeater',   scientific: 'Anthochaera phrygia',       taxon: 'bird',    region: 'Eastern Australia',        baseStatus: 'CR', tempSensitivity: 1.1, rediscoverable: false },
  { id: 'spix_macaw',       name: "Spix's macaw",        scientific: 'Cyanopsitta spixii',        taxon: 'bird',    region: 'Brazilian caatinga',       baseStatus: 'EW', tempSensitivity: 0.9, rediscoverable: true },
  { id: 'whooping_crane',   name: 'Whooping crane',      scientific: 'Grus americana',            taxon: 'bird',    region: 'North America',            baseStatus: 'EN', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'bermuda_petrel',   name: 'Bermuda petrel',      scientific: 'Pterodroma cahow',          taxon: 'bird',    region: 'Bermuda',                  baseStatus: 'EN', tempSensitivity: 0.9, rediscoverable: true },
  { id: 'night_parrot',     name: 'Night parrot',        scientific: 'Pezoporus occidentalis',    taxon: 'bird',    region: 'Outback Australia',        baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: true },

  // ─── Amphibians ─────────────────────────────────────────────────────────
  { id: 'axolotl',          name: 'Axolotl',             scientific: 'Ambystoma mexicanum',       taxon: 'amphibian', region: 'Xochimilco',             baseStatus: 'CR', tempSensitivity: 1.2, rediscoverable: false },
  { id: 'golden_toad',      name: 'Golden toad',         scientific: 'Incilius periglenes',       taxon: 'amphibian', region: 'Monteverde',             baseStatus: 'EX', tempSensitivity: 1.0, rediscoverable: true },
  { id: 'panamanian_frog',  name: 'Panamanian golden frog', scientific: 'Atelopus zeteki',        taxon: 'amphibian', region: 'Panama',                 baseStatus: 'CR', tempSensitivity: 1.3, rediscoverable: true },
  { id: 'olm',              name: 'Olm',                 scientific: 'Proteus anguinus',          taxon: 'amphibian', region: 'Dinaric Karst',          baseStatus: 'VU', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'chinese_salamander', name: 'Chinese giant salamander', scientific: 'Andrias davidianus', taxon: 'amphibian', region: 'Yangtze basin',          baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: false },

  // ─── Reptiles ───────────────────────────────────────────────────────────
  { id: 'hawksbill_turtle', name: 'Hawksbill turtle',    scientific: 'Eretmochelys imbricata',    taxon: 'reptile', region: 'Tropical seas',            baseStatus: 'CR', tempSensitivity: 1.1, rediscoverable: false },
  { id: 'gharial',          name: 'Gharial',             scientific: 'Gavialis gangeticus',       taxon: 'reptile', region: 'Indian subcontinent',      baseStatus: 'CR', tempSensitivity: 0.9, rediscoverable: false },
  { id: 'komodo_dragon',    name: 'Komodo dragon',       scientific: 'Varanus komodoensis',       taxon: 'reptile', region: 'Lesser Sunda Islands',     baseStatus: 'EN', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'leatherback',      name: 'Leatherback turtle',  scientific: 'Dermochelys coriacea',      taxon: 'reptile', region: 'Global oceans',            baseStatus: 'VU', tempSensitivity: 1.0, rediscoverable: false },

  // ─── Fish ───────────────────────────────────────────────────────────────
  { id: 'great_hammerhead', name: 'Great hammerhead',    scientific: 'Sphyrna mokarran',          taxon: 'fish',    region: 'Tropical oceans',          baseStatus: 'CR', tempSensitivity: 0.9, rediscoverable: false },
  { id: 'european_eel',     name: 'European eel',        scientific: 'Anguilla anguilla',         taxon: 'fish',    region: 'North Atlantic',           baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'coelacanth',       name: 'Coelacanth',          scientific: 'Latimeria chalumnae',       taxon: 'fish',    region: 'Western Indian Ocean',     baseStatus: 'CR', tempSensitivity: 0.8, rediscoverable: true },
  { id: 'devils_hole_pupfish', name: "Devils Hole pupfish", scientific: 'Cyprinodon diabolis',    taxon: 'fish',    region: 'Nevada',                   baseStatus: 'CR', tempSensitivity: 1.3, rediscoverable: false },

  // ─── Invertebrates ──────────────────────────────────────────────────────
  { id: 'monarch_butterfly',name: 'Monarch butterfly',   scientific: 'Danaus plexippus',          taxon: 'invertebrate', region: 'North America',        baseStatus: 'VU', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'staghorn_coral',   name: 'Staghorn coral',      scientific: 'Acropora cervicornis',      taxon: 'invertebrate', region: 'Caribbean reefs',      baseStatus: 'CR', tempSensitivity: 1.4, rediscoverable: false },
  { id: 'rusty_bumblebee',  name: 'Rusty patched bumblebee', scientific: 'Bombus affinis',        taxon: 'invertebrate', region: 'Upper Midwest',        baseStatus: 'CR', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'giant_clam',       name: 'Giant clam',          scientific: 'Tridacna gigas',            taxon: 'invertebrate', region: 'Indo-Pacific reefs',   baseStatus: 'VU', tempSensitivity: 1.1, rediscoverable: false },

  // ─── Plants ─────────────────────────────────────────────────────────────
  { id: 'wollemi_pine',     name: 'Wollemi pine',        scientific: 'Wollemia nobilis',          taxon: 'plant',   region: 'Blue Mountains',           baseStatus: 'CR', tempSensitivity: 0.9, rediscoverable: true },
  { id: 'grandidier_baobab',name: "Grandidier's baobab", scientific: 'Adansonia grandidieri',     taxon: 'plant',   region: 'Madagascar',               baseStatus: 'EN', tempSensitivity: 0.9, rediscoverable: false },
  { id: 'ghost_orchid',     name: 'Ghost orchid',        scientific: 'Dendrophylax lindenii',     taxon: 'plant',   region: 'Florida Everglades',       baseStatus: 'EN', tempSensitivity: 1.0, rediscoverable: false },
  { id: 'dragon_tree',      name: 'Dragon tree',         scientific: 'Dracaena draco',            taxon: 'plant',   region: 'Macaronesia',              baseStatus: 'VU', tempSensitivity: 0.8, rediscoverable: false },
  { id: 'saguaro',          name: 'Saguaro',             scientific: 'Carnegiea gigantea',        taxon: 'plant',   region: 'Sonoran Desert',           baseStatus: 'LC', tempSensitivity: 1.0, rediscoverable: false },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

// Convenience check used by SpeciesSystem decline logic.
export function statusRank(code) {
  const i = STATUS_ORDER.indexOf(code);
  return i < 0 ? 0 : i;
}

export function worseStatus(code) {
  const i = statusRank(code);
  return STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, i + 1)];
}

export function betterStatus(code) {
  const i = statusRank(code);
  return STATUS_ORDER[Math.max(0, i - 1)];
}
