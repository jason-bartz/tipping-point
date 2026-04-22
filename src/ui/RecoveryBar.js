// Full-width recovery indicator over the top of the map. Composite score:
// 35% temp headroom, 35% CO₂ drop from peak, 30% Net Zero share, +15%
// reversal bonus when CO₂ has clearly peaked.

import { EVT } from '../core/EventBus.js';
import { BALANCE } from '../config/balance.js';

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
      <div class="recovery-track" title="Composite recovery score: temp headroom, CO₂ drop from peak, and Net Zero share. Push the marker right to win.">
        <div class="recovery-zones" aria-hidden="true">
          <span class="recovery-zone zone-bad"></span>
          <span class="recovery-zone zone-mid"></span>
          <span class="recovery-zone zone-good"></span>
        </div>
        <div class="recovery-win-mark" style="left: 90%"><span class="recovery-win-label">WIN</span></div>
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
    const tempScore = Math.max(0, 1 - w.tempAnomalyC / BALANCE.lossTempC);
    const co2Score  = Math.max(0, 1 - (w.co2ppm - BALANCE.preindustrialCO2ppm) / 220);
    const co2Drop   = Math.max(0, (w.peakCO2ppm ?? w.co2ppm) - w.co2ppm);
    const recoveryBonus = Math.min(0.15, (co2Drop / BALANCE.reversalCO2DropPpm) * 0.15);
    const nzPct = Object.values(this.state.countries).filter(c => c.netZero).length / Object.keys(this.state.countries).length;
    const score = 0.35 * tempScore + 0.35 * co2Score + 0.30 * nzPct + recoveryBonus;
    const pctNum = Math.max(0, Math.min(100, Math.round(score * 100)));

    this.marker.style.left = `${pctNum}%`;
    this.markerPct.textContent = `${pctNum}%`;
    this.root.classList.toggle('recovery-winning', pctNum >= 90);

    const nz = Math.round(nzPct * 100);
    const drop = co2Drop.toFixed(1);
    this.sub.textContent = `Temp +${w.tempAnomalyC.toFixed(2)}°C · CO₂ ${w.co2ppm.toFixed(1)} ppm (−${drop} from peak) · Net Zero ${nz}%`;
  }
}
