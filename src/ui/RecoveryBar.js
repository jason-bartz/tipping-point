// Full-width win-progress indicator over the top of the map. Tracks how
// close the player is to satisfying the standard-win conditions directly,
// so "progress" on the bar = progress toward actually winning:
//   40% Net Zero share (vs winCountryNetZeroPct target)
//   30% CO₂ level under starting ceiling (vs winCO2ppm target)
//   20% CO₂ drop from peak (vs reversalCO2DropPpm target)
//   10% temperature headroom toward the loss gate
// Starting state lands near 10%; standard win lands ~97%; perfect win ~99%.
// The WIN marker sits at 95% so both standard and perfect victories cross it.

import { EVT } from '../core/EventBus.js';
import { BALANCE } from '../config/balance.js';

const WIN_MARKER_PCT = 95;

export class RecoveryBar {
  constructor(container, state, bus) {
    this.state = state;
    this.root = document.createElement('div');
    this.root.className = 'recovery-bar';
    // Tug-of-war layout: COLLAPSE anchor (left) ← single zoned track with a
    // position marker → NET ZERO anchor (right). Three colored zones read at
    // a glance; the marker answers "where am I?" without reading numbers.
    this.root.innerHTML = `
      <div class="recovery-anchor recovery-anchor-bad" title="You lose if the world crosses +${BALANCE.lossTempC.toFixed(1)}°C or adoption collapses.">
        <span class="recovery-anchor-label">Collapse</span>
      </div>
      <div class="recovery-track" title="Win progress: Net Zero share, CO₂ under the ceiling, CO₂ drop from peak, and temperature headroom. Push the marker past WIN to win.">
        <div class="recovery-zones" aria-hidden="true">
          <span class="recovery-zone zone-bad"></span>
          <span class="recovery-zone zone-mid"></span>
          <span class="recovery-zone zone-good"></span>
        </div>
        <div class="recovery-win-mark" style="left: ${WIN_MARKER_PCT}%"><span class="recovery-win-label">WIN</span></div>
        <div class="recovery-marker" style="left: 0%">
          <span class="recovery-marker-pct">0%</span>
        </div>
      </div>
      <div class="recovery-anchor recovery-anchor-good" title="You win when Net Zero share, temperature ceiling, and CO₂ drop all clear their thresholds.">
        <span class="recovery-anchor-label">Net Zero</span>
      </div>
      <div class="recovery-sub"></div>`;
    container.appendChild(this.root);
    this.marker    = this.root.querySelector('.recovery-marker');
    this.markerPct = this.root.querySelector('.recovery-marker-pct');
    this.sub       = this.root.querySelector('.recovery-sub');
    this._unsub = bus.on(EVT.TICK, () => this.update());
    this.update();
  }

  destroy() {
    this._unsub?.();
    this.root?.remove();
  }

  update() {
    const w = this.state.world;
    const countries = Object.values(this.state.countries);
    const nzPct = countries.length
      ? countries.filter(c => c.netZero).length / countries.length
      : 0;
    const co2Drop = Math.max(0, (w.peakCO2ppm ?? w.co2ppm) - w.co2ppm);

    // Each sub-score hits 1.0 when its win clause is satisfied.
    const nzProgress = Math.min(1, nzPct / BALANCE.winCountryNetZeroPct);
    const co2LevelRange = BALANCE.startingCO2ppm - BALANCE.winCO2ppm;
    const co2LevelProgress = clamp01((BALANCE.startingCO2ppm - w.co2ppm) / co2LevelRange);
    const co2DropProgress = Math.min(1, co2Drop / BALANCE.reversalCO2DropPpm);
    // Temp headroom: full at starting temp, 0 at loss temp. Keeps the bar
    // honest about heat even when CO₂ is technically fine.
    const tempRange = BALANCE.lossTempC - BALANCE.startingTempAnomalyC;
    const tempOverage = Math.max(0, w.tempAnomalyC - BALANCE.startingTempAnomalyC);
    const tempHeadroom = 1 - clamp01(tempOverage / tempRange);

    const score = 0.40 * nzProgress
                + 0.30 * co2LevelProgress
                + 0.20 * co2DropProgress
                + 0.10 * tempHeadroom;
    const pctNum = Math.max(0, Math.min(100, Math.round(score * 100)));

    this.marker.style.left = `${pctNum}%`;
    this.markerPct.textContent = `${pctNum}%`;
    this.root.classList.toggle('recovery-winning', pctNum >= WIN_MARKER_PCT);

    const nz = Math.round(nzPct * 100);
    const drop = co2Drop.toFixed(1);
    this.sub.textContent = `Temp +${w.tempAnomalyC.toFixed(2)}°C · CO₂ ${w.co2ppm.toFixed(1)} ppm (−${drop} from peak) · Net Zero ${nz}%`;
  }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
