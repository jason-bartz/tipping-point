// Government model — pure functions for the 2-slot politician system.
// Each country has an incumbent and a shadow (runner-up). Tags are
// 'green' | 'mixed' | 'denier'; they drive continuous modifiers (via
// AdoptionSystem) and one-shot effects on succession (via ForestrySystem).
//
// All functions are pure. Name generation and tag rolls take an Rng so the
// sequence is deterministic and replays work.

import { BALANCE } from '../config/balance.js';

// Per-country name pools. Keyed by country id so the generated incumbent /
// shadow read as plausibly local ("Li Wei" in China, "Emma Tremblay" in
// Canada) instead of the old place-neutral mix. Pools are small on purpose —
// four firsts × four lasts = sixteen combinations per country, enough that a
// succession rarely repeats a name without drowning the codebase in data.
// Regional blocs draw from a blended pool that fits member states.
const NAMES_BY_COUNTRY = {
  CHN: { firsts: ['Wei', 'Min', 'Fang', 'Jun'],                       lasts: ['Li', 'Wang', 'Zhang', 'Chen'] },
  USA: { firsts: ['Sarah', 'James', 'Maria', 'David'],                lasts: ['Johnson', 'Williams', 'Garcia', 'Brooks'] },
  IND: { firsts: ['Priya', 'Arjun', 'Kavya', 'Rohit'],                lasts: ['Sharma', 'Patel', 'Kumar', 'Iyer'] },
  RUS: { firsts: ['Dmitri', 'Olga', 'Sergei', 'Elena'],               lasts: ['Volkov', 'Ivanova', 'Petrov', 'Smirnova'] },
  JPN: { firsts: ['Hiroshi', 'Yuki', 'Kenji', 'Akiko'],               lasts: ['Tanaka', 'Sato', 'Suzuki', 'Mori'] },
  DEU: { firsts: ['Hans', 'Klara', 'Stefan', 'Greta'],                lasts: ['Müller', 'Schmidt', 'Wagner', 'Weber'] },
  IRN: { firsts: ['Reza', 'Maryam', 'Ali', 'Shirin'],                 lasts: ['Hosseini', 'Ahmadi', 'Tehrani', 'Karimi'] },
  KOR: { firsts: ['Min-jun', 'Ji-woo', 'Seo-yeon', 'Joon-ho'],        lasts: ['Kim', 'Lee', 'Park', 'Choi'] },
  SAU: { firsts: ['Khalid', 'Nora', 'Fahad', 'Layla'],                lasts: ['Al-Rashid', 'Al-Saud', 'Al-Harbi', 'Al-Qahtani'] },
  IDN: { firsts: ['Budi', 'Siti', 'Agus', 'Dewi'],                    lasts: ['Wijaya', 'Pratama', 'Susanto', 'Hartono'] },
  CAN: { firsts: ['Michael', 'Emma', 'Jean', 'Chantal'],              lasts: ['Tremblay', 'MacDonald', 'Singh', 'Leroux'] },
  BRA: { firsts: ['Lucas', 'Ana', 'Miguel', 'Beatriz'],               lasts: ['Silva', 'Santos', 'Oliveira', 'Costa'] },
  MEX: { firsts: ['Carlos', 'Sofía', 'Diego', 'Valentina'],           lasts: ['Hernández', 'García', 'Rodríguez', 'López'] },
  AUS: { firsts: ['Jack', 'Chloe', 'Oliver', 'Isla'],                 lasts: ['Smith', 'Jones', 'Taylor', 'Campbell'] },
  GBR: { firsts: ['Oliver', 'Emily', 'Harry', 'Charlotte'],           lasts: ['Smith', 'Jones', 'Taylor', 'Williams'] },
  TUR: { firsts: ['Mehmet', 'Ayşe', 'Emre', 'Zeynep'],                lasts: ['Yılmaz', 'Kaya', 'Demir', 'Şahin'] },
  ZAF: { firsts: ['Thabo', 'Nomsa', 'Sipho', 'Lerato'],               lasts: ['Nkosi', 'Dlamini', 'Ndlovu', 'Mbeki'] },
  ITA: { firsts: ['Marco', 'Giulia', 'Luca', 'Chiara'],               lasts: ['Rossi', 'Bianchi', 'Ferrari', 'Esposito'] },
  FRA: { firsts: ['Pierre', 'Camille', 'Julien', 'Élise'],            lasts: ['Dubois', 'Lefebvre', 'Moreau', 'Laurent'] },
  POL: { firsts: ['Piotr', 'Anna', 'Jakub', 'Katarzyna'],             lasts: ['Nowak', 'Kowalski', 'Wiśniewski', 'Kamiński'] },
  THA: { firsts: ['Somchai', 'Niran', 'Apinya', 'Kamon'],             lasts: ['Chaiyasut', 'Phumjai', 'Boonmee', 'Suwan'] },
  VNM: { firsts: ['Minh', 'Hương', 'Tuấn', 'Linh'],                   lasts: ['Nguyễn', 'Trần', 'Lê', 'Phạm'] },
  EGY: { firsts: ['Ahmed', 'Fatma', 'Omar', 'Nour'],                  lasts: ['Hassan', 'Ibrahim', 'Mahmoud', 'Farouk'] },
  ESP: { firsts: ['Javier', 'Lucía', 'Álvaro', 'Marta'],              lasts: ['García', 'Martínez', 'Fernández', 'López'] },
  ARG: { firsts: ['Juan', 'María', 'Tomás', 'Florencia'],             lasts: ['González', 'Fernández', 'López', 'Martínez'] },
  NDC: { firsts: ['Erik', 'Astrid', 'Magnus', 'Saga'],                lasts: ['Lindqvist', 'Johansson', 'Hansen', 'Svensson'] },
  BEN: { firsts: ['Pieter', 'Emma', 'Lars', 'Saskia'],                lasts: ['van der Berg', 'De Vries', 'Janssens', 'Dupont'] },
  GLF: { firsts: ['Saif', 'Aisha', 'Hamad', 'Hessa'],                 lasts: ['Al-Nahyan', 'Al-Thani', 'Al-Khalifa', 'Al-Maktoum'] },
  SEA: { firsts: ['Aung', 'Mei Lin', 'Rizal', 'Mayuri'],              lasts: ['Tan', 'Lim', 'Santos', 'Wong'] },
  EAF: { firsts: ['Amani', 'Kofi', 'Zainab', 'Juma'],                 lasts: ['Otieno', 'Kagame', 'Abate', 'Mwangi'] },
  EUE: { firsts: ['Viktor', 'Elena', 'Mihai', 'Katya'],               lasts: ['Popescu', 'Kovač', 'Nagy', 'Ionescu'] },
};

// Fallback pool if a country id isn't in the map (e.g. a new roster entry
// added without a matching pool). Same mix as the pre-localized version.
const DEFAULT_NAMES = {
  firsts: ['Ana', 'Marc', 'Yuki', 'Priya', 'Lars', 'Zara', 'Diego', 'Mei', 'Omar', 'Irene', 'Kaito', 'Noa'],
  lasts:  ['Okafor', 'Lindqvist', 'Reyes', 'Tanaka', 'Navarro', 'Patel', 'Kowalski', 'Abbas', 'Costa', 'Nyström', 'Adeyemi', 'Mori'],
};

// Build a politician with a name and climate-stance tag. climateScore is
// derived from the tag with a small rng jitter so two 'green' politicians
// don't feel identical — the UI can show the score as a 0–100 bar. Pass a
// `countryId` to draw from that country's local name pool; omit for the
// neutral fallback.
export function makePolitician(tag, rng, countryId) {
  const pool = NAMES_BY_COUNTRY[countryId] ?? DEFAULT_NAMES;
  const first = rng.pick(pool.firsts);
  const last  = rng.pick(pool.lasts);
  const base  = tag === 'green' ? 78 : tag === 'denier' ? 22 : 50;
  const jitter = Math.floor((rng.random() - 0.5) * 16); // ±8
  return {
    name: `${first} ${last}`,
    tag,
    climateScore: Math.max(0, Math.min(100, base + jitter)),
  };
}

// Pick a tag using the per-infra weights from BALANCE. Used for the INITIAL
// shadow at game start, and for generating a fresh shadow after a succession.
// Returns 'green' | 'mixed' | 'denier'.
export function rollShadowTag(infra, rng) {
  const weights = BALANCE.government.initialShadowTagWeights[infra]
               ?? BALANCE.government.initialShadowTagWeights.mixed;
  const entries = Object.entries(weights); // [[tag, weight], ...]
  let total = 0;
  for (const [, w] of entries) total += w;
  if (total <= 0) return 'mixed';
  let r = rng.random() * total;
  for (const [tag, w] of entries) {
    r -= w;
    if (r <= 0) return tag;
  }
  return entries[entries.length - 1][0];
}

// Initial incumbent tag mirrors the country's starting politicalWill: high
// will (≥70) biases green, low will (≤35) biases denier, middle is mixed.
// Keeps the opening state legible — a petrostate starts with a denier in
// office more often than not, matching its politicalWill floor.
export function rollInitialIncumbentTag(politicalWill, rng) {
  if (politicalWill >= 70) {
    return rng.random() < 0.65 ? 'green' : 'mixed';
  }
  if (politicalWill <= 35) {
    return rng.random() < 0.60 ? 'denier' : 'mixed';
  }
  // 35 < will < 70: roughly balanced, mixed-heavy.
  const r = rng.random();
  if (r < 0.30) return 'green';
  if (r < 0.75) return 'mixed';
  return 'denier';
}

// Build a full government slice for one country at game start.
export function createGovernment(country, rng) {
  const incumbentTag = rollInitialIncumbentTag(country.politicalWill ?? 50, rng);
  const shadowTag    = rollShadowTag(country.infra ?? 'mixed', rng);
  return {
    incumbent: makePolitician(incumbentTag, rng, country.id),
    shadow:    makePolitician(shadowTag, rng, country.id),
    carbonLiability: 0,
    // Count of times this seat has changed hands. Useful for UI and
    // achievements — "government fell three times in Brazil" reads well.
    falls: 0,
  };
}

// Look up the continuous multipliers for the current incumbent. Callers
// (AdoptionSystem) compose these with their own coefficients. Defaults to
// neutral 'mixed' values so a country missing a government object reads as
// if nothing special is happening, rather than crashing.
export function incumbentMultipliers(country) {
  const tag = country?.government?.incumbent?.tag ?? 'mixed';
  return BALANCE.government.tagMultipliers[tag]
      ?? BALANCE.government.tagMultipliers.mixed;
}

// Execute a succession: shadow becomes incumbent, a fresh shadow is rolled.
// Returns a summary of the swing that the caller (ForestrySystem) applies to
// the country's will/adoption, plus a dispatch-ready payload.
export function succeed(country, rng) {
  const gov = country.government;
  if (!gov) return null;
  const outgoing = gov.incumbent;
  const incoming = gov.shadow;

  gov.incumbent = incoming;
  gov.shadow    = makePolitician(rollShadowTag(country.infra ?? 'mixed', rng), rng, country.id);
  gov.carbonLiability = 0;
  gov.falls = (gov.falls ?? 0) + 1;

  const swing = BALANCE.government.fallEffects[incoming.tag]
             ?? BALANCE.government.fallEffects.mixed;
  return {
    outgoing, incoming,
    swing,
    countryId: country.id,
    countryName: country.name,
  };
}
