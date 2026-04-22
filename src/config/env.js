// Environment + debug-flag resolution.
//
// Three layers, in priority order (last wins):
//   1. Vite build flags — `import.meta.env.DEV / PROD / MODE`.
//   2. URL query string — `?debug=1&speed=8&cheats=1`. Handy for bug repros.
//   3. localStorage — `tipping-point.debug.v1` (a JSON string). Persists across
//      reloads for the same browser; set via `setDebugFlag()` below or by
//      hand in DevTools.
//
// Read once at module load; cached on `ENV`. Call `refreshEnv()` if you
// change the URL at runtime (rare).
//
// Contract: every debug flag has a sensible `false`/`null` default so
// production is unaffected. A missing query-string param falls back to the
// stored value, then to the default.

const STORAGE_KEY = 'tipping-point.debug.v1';

/** @returns {URLSearchParams} */
function readQuery() {
  if (typeof window === 'undefined') return new URLSearchParams('');
  return new URLSearchParams(window.location.search);
}

/** @returns {Record<string, unknown>} */
function readStored() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function bool(queryVal, storedVal, fallback = false) {
  if (queryVal != null) return queryVal === '1' || queryVal === 'true';
  if (typeof storedVal === 'boolean') return storedVal;
  return fallback;
}

function num(queryVal, storedVal, fallback = null) {
  if (queryVal != null) {
    const n = Number(queryVal);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof storedVal === 'number') return storedVal;
  return fallback;
}

function compute() {
  const q = readQuery();
  const stored = readStored();
  const isDev = typeof import.meta !== 'undefined'
    && import.meta.env != null
    && !!import.meta.env.DEV;

  return {
    isDev,
    isProd: !isDev,

    // Shows the FPS / tick-time overlay.
    debug: bool(q.get('debug'), stored.debug, false),

    // Multiplies the game speed. Useful for end-game testing.
    speedOverride: num(q.get('speed'), stored.speedOverride, null),

    // Infinite credits + no will gates. Never ships in prod unless explicitly
    // enabled; the gate below refuses to honor this flag outside dev.
    cheats: bool(q.get('cheats'), stored.cheats, false) && isDev,

    // Skips the intro tutorial. Handy for repeated testing.
    skipTutorial: bool(q.get('skipTutorial'), stored.skipTutorial, false),

    // Forces a specific starter country on next new-game.
    forceCountry: q.get('country') ?? stored.forceCountry ?? null,
  };
}

export let ENV = compute();

/** Re-read env (after URL change or localStorage write). */
export function refreshEnv() {
  ENV = compute();
  return ENV;
}

/** Persist one flag to localStorage for future sessions. */
export function setDebugFlag(key, value) {
  try {
    const prev = readStored();
    prev[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
  } catch {
    /* ignore */
  }
  refreshEnv();
}

/** Remove all stored debug flags. */
export function clearDebugFlags() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  refreshEnv();
}
