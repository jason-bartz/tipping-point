// Map ambience. Smog + doom tint when things are bad, bloom overlay when
// they're good, and an ocean-gradient lerp that moves between healthy blues
// and sickly browns on a 2s transition.

import { EVT } from '../core/EventBus.js';
import { BALANCE } from '../config/balance.js';

export class MapAmbience {
  constructor(container, state, bus) {
    this.container = container;
    this.state = state;
    this.smog  = document.createElement('div'); this.smog.className  = 'smog-layer';
    this.doom  = document.createElement('div'); this.doom.className  = 'doom-tint';
    this.bloom = document.createElement('div'); this.bloom.className = 'bloom-tint';
    container.appendChild(this.smog);
    container.appendChild(this.doom);
    container.appendChild(this.bloom);
    this._unsub = bus.on(EVT.TICK, () => this.update());
    this.update();
  }

  destroy() {
    this._unsub?.();
    this.smog?.remove();
    this.doom?.remove();
    this.bloom?.remove();
  }

  update() {
    const w = this.state.world;
    const doomScore = Math.max(0, Math.min(1, w.tempAnomalyC / BALANCE.lossTempC));
    const co2Drop = Math.max(0, (w.peakCO2ppm ?? w.co2ppm) - w.co2ppm);
    const co2Recovery = Math.min(1, co2Drop / (BALANCE.reversalCO2DropPpm * 1.5));
    const nzPct = Object.values(this.state.countries).filter(c => c.netZero).length / Object.keys(this.state.countries).length;
    const bloomScore = Math.max(0, 0.6 * co2Recovery + 0.4 * nzPct - 0.3 * doomScore);

    // Global haze = "how hot is it" minus a credit for net-zero progress, so
    // decarbonization visibly lightens the sky even before the temperature
    // catches up. Local per-country smog (SmogPlumes) carries the per-country
    // attribution story so these two layers can work in tandem.
    const adjustedDoom = Math.max(0, doomScore - nzPct * 0.22);
    this.smog.style.opacity  = (adjustedDoom * 0.9).toFixed(2);
    this.doom.style.opacity  = (adjustedDoom * 0.6).toFixed(2);
    this.bloom.style.opacity = Math.min(0.85, bloomScore * 1.1).toFixed(2);

    const healthy = [[190, 233, 255], [154, 215, 240], [124, 200, 229]];
    const sick    = [[140, 120,  90], [110,  95,  70], [ 85,  70,  55]];
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const colorMix = (idx) => {
      const base = healthy[idx].map((v, i) => lerp(v, sick[idx][i], doomScore));
      const bright = [210, 245, 255];
      const final = base.map((v, i) => lerp(v, bright[i], bloomScore * 0.25));
      return `rgb(${final[0]}, ${final[1]}, ${final[2]})`;
    };
    this.container.style.background =
      `linear-gradient(180deg, ${colorMix(0)} 0%, ${colorMix(1)} 60%, ${colorMix(2)} 100%)`;
  }
}
