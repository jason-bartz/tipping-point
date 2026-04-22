// Pixel-art flag assets. Files live in public/flags/{rect,wave}/{id}.png.
// `rect` is the static 16×12 flag used in the sidebar header; `wave` is the
// 16×13 variant used on the larger country-select cards. Every country on
// the map has a flag.
//
// Composite bloc flags (sized larger so the sub-flags stay legible):
//   NDC (Nordic Bloc)      — DK + NO + SE + FI;         32×24 rect, 64×13 wave
//   BEN (Benelux)          — BE + NL + LU;              32×24 rect, 48×13 wave
//   GLF (Gulf States)      — AE + KW + QA + BH + OM;    48×24 rect, 80×13 wave
//   SEA (Southeast Asia)   — PH + MY + SG + KH;         32×24 rect, 64×13 wave
//   EAF (East Africa)      — KE + TZ + ET + UG;         32×24 rect, 64×13 wave
//   EUE (Eastern Europe)   — RO + UA + MD;              32×24 rect, 48×13 wave

const HAVE = new Set([
  // Single-country flags
  'USA', 'CAN', 'MEX', 'BRA', 'ARG',
  'GBR', 'DEU', 'FRA', 'ITA', 'ESP', 'POL',
  'RUS', 'CHN', 'JPN', 'KOR', 'IND', 'IDN', 'VNM', 'THA',
  'IRN', 'SAU', 'TUR', 'EGY',
  'ZAF', 'AUS',
  // Composite bloc flags
  'NDC', 'BEN', 'GLF', 'SEA', 'EAF', 'EUE',
]);
const BLOC_FLAGS = new Set(['NDC', 'BEN', 'GLF', 'SEA', 'EAF', 'EUE']);

const BASE = import.meta.env?.BASE_URL ?? '/';

export function rectFlag(id) {
  return HAVE.has(id) ? `${BASE}flags/rect/${id}.png` : null;
}

export function waveFlag(id) {
  return HAVE.has(id) ? `${BASE}flags/wave/${id}.png` : null;
}

export function isBlocFlag(id) {
  return BLOC_FLAGS.has(id);
}
