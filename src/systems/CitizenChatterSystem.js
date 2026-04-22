// Citizen chatter — small speech bubbles that pop over a country on the map
// with a one-liner from a "regular citizen". Ambient, low-signal Easter
// eggs, cousin to the news ticker but more casual. Key constraints:
//   · Never more than one on screen at a time.
//   · Sporadic. Low per-tick roll, a cooldown, and a startup grace.
//   · Dwells long enough to read (~6s), then fades out.
//   · Shuffle-deck picker over the CITIZEN_POOL so a typical session doesn't
//     see repeats until the whole pool has cycled.
//
// Pool entries can be either strings (evergreen, random country) or
// (state) => string | { text, country } | null. Functions that return null
// mean "precondition not met, roll something else". See data/citizens.js.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { CITIZEN_POOL } from '../data/citizens.js';

export class CitizenChatterSystem {
  constructor(state, bus, worldMap, mapContainer) {
    this.s = state;
    this.b = bus;
    this.worldMap = worldMap;
    this.container = mapContainer;
    this.layer = document.createElement('div');
    this.layer.className = 'chatter-layer';
    this.container.appendChild(this.layer);

    this.current = null;           // { el, spawnedAtTick, dwellTicks }
    this._lastShownTick = -999;
    this._deck = [];               // shuffled queue of pool indices

    this._unsubs = [
      bus.on(EVT.TICK, () => this._step()),
    ];
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this._unsubs = [];
    this._removeCurrent(true);
    this.layer?.remove();
    this.layer = null;
  }

  _step() {
    if (this.s.meta.status !== 'running') return;
    if (this.s.meta.tick < (BALANCE.chatterStartupGraceTicks ?? 4)) return;

    // Expire the on-screen bubble if its dwell ran out.
    if (this.current && this.s.meta.tick >= this.current.expiresAtTick) {
      this._removeCurrent(false);
    }

    if (this.current) return;                                 // one at a time
    const gap = this.s.meta.tick - this._lastShownTick;
    if (gap < (BALANCE.chatterMinGapTicks ?? 3)) return;      // cooldown

    const rng = this.s.meta.rng;
    if (rng.random() > (BALANCE.chatterFireChancePerTick ?? 0.09)) return;

    this._spawn();
  }

  // Shuffle-deck picker: exhaust every pool entry once before repeating, so
  // a player won't see the same line twice inside a typical session. We
  // refill with a fresh Fisher-Yates shuffle when the deck drains.
  _drawFromDeck() {
    if (!this._deck.length) {
      const rng = this.s.meta.rng;
      const n = CITIZEN_POOL.length;
      const idxs = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng.random() * (i + 1));
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
      }
      this._deck = idxs;
    }
    return this._deck.pop();
  }

  // Resolves a pool entry to { text, country } or null. Strings map to a
  // random country; functions can force a country by returning { text, country }.
  _resolveEntry(entry) {
    const rng = this.s.meta.rng;
    let text = null;
    let country = null;

    if (typeof entry === 'function') {
      const out = entry(this.s);
      if (!out) return null;
      if (typeof out === 'string') { text = out; }
      else { text = out.text; country = out.country ?? null; }
    } else if (typeof entry === 'string') {
      text = entry;
    } else if (entry && typeof entry === 'object') {
      text = entry.text; country = entry.country ?? null;
    }

    if (!text) return null;
    if (!country) {
      const list = Object.values(this.s.countries);
      country = list[Math.floor(rng.random() * list.length)];
    }
    return { text, country };
  }

  _spawn() {
    if (!this.worldMap?.projectCountry) return;

    // Try up to 6 picks. Context-sensitive templates can return null when
    // their precondition doesn't hold — we'd rather roll again than show
    // nothing on a frame we committed to.
    let resolved = null;
    for (let i = 0; i < 6 && !resolved; i++) {
      const idx = this._drawFromDeck();
      resolved = this._resolveEntry(CITIZEN_POOL[idx]);
    }
    if (!resolved) return;

    const { text, country } = resolved;
    const p = this.worldMap.projectCountry(country);
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;

    const rng = this.s.meta.rng;
    const jitterX = (rng.random() - 0.5) * 18;
    const jitterY = -28 - rng.random() * 10;

    const el = document.createElement('div');
    el.className = 'chatter-bubble';
    el.style.left = `${p[0] + jitterX}px`;
    el.style.top = `${p[1] + jitterY}px`;

    const body = document.createElement('div');
    body.className = 'chatter-bubble-text';
    body.textContent = text;
    el.appendChild(body);

    const tail = document.createElement('div');
    tail.className = 'chatter-bubble-tail';
    el.appendChild(tail);

    this.layer.appendChild(el);

    const dwell = BALANCE.chatterDwellTicks ?? 3;
    this.current = {
      el,
      expiresAtTick: this.s.meta.tick + dwell,
    };
    this._lastShownTick = this.s.meta.tick;
  }

  _removeCurrent(immediate) {
    if (!this.current) return;
    const { el } = this.current;
    this.current = null;
    if (!el) return;
    if (immediate) { el.remove(); return; }
    el.classList.add('chatter-bubble-out');
    setTimeout(() => el.remove(), 450);
  }
}
