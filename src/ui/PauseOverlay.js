// Pause overlay. Dims the map area and shows a PAUSED badge while the loop
// is stopped or auto-paused for a decision. Pointer-events are off so clicks
// fall through to the map (player can still click countries while paused).
//
// Listens to a 50ms RAF poll on state.meta.paused — paused-state changes
// don't emit a dedicated event, and tick events stop firing exactly when
// we'd need them most.

const CLASS = 'gp-pause-overlay';
const ACTIVE = 'active';

export class PauseOverlay {
  constructor(mapContainer, state) {
    this.state = state;
    this.raf = null;
    this._lastPaused = null;
    this._lastAuto = null;

    this.el = document.createElement('div');
    this.el.className = CLASS;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<div class="gp-pause-badge">PAUSED</div>`;
    mapContainer.appendChild(this.el);

    const tick = () => {
      const m = state.meta;
      const paused = !!m.paused;
      const auto = !!m.autoPausedForDecision;
      if (paused !== this._lastPaused) {
        this._lastPaused = paused;
        this.el.classList.toggle(ACTIVE, paused);
      }
      if (paused && auto !== this._lastAuto) {
        this._lastAuto = auto;
        const badge = this.el.querySelector('.gp-pause-badge');
        if (badge) badge.textContent = auto ? 'DECISION · PAUSED' : 'PAUSED';
      }
      if (!paused) this._lastAuto = null; // re-evaluate next time we pause
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.el?.remove();
    this.el = null;
  }
}
