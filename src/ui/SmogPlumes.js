// Per-country smog plumes. Anchored to a country's mapX/mapY, these dark
// pixel-art puffs appear over the top-N polluting countries as the world
// warms past +1.4 °C. They're the *local* counterpart to the global haze in
// MapAmbience — haze says "how hot is it," plumes say "who's still polluting."
//
// Scale / progression:
//   globalBadness = clamp((tempAnomalyC − 1.4) / (3.5 − 1.4))  // 0 → 1
//   plumeCount    = round(globalBadness × 8)                   // 0 → 8 sources
//   ranked by     = baseEmissionsGtCO2 × (1 − avgAdoption),
//                   filtered out if netZero or avgAdoption ≥ 0.75
//   big polluters (CHN, USA, IND, RUS, BRA) get a second plume at a city
//   offset so the smoke reads as multi-city, not one puff per continent.
//
// Implementation notes:
//   1. One canvas overlay attached to WorldMap stage (z-index between sky
//      clouds and country markers).
//   2. Reuses the /clouds/Clouds.png atlas — darkened once at load via a
//      multiply-style fill so we don't tint per frame.
//   3. Plumes hover with a slow wobble; no drift, since the global haze is
//      already the "moving" piece. Fade in on activation, fade out on clear.
//   4. `prefers-reduced-motion` skips the rAF loop.

import { EVT } from '../core/EventBus.js';

const ATLAS_URL = '/clouds/Clouds.png';

// Same rectangles as CloudLayer — identical atlas.
const CLOUD_RECTS = [
  { sx: 166, sy:   0, sw: 87, sh: 36 },
  { sx: 161, sy:  40, sw: 95, sh: 38 },
  { sx: 160, sy:  92, sw: 96, sh: 36 },
  { sx: 107, sy:  43, sw: 55, sh: 22 },
  { sx: 107, sy:  92, sw: 55, sh: 22 },
];

// Overlay color used to darken the cloud atlas into smog. Grimy brown reads
// as coal/diesel pollution, not stormcloud.
const SMOG_TINT  = 'rgba(58, 42, 28, 0.82)';

// Countries big enough to warrant a second plume at a distinct "city" offset.
// dx / dy are fractional offsets on the 0..1 stage — small numbers, the kind
// that put one plume near a coast and the other near another.
const MULTI_PLUMES = {
  USA: [{ dx: -0.025, dy:  0.010 }, { dx:  0.020, dy: -0.005 }],
  CHN: [{ dx: -0.018, dy:  0.005 }, { dx:  0.020, dy: -0.008 }],
  RUS: [{ dx: -0.040, dy:  0.008 }, { dx:  0.035, dy: -0.008 }],
  IND: [{ dx: -0.012, dy: -0.010 }, { dx:  0.012, dy:  0.008 }],
  BRA: [{ dx: -0.012, dy: -0.012 }, { dx:  0.012, dy:  0.008 }],
};

// Temperature gate — below this, plumes never appear. Above 3.5 °C they
// saturate. 1.4 °C matches the narrative: "the first plume is a warning."
const HEAT_LO = 1.4;
const HEAT_HI = 3.5;
const MAX_SOURCES = 8;

// Filter thresholds.
const NET_ZERO_FLOOR = 0.75;  // avgAdoption above this clears any plume

function avgAdoption(c) {
  return Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6;
}

function plumeIntensity(c) {
  return c.baseEmissionsGtCO2 * (1 - avgAdoption(c));
}

export class SmogPlumes {
  constructor(state, bus, worldMap) {
    this.s = state;
    this.b = bus;
    this.worldMap = worldMap;

    this._destroyed = false;
    this.plumes = new Map();  // key = `${countryId}:${plumeIdx}` → plume
    this.tintedAtlas = null;
    this.activityLevel = 0;   // 0..1 derived from tempAnomalyC

    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'smog-plume-layer';
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:2;image-rendering:pixelated;';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    worldMap.stage.appendChild(canvas);

    this._unsub = bus.on(EVT.TICK, () => this._refreshTargets());
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
      const atlas = await this._loadImage(ATLAS_URL);
      if (this._destroyed) return;
      this.tintedAtlas = this._buildTintedAtlas(atlas, SMOG_TINT);
      this._syncSize();
      this._refreshTargets();
      this._lastT = performance.now();
      this._rafId = requestAnimationFrame((t) => this._frame(t));
    } catch (err) {
      console.warn('[smog-plumes] init failed', err);
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

  // Pre-tint the cloud atlas once — draw cloud, then `source-atop` a dark
  // brown fill so only the non-transparent cloud pixels get darkened.
  _buildTintedAtlas(img, tint) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = tint;
    cx.fillRect(0, 0, c.width, c.height);
    return c;
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

  // Compute which countries should be plumed right now. Fade out plumes that
  // no longer qualify, fade in (or spawn) ones that newly do.
  _refreshTargets() {
    if (this._destroyed) return;
    const temp = this.s.world.tempAnomalyC;
    const badness = Math.max(0, Math.min(1, (temp - HEAT_LO) / (HEAT_HI - HEAT_LO)));
    this.activityLevel = badness;

    const target = Math.round(badness * MAX_SOURCES);
    const qualifiers = Object.values(this.s.countries)
      .filter(c => !c.netZero && avgAdoption(c) < NET_ZERO_FLOOR)
      .map(c => ({ c, score: plumeIntensity(c) }))
      .filter(x => x.score > 0.05)           // tiny emitters get no plume
      .sort((a, b) => b.score - a.score)
      .slice(0, target)
      .map(x => x.c);

    const live = new Set();
    for (const country of qualifiers) {
      const offsets = MULTI_PLUMES[country.id] ?? [{ dx: 0, dy: 0 }];
      for (let i = 0; i < offsets.length; i++) {
        const key = `${country.id}:${i}`;
        live.add(key);
        let p = this.plumes.get(key);
        if (!p) {
          p = this._newPlume(country, offsets[i], i);
          this.plumes.set(key, p);
        }
        p.targetOpacity = 1;
        // Refresh anchor in case mapX/mapY ever changes (blocs, etc.)
        p.anchorU = country.mapX + offsets[i].dx;
        p.anchorV = country.mapY + offsets[i].dy;
      }
    }

    // Retire any plume whose country fell off the list.
    for (const [key, p] of this.plumes) {
      if (!live.has(key)) p.targetOpacity = 0;
    }
  }

  _newPlume(country, offset, idx) {
    const rect = CLOUD_RECTS[(country.id.charCodeAt(0) + idx) % CLOUD_RECTS.length];
    return {
      rect,
      anchorU: country.mapX + offset.dx,
      anchorV: country.mapY + offset.dy,
      opacity: 0,
      targetOpacity: 0,
      wobblePhase: Math.random() * Math.PI * 2,
      // Big countries get a slightly bigger plume; tiny ones get smaller.
      scale: 0.75 + Math.min(0.6, country.baseEmissionsGtCO2 * 0.08),
    };
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
    const FADE_SPEED = 0.8;  // ~1.25 s fade in/out
    for (const [key, p] of this.plumes) {
      const diff = p.targetOpacity - p.opacity;
      p.opacity += Math.sign(diff) * Math.min(Math.abs(diff), FADE_SPEED * dt);
      if (p.targetOpacity === 0 && p.opacity <= 0.01) {
        this.plumes.delete(key);
      }
    }
  }

  _draw(now) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    if (!this.tintedAtlas || this.plumes.size === 0) return;

    // Peak opacity scales gently with badness — even a single plume at +1.5 °C
    // shouldn't look as heavy as 8 plumes in a collapsing world.
    const peak = 0.55 + this.activityLevel * 0.3;   // 0.55 → 0.85

    for (const p of this.plumes.values()) {
      if (p.opacity <= 0.01) continue;
      // Slow east-west pendulum so plumes visibly drift across the map
      // instead of wobbling in place. Half-cycle ≈ 35 s. Per-plume phase
      // keeps the set out of sync, so the whole world feels alive, not
      // like one synchronized animation.
      const driftU = Math.sin(now * 0.00018 + p.wobblePhase) * 0.018;
      const wobbleX = Math.sin(now * 0.0004 + p.wobblePhase) * 0.004;
      const wobbleY = Math.sin(now * 0.0003 + p.wobblePhase * 1.3) * 0.002;
      const u = p.anchorU + wobbleX + driftU;
      const v = p.anchorV + wobbleY;
      const dw = Math.round(p.rect.sw * p.scale);
      const dh = Math.round(p.rect.sh * p.scale);
      const dx = Math.round(u * cw) - Math.round(dw / 2);
      const dy = Math.round(v * ch) - Math.round(dh / 2);

      ctx.globalAlpha = Math.min(1, p.opacity * peak);
      ctx.drawImage(
        this.tintedAtlas,
        p.rect.sx, p.rect.sy, p.rect.sw, p.rect.sh,
        dx, dy, dw, dh,
      );
    }
    ctx.globalAlpha = 1;
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
    this.plumes.clear();
    this.tintedAtlas = null;
  }
}

export const __test = { avgAdoption, plumeIntensity, HEAT_LO, HEAT_HI, MAX_SOURCES };
