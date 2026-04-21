// Marine life. A handful of 32×32 pixel-art creatures that briefly surface
// in the ocean — rising up, looking around, drifting a little, then ducking
// back under. Visible at game start, the pod thins to zero as temperature
// climbs toward the +4 °C loss threshold.
//
// Implementation is deliberately lightweight:
//   1. One canvas overlay sized to the WorldMap stage. No per-creature DOM.
//   2. Water mask sampled from /world-map.png at load time (~172×96 cells,
//      dilated by 1 cell) keeps surfacing always on open water, never coast.
//   3. Each creature runs its own state machine: hidden → rising → peek →
//      sinking → hidden, at an independent random schedule so pops are
//      staggered, not synchronized.
//   4. Sprites draw at an exact 2:1 downscale (32 → 16) so nearest-neighbor
//      rendering is uniform — no stretched-looking pixels.
//   5. `prefers-reduced-motion` skips the feature entirely.

import { EVT } from '../core/EventBus.js';
import { BALANCE } from '../config/balance.js';

const ATLAS_URL = '/tilesets/PixelCreatures.png';
const MAP_URL   = '/world-map.png';

const SPRITE_PX = 32;            // source tile in the atlas
const SPRITE_COLS = 5;

// Pool size at peak ocean health. Only a fraction are visible at once because
// each creature spends most of its time hidden underwater.
const MAX_CREATURES = 10;

// Render the sprite at 16 canvas px — an exact 2:1 downscale of the 32×32
// source. Integer ratio + nearest-neighbor = clean pixel art, no stretch.
const SPRITE_DRAW = 16;

// Land mask resolution. Low enough to build in a handful of ms, high enough
// that the 1-cell dilation keeps creatures cleanly off the visible coast.
const MASK_W = 172;
const MASK_H = 96;
const LAND_DILATE = 1;

// Which atlas cells make usable swimmers — skip the two seahorses (they face
// vertically, look wrong flipped) and the crab (doesn't swim). Row-major
// index = row * 5 + col.
const SWIMMERS = [
  0, 1, 2, 3, 4,        // row 0 — whales / top predators
  5, 6, 7, 8, 9,        // row 1 — shark, whale, squid, etc.
  10, 11, 12,           // row 2 — sunfish, shark, clownfish
  15, 16, 18, 19,       // row 3 — eel, fish, puffer, octopus
];

// State machine timings (seconds).
const HIDDEN_MIN = 5;    const HIDDEN_MAX = 13;   // underwater waiting
const RISE_DUR   = 0.45;                          // fade-in + emerge
const PEEK_MIN   = 2.0;  const PEEK_MAX  = 4.0;   // head above water
const SINK_DUR   = 0.45;                          // fade-out + duck under
const FLIP_MIN   = 0.7;  const FLIP_MAX  = 1.6;   // look-around cadence

function healthFromTemp(tempC) {
  const lo = BALANCE.startingTempAnomalyC + 0.3;
  const hi = BALANCE.lossTempC - 0.5;
  return Math.max(0, Math.min(1, 1 - (tempC - lo) / (hi - lo)));
}

export class MarineLifeSystem {
  constructor(state, bus, worldMap) {
    this.s = state;
    this.b = bus;
    this.worldMap = worldMap;

    this._destroyed = false;
    this.creatures = [];
    this.mask = null;
    this.atlas = null;
    this.targetCount = 0;

    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'marine-life-layer';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:1;image-rendering:pixelated;';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    worldMap.stage.appendChild(canvas);

    this._unsub = bus.on(EVT.TICK, () => this._onTick());
    this._onResize = () => this._syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObs = new ResizeObserver(this._onResize);
      this._resizeObs.observe(worldMap.stage);
    } else {
      window.addEventListener('resize', this._onResize);
    }

    this._boot();
  }

  async _boot() {
    if (this.reducedMotion) return;  // honor user preference — skip entirely
    try {
      const [atlas, mask] = await Promise.all([
        this._loadImage(ATLAS_URL),
        this._buildMask(MAP_URL),
      ]);
      if (this._destroyed) return;
      this.atlas = atlas;
      this.mask = mask;
      this._syncSize();
      this._retarget();
      this._seedInitial();
      this._lastT = performance.now();
      this._rafId = requestAnimationFrame((t) => this._frame(t));
    } catch (err) {
      console.warn('[marine-life] init failed', err);
    }
  }

  _loadImage(url) {
    return new Promise((ok, err) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => err(new Error('load failed: ' + url));
      img.src = url;
    });
  }

  async _buildMask(url) {
    const img = await this._loadImage(url);
    const c = document.createElement('canvas');
    c.width = MASK_W;
    c.height = MASK_H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0, MASK_W, MASK_H);
    const data = cx.getImageData(0, 0, MASK_W, MASK_H).data;

    const water = new Uint8Array(MASK_W * MASK_H);
    for (let i = 0; i < water.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      water[i] = (b > r + 12 && b > g - 6 && b > 80) ? 1 : 0;
    }

    const safe = new Uint8Array(MASK_W * MASK_H);
    for (let y = 0; y < MASK_H; y++) {
      for (let x = 0; x < MASK_W; x++) {
        let ok = water[y * MASK_W + x];
        if (ok) {
          outer:
          for (let dy = -LAND_DILATE; dy <= LAND_DILATE; dy++) {
            for (let dx = -LAND_DILATE; dx <= LAND_DILATE; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || nx >= MASK_W || ny < 0 || ny >= MASK_H) { ok = 0; break outer; }
              if (!water[ny * MASK_W + nx]) { ok = 0; break outer; }
            }
          }
        }
        safe[y * MASK_W + x] = ok;
      }
    }
    return safe;
  }

  _isWaterUV(u, v) {
    if (!this.mask) return false;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    const x = Math.min(MASK_W - 1, Math.max(0, Math.floor(u * MASK_W)));
    const y = Math.min(MASK_H - 1, Math.max(0, Math.floor(v * MASK_H)));
    return !!this.mask[y * MASK_W + x];
  }

  _syncSize() {
    const stage = this.worldMap.stage;
    if (!stage || !this.canvas) return;
    const w = Math.max(1, Math.round(stage.clientWidth));
    const h = Math.max(1, Math.round(stage.clientHeight));
    // Cap internal resolution for GPU economy. Pixelated CSS scaling handles
    // the rest cleanly — sprite pixels stay as integer-block duplicates.
    const CAP = 1100;
    const ratio = Math.min(1, CAP / Math.max(w, h));
    this.canvas.width  = Math.max(64, Math.round(w * ratio));
    this.canvas.height = Math.max(64, Math.round(h * ratio));
    this.ctx.imageSmoothingEnabled = false;
  }

  _retarget() {
    const h = healthFromTemp(this.s.world.tempAnomalyC);
    this.targetCount = Math.round(MAX_CREATURES * h);
  }

  _onTick() {
    if (this._destroyed || !this.mask) return;
    this._retarget();

    const active = this.creatures.filter(c => !c.retired);
    if (active.length > this.targetCount) {
      // Retire one creature; it'll finish its surface cycle (if any) then
      // disappear cleanly rather than popping out of existence.
      active[0].retired = true;
    }
    while (this.creatures.filter(c => !c.retired).length < this.targetCount) {
      if (!this._spawnOne(false)) break;
    }
  }

  // Seed the initial pool with staggered states so pop-ups don't sync up.
  _seedInitial() {
    for (let i = 0; i < this.targetCount; i++) this._spawnOne(true);
  }

  _spawnOne(stagger) {
    const rng = this.s.meta.rng;
    let u = 0, v = 0, placed = false;
    for (let tries = 0; tries < 40; tries++) {
      u = rng.random();
      v = rng.random();
      if (this._isWaterUV(u, v)) { placed = true; break; }
    }
    if (!placed) return false;

    const c = {
      u, v,
      sprite: SWIMMERS[Math.floor(rng.random() * SWIMMERS.length)],
      facing: rng.random() < 0.5 ? -1 : 1,
      opacity: 0,
      state: 'hidden',
      stateTime: 0,
      stateDuration: HIDDEN_MIN + rng.random() * (HIDDEN_MAX - HIDDEN_MIN),
      // Drift during peek — tiny u/v/sec. Set when entering peek.
      du: 0,
      dv: 0,
      flipTimer: 0,
      retired: false,
    };

    // Spread existing pool across the cycle so they don't all pop together.
    if (stagger) {
      c.stateTime = rng.random() * c.stateDuration;
    }
    this.creatures.push(c);
    return true;
  }

  _enterState(c, state) {
    const rng = this.s.meta.rng;
    c.state = state;
    c.stateTime = 0;
    if (state === 'hidden') {
      c.opacity = 0;
      c.stateDuration = HIDDEN_MIN + rng.random() * (HIDDEN_MAX - HIDDEN_MIN);
    } else if (state === 'rising') {
      c.opacity = 0;
      c.stateDuration = RISE_DUR;
    } else if (state === 'peek') {
      c.opacity = 1;
      c.stateDuration = PEEK_MIN + rng.random() * (PEEK_MAX - PEEK_MIN);
      // Tiny drift (~1% of the map over a full peek).
      const speed = 0.002 + rng.random() * 0.003;
      c.du = c.facing * speed;
      c.dv = (rng.random() - 0.5) * 0.001;
      c.flipTimer = FLIP_MIN + rng.random() * (FLIP_MAX - FLIP_MIN);
    } else if (state === 'sinking') {
      c.stateDuration = SINK_DUR;
    }
  }

  _reposition(c) {
    // Pick a fresh water cell for the next surfacing.
    const rng = this.s.meta.rng;
    for (let tries = 0; tries < 30; tries++) {
      const u = rng.random();
      const v = rng.random();
      if (this._isWaterUV(u, v)) { c.u = u; c.v = v; return true; }
    }
    return false;
  }

  _frame(t) {
    if (this._destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (t - this._lastT) / 1000));
    this._lastT = t;
    this._update(dt);
    this._draw();
    this._rafId = requestAnimationFrame((t2) => this._frame(t2));
  }

  _update(dt) {
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      c.stateTime += dt;

      if (c.state === 'hidden') {
        if (c.retired) { this.creatures.splice(i, 1); continue; }
        if (c.stateTime >= c.stateDuration) {
          this._reposition(c);
          c.facing = Math.random() < 0.5 ? -1 : 1;
          this._enterState(c, 'rising');
        }
        continue;
      }

      if (c.state === 'rising') {
        const t = Math.min(1, c.stateTime / c.stateDuration);
        c.opacity = t;
        if (t >= 1) this._enterState(c, 'peek');
        continue;
      }

      if (c.state === 'peek') {
        // Tiny drift. If the step would cross into land, just flip facing
        // (the creature "turned to look the other way").
        const nu = c.u + c.du * dt;
        const nv = c.v + c.dv * dt;
        if (this._isWaterUV(nu, c.v)) c.u = nu; else { c.du = -c.du; c.facing = -c.facing; }
        if (this._isWaterUV(c.u, nv)) c.v = nv; else c.dv = -c.dv;

        c.flipTimer -= dt;
        if (c.flipTimer <= 0) {
          // Look around — flip facing, slow the drift for a beat.
          c.facing = -c.facing;
          c.du = -c.du * 0.6;
          const rng = this.s.meta.rng;
          c.flipTimer = FLIP_MIN + rng.random() * (FLIP_MAX - FLIP_MIN);
        }

        const retiredEarly = c.retired;
        if (retiredEarly || c.stateTime >= c.stateDuration) {
          this._enterState(c, 'sinking');
        }
        continue;
      }

      if (c.state === 'sinking') {
        const t = Math.min(1, c.stateTime / c.stateDuration);
        c.opacity = 1 - t;
        if (t >= 1) this._enterState(c, 'hidden');
        continue;
      }
    }
  }

  _draw() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    if (!this.atlas) return;

    const size = SPRITE_DRAW;
    const half = size / 2;

    for (const c of this.creatures) {
      if (c.opacity <= 0.01) continue;
      const row = Math.floor(c.sprite / SPRITE_COLS);
      const col = c.sprite % SPRITE_COLS;
      const sx = col * SPRITE_PX;
      const sy = row * SPRITE_PX;
      const cx = Math.round(c.u * cw);
      const cy = Math.round(c.v * ch);

      ctx.save();
      ctx.globalAlpha = c.opacity;
      if (c.facing < 0) {
        ctx.translate(cx + half, cy - half);
        ctx.scale(-1, 1);
        ctx.drawImage(this.atlas, sx, sy, SPRITE_PX, SPRITE_PX, 0, 0, size, size);
      } else {
        ctx.drawImage(this.atlas, sx, sy, SPRITE_PX, SPRITE_PX, cx - half, cy - half, size, size);
      }
      ctx.restore();
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    try { this._unsub?.(); } catch { /* ignore */ }
    this._unsub = null;
    if (this._resizeObs) this._resizeObs.disconnect();
    else if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.creatures = [];
    this.mask = null;
  }
}

export const __test = { healthFromTemp, MASK_W, MASK_H, SWIMMERS };
