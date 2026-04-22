// Clouds. A few pixel-art cumulus sprites drift west→east across the map at
// any one time. Palette cross-fades through five variants on a ~4-minute
// real-time loop — night → sunrise → sunny → day → sunset → night again —
// so a given session sees the sky shift color without needing any game-time
// hook.
//
// Lightweight by design:
//   1. A single canvas overlay attached to the WorldMap stage.
//   2. One rAF loop updates 3–5 sprites and redraws.
//   3. Each frame cross-blends two atlas variants (current & next palette)
//      with matching alphas so the transition is smooth.
//   4. `prefers-reduced-motion` skips the feature.

const VARIANT_URLS = [
  '/clouds/Clouds_Night.png',
  '/clouds/Clouds_Sunrise.png',
  '/clouds/Clouds_Sunny.png',
  '/clouds/Clouds.png',
  '/clouds/Clouds_Sunshine.png',
];

// Sprite rectangles on the 256×128 atlas. Derived from a flood-fill pass over
// the alpha channel — kept to clouds that read as a single shape (big clumps
// are skipped to avoid looking like a blob of sheet). Identical layout across
// all variant sheets.
const CLOUD_RECTS = [
  { sx: 166, sy:   0, sw: 87, sh: 36 },  // wide mid-sized
  { sx: 113, sy:   3, sw: 49, sh: 22 },  // small tuft
  { sx: 161, sy:  40, sw: 95, sh: 38 },  // large
  { sx: 107, sy:  43, sw: 55, sh: 22 },  // medium
  { sx: 107, sy:  92, sw: 55, sh: 22 },  // medium
  { sx: 160, sy:  92, sw: 96, sh: 36 },  // large
  { sx:  27, sy: 112, sw: 39, sh: 16 },  // small wisp
];

const MAX_CLOUDS = 4;                       // user wants few — "not a lot"
const CYCLE_MS   = 4 * 60 * 1000;           // full palette loop, 4 min
const CLOUD_OPACITY = 0.62;                 // soft enough that markers read

// Drift speed in u-units/sec. At 0.018 u/s a cloud crosses the sky in ~55 s.
const SPEED_MIN = 0.014;
const SPEED_MAX = 0.022;

// Keep clouds in the upper portion of the sky; skip the Antarctic strip.
const V_MIN = 0.04;
const V_MAX = 0.78;

function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function pickInt(n) { return Math.floor(Math.random() * n); }

export class CloudLayer {
  constructor(worldMap) {
    this.worldMap = worldMap;
    this._destroyed = false;
    this.variants = new Array(VARIANT_URLS.length).fill(null);
    this.clouds = [];

    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'cloud-layer';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:2;image-rendering:pixelated;';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    worldMap.stage.appendChild(canvas);

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
    if (this.reducedMotion) return;
    try {
      this.variants = await Promise.all(VARIANT_URLS.map((u) => this._loadImage(u)));
      if (this._destroyed) return;
      this._syncSize();
      this._seed();
      this._lastT = performance.now();
      this._rafId = requestAnimationFrame((t) => this._frame(t));
    } catch (err) {
      console.warn('[clouds] init failed', err);
    }
  }

  _loadImage(url) {
    return new Promise((ok, err) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => err(new Error(`load failed: ${  url}`));
      img.src = url;
    });
  }

  _syncSize() {
    const stage = this.worldMap.stage;
    if (!stage || !this.canvas) return;
    const w = Math.max(1, Math.round(stage.clientWidth));
    const h = Math.max(1, Math.round(stage.clientHeight));
    const CAP = 1100;
    const ratio = Math.min(1, CAP / Math.max(w, h));
    this.canvas.width  = Math.max(64, Math.round(w * ratio));
    this.canvas.height = Math.max(64, Math.round(h * ratio));
    this.ctx.imageSmoothingEnabled = false;
  }

  _seed() {
    for (let i = 0; i < MAX_CLOUDS; i++) {
      this.clouds.push(this._newCloud({ spread: true }));
    }
  }

  _newCloud({ spread }) {
    const rect = CLOUD_RECTS[pickInt(CLOUD_RECTS.length)];
    return {
      rect,
      u: spread ? Math.random() : -0.08 - Math.random() * 0.1,
      v: rand(V_MIN, V_MAX),
      speed: rand(SPEED_MIN, SPEED_MAX),
      // Slight scale variation so repeats don't read as identical twins.
      scale: rand(0.8, 1.15),
    };
  }

  // Real-time palette index + blend for cross-fade between adjacent variants.
  _timeOfDay(now) {
    const phase = ((now % CYCLE_MS) / CYCLE_MS) * VARIANT_URLS.length;
    const idx = Math.floor(phase) % VARIANT_URLS.length;
    const blend = phase - Math.floor(phase);
    return { curIdx: idx, nextIdx: (idx + 1) % VARIANT_URLS.length, blend };
  }

  _frame(t) {
    if (this._destroyed) return;
    const dt = Math.min(0.1, Math.max(0, (t - this._lastT) / 1000));
    this._lastT = t;
    this._update(dt);
    this._draw(t);
    this._rafId = requestAnimationFrame((t2) => this._frame(t2));
  }

  _update(dt) {
    for (const c of this.clouds) {
      c.u += c.speed * dt;
      // Once the whole sprite has left the east edge, respawn west.
      if (c.u > 1.12) {
        const fresh = this._newCloud({ spread: false });
        Object.assign(c, fresh);
      }
    }
  }

  _draw(now) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    const { curIdx, nextIdx, blend } = this._timeOfDay(now);
    const cur = this.variants[curIdx];
    const nxt = this.variants[nextIdx];
    if (!cur || !nxt) return;

    const aCur = CLOUD_OPACITY * (1 - blend);
    const aNxt = CLOUD_OPACITY * blend;

    for (const c of this.clouds) {
      const { rect } = c;
      const dw = Math.round(rect.sw * c.scale);
      const dh = Math.round(rect.sh * c.scale);
      const dx = Math.round(c.u * cw) - Math.round(dw / 2);
      const dy = Math.round(c.v * ch) - Math.round(dh / 2);

      if (aCur > 0.01) {
        ctx.globalAlpha = aCur;
        ctx.drawImage(cur, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh);
      }
      if (aNxt > 0.01) {
        ctx.globalAlpha = aNxt;
        ctx.drawImage(nxt, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh);
      }
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    this._destroyed = true;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    if (this._resizeObs) this._resizeObs.disconnect();
    else if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.clouds = [];
    this.variants = [];
  }
}
