// Human-readable summary of an effects[] array — used to show the player
// what a decision actually did, right after they pick. Keeps identical ops
// terse (e.g. "+4% Land in 4 ag countries") so the output reads like a
// receipt instead of a schema dump.
//
// Given the shape EventSystem.resolve() resolves, each summary line:
//   - leads with the axis (CO₂, Credits, Land, Will, …)
//   - uses the sign the player cares about (−0.6 ppm CO₂ is "good", shown as-is)
//   - names the scope (globally, {country}, {n} petrostates, …)
//
// If a choice uses the imperative `apply` escape hatch (e.g. geo_offer:accept
// sets tempAnomalyC non-additively), authors can attach a static
// `summaryOverride` string on the choice; EventSystem passes that through.

const BRANCH_LABEL = {
  energy:    'Energy',
  transport: 'Transport',
  industry:  'Industry',
  land:      'Land',
  capture:   'Capture',
  policy:    'Policy',
};

// Plural noun phrases. `petrostates` stands alone; the others read better
// as adjective + "countries" so the player doesn't end up with "4 agriculturals".
const INFRA_PLURAL = {
  petrostate:   'petrostates',
  service:      'service countries',
  industrial:   'industrial countries',
  mixed:        'mixed-economy countries',
  agricultural: 'agricultural countries',
};

function signNum(n, decimals = 0) {
  const s = (n >= 0 ? '+' : '') + n.toFixed(decimals);
  // "-0" → "0"
  return s.replace(/^-0(\.0+)?$/, '0');
}
function signPct(n) {
  // n is a fraction 0.04 → "+4%"
  const pct = Math.round(n * 100 * 10) / 10;   // round to 0.1%
  return `${signNum(pct, pct % 1 === 0 ? 0 : 1)  }%`;
}

// Describe a `where` clause ("6 petrostates", "service/industrial countries", etc.).
function whereLabel(where, countries) {
  if (!where) return 'worldwide';
  if (Array.isArray(where.infra)) {
    // Arrays are rendered as an adjective list followed by "countries" once,
    // e.g. "service/industrial countries" instead of "petrostates/services".
    return `${where.infra.join('/')} countries`;
  }
  if (typeof where.infra === 'string') {
    // Prefix with the matching-country count so phrasing reads right
    // ("6 petrostates" not "all petrostates"). `countries` is optional.
    const count = countries
      ? Object.values(countries).filter(c => c.infra === where.infra).length
      : null;
    const noun = INFRA_PLURAL[where.infra] ?? `${where.infra} countries`;
    return count ? `${count} ${noun}` : noun;
  }
  if (where.minEmissions) return `top-emitter countries`;
  return 'matching countries';
}

// One effect → one line. Returns null when the op isn't player-facing.
function describeOne(effect, ctx, countries) {
  const { op } = effect;
  switch (op) {
    case 'addWorld': {
      const v = effect.value ?? 0;
      if (effect.field === 'climatePoints') return `${signNum(v, 0)} Credits`;
      if (effect.field === 'co2ppm')        return `${signNum(v, 1)} ppm CO₂`;
      if (effect.field === 'tempAnomalyC')  return `${signNum(v, 2)}°C`;
      if (effect.field === 'societalStress') return `${signNum(v, 0)} Stress`;
      return null;
    }
    case 'addAllCountries': {
      const v = effect.value ?? 0;
      if (effect.field === 'politicalWill') return `${signNum(v, 0)} Will worldwide`;
      if (typeof effect.field === 'string' && effect.field.startsWith('adoption.')) {
        const b = effect.field.slice(9);
        return `${signPct(v)} ${BRANCH_LABEL[b] ?? b} worldwide`;
      }
      return null;
    }
    case 'addCountries': {
      const v = effect.value ?? 0;
      const scope = whereLabel(effect.where, countries);
      if (effect.field === 'politicalWill') return `${signNum(v, 0)} Will in ${scope}`;
      if (typeof effect.field === 'string' && effect.field.startsWith('adoption.')) {
        const b = effect.field.slice(9);
        return `${signPct(v)} ${BRANCH_LABEL[b] ?? b} in ${scope}`;
      }
      return null;
    }
    case 'addTarget': {
      const v = effect.value ?? 0;
      const name = ctx?.target?.name ?? 'target country';
      if (effect.field === 'politicalWill') return `${signNum(v, 0)} Will in ${name}`;
      if (typeof effect.field === 'string' && effect.field.startsWith('adoption.')) {
        const b = effect.field.slice(9);
        return `${signPct(v)} ${BRANCH_LABEL[b] ?? b} in ${name}`;
      }
      return null;
    }
    case 'addTargetAllBranches': {
      const name = ctx?.target?.name ?? 'target country';
      return `${signPct(effect.value ?? 0)} every branch in ${name}`;
    }
    case 'addTargetRandomBranch': {
      const name = ctx?.target?.name ?? 'target country';
      return `${signPct(effect.value ?? 0)} one branch in ${name}`;
    }
    case 'addRandomCountries': {
      const v = effect.value ?? 0;
      const n = effect.count ?? 1;
      const scope = effect.where ? whereLabel(effect.where, countries) : 'countries';
      if (effect.field === 'politicalWill') return `${signNum(v, 0)} Will in ${n} random ${scope}`;
      if (typeof effect.field === 'string' && effect.field.startsWith('adoption.')) {
        const b = effect.field.slice(9);
        return `${signPct(v)} ${BRANCH_LABEL[b] ?? b} in ${n} random ${scope}`;
      }
      return null;
    }
    case 'addRandomBranches': {
      const n = effect.count ?? 1;
      return `${signPct(effect.value ?? 0)} a random branch in ${n} countries`;
    }
    default:
      return null;
  }
}

// Effects summary. Returns a single string; each line joined with " · ".
// `ctx` carries the event's `target` when present. `countries` is optional —
// when provided (e.g. full game state), scope counts read more naturally.
export function summarizeEffects(effects = [], ctx = {}, countries = null) {
  if (!effects?.length) return '';
  const lines = [];
  for (const e of effects) {
    const line = describeOne(e, ctx, countries);
    if (line) lines.push(line);
  }
  return lines.join(' · ');
}
