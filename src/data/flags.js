// Pixel-art flag assets for the 10 starter countries. Files live in
// public/flags/{rect,wave}/{id}.png — `rect` is the static 16×12 flag used
// in the sidebar header, `wave` is a 16×15 waving variant used on the larger
// country-select cards. NDC (Nordic Bloc) is a composite of Denmark, Norway,
// Sweden and Finland — 2×2 rect, 4-across wave.
//
// Returns null for any country without an asset so callers can skip the <img>.

const HAVE = new Set(['NDC', 'DEU', 'GBR', 'JPN', 'BRA', 'USA', 'CHN', 'IND', 'SAU', 'RUS']);

const BASE = import.meta.env?.BASE_URL ?? '/';

export function rectFlag(id) {
  return HAVE.has(id) ? `${BASE}flags/rect/${id}.png` : null;
}

export function waveFlag(id) {
  return HAVE.has(id) ? `${BASE}flags/wave/${id}.png` : null;
}

export function isBlocFlag(id) {
  return id === 'NDC';
}
