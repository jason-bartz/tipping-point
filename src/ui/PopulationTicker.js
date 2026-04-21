// PopulationTicker — renders a real-time population counter that interpolates
// smoothly between ticks. Pattern is the same one ResearchTree uses for the
// in-progress bar: the engine supplies a snapshot value + per-tick delta, the
// UI redraws every animation frame using `loop.fractionalTick()` to compute
// where we are inside the current quarter.
//
// Two flavors:
//   - mount(container, source, opts)      — world total (big number for HUD)
//   - mountCompact(container, source)     — tight-fit variant for panels
//
// `source` is a getter object so the ticker can be re-used for world-scope or
// country-scope without knowing about state shape:
//   {
//     anchor: () => ({ valueM, deltaPerTickM }),  // latest confirmed snapshot
//     fractionalTick: () => number in [0,1),      // how far into this tick
//   }

import { formatPopulationFull, formatPopulationCompact, formatDelta } from '../model/Population.js';

// Internal: a single live ticker. Owns its own RAF loop; .destroy() cancels.
class Ticker {
  constructor(root, source, { compact = false, showDelta = true } = {}) {
    this.root = root;
    this.source = source;
    this.compact = compact;
    this.showDelta = showDelta;
    this.prevDisplay = null;
    this.prevSign = null;
    this._buildDOM();
    this._raf = requestAnimationFrame(this._tick);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.root.innerHTML = '';
  }

  _buildDOM() {
    this.root.innerHTML = `
      <span class="pop-ticker-value" aria-live="polite"></span>
      ${this.showDelta ? `<span class="pop-ticker-delta"></span>` : ''}
    `;
    this.valEl   = this.root.querySelector('.pop-ticker-value');
    this.deltaEl = this.root.querySelector('.pop-ticker-delta');
  }

  _tick = () => {
    this._raf = requestAnimationFrame(this._tick);
    const { valueM, deltaPerTickM } = this.source.anchor() ?? {};
    if (valueM == null) return;
    const frac = Math.max(0, Math.min(1, this.source.fractionalTick?.() ?? 0));
    const interpolatedM = valueM + (deltaPerTickM ?? 0) * frac;

    const text = this.compact
      ? formatPopulationCompact(interpolatedM)
      : formatPopulationFull(interpolatedM);
    if (text !== this.prevDisplay) {
      this.valEl.textContent = text;
      this.prevDisplay = text;
    }

    if (this.showDelta && this.deltaEl) {
      const d = deltaPerTickM ?? 0;
      // Show per-year delta (×4) for reader comprehension — a quarter-delta
      // of -0.02M is hard to feel; an annualized -0.08M means something.
      this.deltaEl.textContent = `${formatDelta(d * 4)}/yr`;
      const sign = d > 0.0005 ? 'up' : d < -0.0005 ? 'down' : 'flat';
      if (sign !== this.prevSign) {
        this.deltaEl.classList.remove('up', 'down', 'flat');
        this.deltaEl.classList.add(sign);
        this.prevSign = sign;
      }
    }
  };
}

// Public: mount a full-width ticker. Returns an instance with .destroy().
export function mountTicker(container, source, opts = {}) {
  return new Ticker(container, source, opts);
}
