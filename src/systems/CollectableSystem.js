// Plague-Inc style bubbles that pop on the map. Encourage active play: each
// type has a strategic effect beyond its Credit payout. Spawn weight favors
// high-emission countries — that's where the fight matters.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { COLLECTABLE_TYPES, COLLECTABLE_ROLL_TABLE } from '../data/collectables.js';
import { BRANCHES } from '../data/activities.js';
import { advisorConsumePendingSpawns } from './AdvisorSystem.js';

export class CollectableSystem {
  constructor(state, bus, worldMap, mapContainer) {
    this.s = state;
    this.b = bus;
    this.worldMap = worldMap;
    this.container = mapContainer;
    this.layer = document.createElement('div');
    this.layer.className = 'collectable-layer';
    this.container.appendChild(this.layer);
    this.elById = new Map();
    bus.on(EVT.TICK, () => this._step());
  }

  destroy() {
    this.layer?.remove();
    this.elById.clear();
  }

  _step() {
    if (this.s.meta.status !== 'running') return;
    if (this.s.meta.tick < (BALANCE.collectableStartupGraceTicks ?? 0)) return;

    const now = this.s.meta.tick;
    this.s.collectables = this.s.collectables.filter(c => {
      if (now >= c.expiresAtTick) { this._removeEl(c.id); return false; }
      return true;
    });

    const rng = this.s.meta.rng;

    // Drain any advisor-driven spawns (Activist Rally, agenda rewards).
    // These bypass the per-tick roll but still respect max concurrent.
    let bonus = advisorConsumePendingSpawns(this.s);
    while (bonus > 0 && this.s.collectables.length < BALANCE.collectableMaxConcurrent) {
      this._spawnOne(rng);
      bonus -= 1;
    }

    if (this.s.collectables.length >= BALANCE.collectableMaxConcurrent) return;
    if (rng.random() > BALANCE.collectableFireChancePerTick) return;

    this._spawnOne(rng);
  }

  _spawnOne(rng) {
    const type = this._rollType(rng);
    const country = this._pickCountry(rng);
    if (!country || !this.worldMap?.projectCountry) return;
    const p = this.worldMap.projectCountry(country);
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;

    const spawn = {
      id: 'c_' + Math.floor(rng.random() * 1e9).toString(36),
      type: type.id,
      icon: type.icon,
      value: type.value,
      countryId: country.id,
      spawnedAtTick: this.s.meta.tick,
      expiresAtTick: this.s.meta.tick + (BALANCE.collectableTTLTicks ?? 5),
      x: p[0] + (rng.random() - 0.5) * 34,
      y: p[1] - 24 - rng.random() * 18,
    };
    this.s.collectables.push(spawn);
    this._renderOne(spawn, country);
  }

  _rollType(rng) {
    const r = rng.random();
    for (const row of COLLECTABLE_ROLL_TABLE) {
      if (r < row.upTo) return COLLECTABLE_TYPES[row.type];
    }
    return COLLECTABLE_TYPES.sprout;
  }

  _pickCountry(rng) {
    const list = Object.values(this.s.countries);
    if (!list.length) return null;
    const weighted = list.flatMap(c => Array(1 + Math.floor(c.baseEmissionsGtCO2 * 2)).fill(c));
    return rng.pick(weighted);
  }

  _renderOne(spawn, country) {
    const typeDef = COLLECTABLE_TYPES[spawn.type];
    const tooltip = `${typeDef.label} in ${country.name} — +${spawn.value} Credits and ${typeDef.effectLabel}. Claim before it fades.`;
    const el = document.createElement('button');
    el.className = `collectable collectable-${spawn.type}`;
    el.style.left = `${spawn.x}px`;
    el.style.top = `${spawn.y}px`;
    el.innerHTML = `<span class="collectable-icon">${spawn.icon}</span><span class="collectable-value">+${spawn.value}</span>`;
    el.setAttribute('data-id', spawn.id);
    el.setAttribute('title', tooltip);
    el.setAttribute('aria-label', tooltip);
    el.addEventListener('click', (e) => { e.stopPropagation(); this._claim(spawn.id); });
    this.layer.appendChild(el);
    this.elById.set(spawn.id, el);
  }

  _removeEl(id) {
    const el = this.elById.get(id);
    if (el) el.remove();
    this.elById.delete(id);
  }

  _claim(id) {
    const idx = this.s.collectables.findIndex(c => c.id === id);
    if (idx === -1) return;
    const [c] = this.s.collectables.splice(idx, 1);

    this.s.world.climatePoints += c.value;
    const country = this.s.countries[c.countryId];
    const body = this._applyEffect(c, country);

    const el = this.elById.get(id);
    if (el) {
      el.classList.add('claimed');
      setTimeout(() => { el.remove(); this.elById.delete(id); }, 600);
    }

    const typeDef = COLLECTABLE_TYPES[c.type];
    this.b.emit(EVT.COLLECTABLE_CLAIMED, { title: `${typeDef.icon} ${typeDef.label}`, body, tone: 'good', type: c.type, value: c.value, countryId: c.countryId });
  }

  _applyEffect(c, country) {
    if (!country) return `+${c.value} Credits.`;
    const typeDef = COLLECTABLE_TYPES[c.type];

    if (typeDef.effect === 'will_local') {
      country.politicalWill = Math.min(100, country.politicalWill + 4);
      return `+${c.value} Credits. Political Will in ${country.name} +4.`;
    }
    if (typeDef.effect === 'adoption_boost') {
      const entries = Object.entries(country.adoption).sort((a, b) => b[1] - a[1]);
      const [branch] = entries[0];
      country.adoption[branch] = Math.min(1, country.adoption[branch] + 0.04);
      return `+${c.value} Credits. ${BRANCHES[branch]?.label ?? branch} adoption in ${country.name} +4%.`;
    }
    if (typeDef.effect === 'will_region') {
      country.politicalWill = Math.min(100, country.politicalWill + 6);
      let count = 0;
      for (const nId of country.neighbors || []) {
        const n = this.s.countries[nId];
        if (!n) continue;
        n.politicalWill = Math.min(100, n.politicalWill + 4);
        count++;
      }
      return `+${c.value} Credits. Will +6 in ${country.name}${count ? `, +4 across ${count} neighbor${count === 1 ? '' : 's'}` : ''}.`;
    }
    if (typeDef.effect === 'research_off') {
      this.s.world.researchDiscountTicksRemaining = BALANCE.researchDiscountTicks ?? 4;
      this.s.world.researchDiscountPct = BALANCE.researchDiscountPct ?? 0.3;
      const pct = Math.round((BALANCE.researchDiscountPct ?? 0.3) * 100);
      const ticks = BALANCE.researchDiscountTicks ?? 4;
      return `+${c.value} Credits. Next research ${pct}% off for ${ticks} ticks.`;
    }
    return `+${c.value} Credits.`;
  }
}
