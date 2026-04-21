// Seeded PRNG. Deterministic playthroughs, reproducible bugs, replay.
// Every random draw in the game goes through the Rng instance on state.meta.rng.
//
// Algorithm: mulberry32. 32-bit, 2^32 period, fast, zero dependencies, and —
// importantly — its state is a single integer so it serializes in one number.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tiny wrapper that carries its seed along so we can save/restore without
// capturing a closure. Everywhere that used Math.random in the old code now
// calls rng.random() / rng.pick(...) / rng.shuffled(...).
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  // Reseed after deserializing a save. We don't restore stream position —
  // the save captures the *world*; a fresh stream from the same seed is close
  // enough for a save game. Perfect determinism would require streaming the
  // counter too; noted as future work.
  reseed(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  random() { return this._next(); }

  pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(this._next() * arr.length)];
  }

  shuffled(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Weighted pick. `weightFn` returns a positive number per item; items with
  // weight ≤ 0 are excluded.
  weightedPick(items, weightFn = (x) => x.weight ?? 1) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return null;
    let r = this._next() * total;
    for (const it of items) {
      r -= Math.max(0, weightFn(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
}

// Root-level seed generator so each new game gets a fresh stream without
// requiring the caller to supply one. Uses crypto if available, falls back
// to Date.now so tests can still run under jsdom.
export function makeSeed() {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0];
    }
  } catch { /* fallthrough */ }
  return (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
}
