// Wildfire visual FX. Listens for EVENT_FIRED with a wildfire-class event id
// and renders animated pixel-art flame + smoke sprites on the world map for
// a few seconds. Two sprite sheets bundled in public/tilesets:
//   fire-red.png   — 256×48, 8 frames of 32×48 (floored flame, red/orange)
//   smoke-dark.png — 512×128, 8 frames of 64×128 (dark plume)
//
// Cosmetic only: no state is mutated, no bus events are emitted. Safe to
// skip under prefers-reduced-motion (the gameplay already logs the fire
// event to dispatches + toast — the FX is flavor).

import { EVT } from '../core/EventBus.js';
import { mulberry32 } from '../core/Random.js';

const FIRE_SRC  = '/tilesets/fire-red.png';
const SMOKE_SRC = '/tilesets/smoke-dark.png';

const FIRE_FRAME_W = 32; const FIRE_FRAME_H = 48; const FIRE_FRAMES = 8;
const SMOKE_FRAME_W = 64; const SMOKE_FRAME_H = 128; const SMOKE_FRAMES = 8;

// Which events trigger the FX, and the "scale" of the burn — how many fires
// we spawn and across how many countries. Global events hit multiple
// countries; targeted ones just the one.
const FIRE_EVENTS = {
  wildfire_local: { scope: 'target', firesMin: 4, firesMax: 6 },
  wildfire:       { scope: 'global', countries: 5, firesMin: 2, firesMax: 3, forestBias: true },
  wildfire_smog:  { scope: 'global', countries: 3, firesMin: 3, firesMax: 5, smokeHeavy: true, forestBias: true },
};

// Per-fire lifetime (seconds). A short window so the screen never fills with
// stale embers; feels punchy, not theatrical.
const FIRE_LIFE_MIN = 4.2;
const FIRE_LIFE_MAX = 6.0;

// Render scale. 32×48 source at 2× = 64×96 on screen — readable from the
// usual zoom level without looking like a different game.
const FIRE_DRAW_W = 48; const FIRE_DRAW_H = 72;
const SMOKE_DRAW_W = 56; const SMOKE_DRAW_H = 112;

// Jitter radius in stage pixels for clustering sprites around a country's
// pinned map position. Small enough that we stay on land for every country
// (coastal/island ones included).
const JITTER_PX = 18;

export class WildfireFx {
  constructor(state, bus, worldMap) {
    this.s = state;
    this.b = bus;
    this.worldMap = worldMap;

    this._destroyed = false;
    this._sprites = new Set(); // live DOM nodes for eager teardown

    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Private rng — separate from state.meta.rng so cosmetic rolls don't
    // shift gameplay rng position. Deterministic per save seed.
    this._rng = mulberry32(((state?.meta?.seed ?? 0) ^ 0xF12EB12E) >>> 0);

    // Host div on the map stage. One container per session so we can clear
    // everything in destroy() without walking the stage's other children.
    const layer = document.createElement('div');
    layer.className = 'wildfire-layer';
    layer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:3;' +
      'image-rendering:pixelated;image-rendering:crisp-edges;';
    worldMap.stage.appendChild(layer);
    this.layer = layer;

    this._unsub = bus.on(EVT.EVENT_FIRED, (payload) => this._onEvent(payload));
  }

  destroy() {
    this._destroyed = true;
    this._unsub?.(); this._unsub = null;
    for (const el of this._sprites) el.remove();
    this._sprites.clear();
    this.layer?.remove();
    this.layer = null;
  }

  _onEvent(payload) {
    if (this._destroyed || this.reducedMotion) return;
    const id = payload?.event?.id;
    const cfg = FIRE_EVENTS[id];
    if (!cfg) return;

    const countries = this._pickCountries(payload, cfg);
    for (const c of countries) {
      const n = this._randInt(cfg.firesMin, cfg.firesMax);
      for (let i = 0; i < n; i++) {
        // Brief stagger so the fires don't all pop in on the same frame —
        // gives the burn a rolling cadence.
        const delay = this._rng() * 700;
        setTimeout(() => this._spawnFire(c, !!cfg.smokeHeavy), delay);
      }
    }
  }

  _pickCountries(payload, cfg) {
    const s = this.s;
    if (cfg.scope === 'target') {
      const t = payload.event?._ctx?.target;
      return t ? [t] : [];
    }
    // Global. Prefer countries with healthy forests (there's more fuel);
    // fall back to a random selection if nobody has forests left.
    const all = Object.values(s.countries);
    const pool = cfg.forestBias
      ? all.filter(c => (c.forestHealth ?? 0) > 0.15)
      : all;
    const source = pool.length ? pool : all;
    const want = Math.min(cfg.countries ?? 1, source.length);
    return this._sampleWeighted(source, want, (c) => {
      const forest = cfg.forestBias ? (c.forestHealth ?? 0) + 0.1 : 1;
      // Bigger emitters get slightly more fires — readable signal for where
      // the crisis is hitting. Kept modest so small countries still get hits.
      return forest * (1 + Math.min(2, (c.baseEmissionsGtCO2 ?? 0) * 0.3));
    });
  }

  _sampleWeighted(arr, n, weightFn) {
    const out = [];
    const pool = arr.slice();
    const weights = pool.map(weightFn);
    for (let i = 0; i < n && pool.length; i++) {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) { out.push(pool.splice(0, 1)[0]); weights.splice(0, 1); continue; }
      let r = this._rng() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= Math.max(0, weights[idx]);
        if (r <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      out.push(pool.splice(idx, 1)[0]);
      weights.splice(idx, 1);
    }
    return out;
  }

  _spawnFire(country, heavySmoke) {
    if (this._destroyed) return;
    if (!this.layer || !this.worldMap?.projectCountry) return;

    const [cx, cy] = this.worldMap.projectCountry(country);
    const jx = (this._rng() * 2 - 1) * JITTER_PX;
    const jy = (this._rng() * 2 - 1) * JITTER_PX;
    // Anchor the flame's base at (cx+jx, cy+jy). Since "floored" sprites
    // stand on their bottom edge, offset up by half the draw height.
    const fx = cx + jx - FIRE_DRAW_W / 2;
    const fy = cy + jy - FIRE_DRAW_H + 4;

    const life = FIRE_LIFE_MIN + this._rng() * (FIRE_LIFE_MAX - FIRE_LIFE_MIN);
    const sizeJitter = 0.85 + this._rng() * 0.35; // 0.85×–1.20×

    // Flame sprite.
    const fire = document.createElement('div');
    fire.className = 'wildfire-sprite wildfire-flame';
    fire.style.cssText =
      `left:${fx.toFixed(1)}px;top:${fy.toFixed(1)}px;` +
      `width:${FIRE_DRAW_W}px;height:${FIRE_DRAW_H}px;` +
      `--frames:${FIRE_FRAMES};--frame-w:${FIRE_FRAME_W}px;--frame-h:${FIRE_FRAME_H}px;` +
      `--sheet-w:${FIRE_FRAME_W * FIRE_FRAMES}px;` +
      `background-image:url(${FIRE_SRC});` +
      `animation:wildfire-flame 0.55s steps(${FIRE_FRAMES}) infinite,` +
      ` wildfire-fade ${life.toFixed(2)}s linear forwards;` +
      `transform:scale(${sizeJitter.toFixed(2)});transform-origin:50% 100%;`;
    this.layer.appendChild(fire);
    this._track(fire, life);

    // Smoke plume — rises a bit and drifts with a slow opacity fade. Heavier
    // smoke for wildfire_smog (two stacked plumes per fire).
    this._spawnSmoke(cx + jx, fy, life, sizeJitter);
    if (heavySmoke) this._spawnSmoke(cx + jx + (this._rng() - 0.5) * 10, fy - 6, life, sizeJitter * 0.9);
  }

  _spawnSmoke(x, anchorY, life, sizeJitter) {
    const sw = SMOKE_DRAW_W * sizeJitter;
    const sh = SMOKE_DRAW_H * sizeJitter;
    const sx = x - sw / 2;
    const sy = anchorY - sh * 0.35; // smoke starts mid-flame, rises from there

    const smoke = document.createElement('div');
    smoke.className = 'wildfire-sprite wildfire-smoke';
    smoke.style.cssText =
      `left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px;` +
      `width:${sw.toFixed(1)}px;height:${sh.toFixed(1)}px;` +
      `--frames:${SMOKE_FRAMES};--frame-w:${SMOKE_FRAME_W}px;--frame-h:${SMOKE_FRAME_H}px;` +
      `--sheet-w:${SMOKE_FRAME_W * SMOKE_FRAMES}px;` +
      `background-image:url(${SMOKE_SRC});` +
      `animation:wildfire-smoke 0.8s steps(${SMOKE_FRAMES}) infinite,` +
      ` wildfire-smoke-rise ${life.toFixed(2)}s ease-out forwards;`;
    this.layer.appendChild(smoke);
    this._track(smoke, life);
  }

  _track(el, lifeSec) {
    this._sprites.add(el);
    setTimeout(() => {
      el.remove();
      this._sprites.delete(el);
    }, lifeSec * 1000 + 100);
  }

  _randInt(a, b) {
    return a + Math.floor(this._rng() * (b - a + 1));
  }
}
