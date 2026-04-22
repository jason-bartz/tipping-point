// Forestry + government mechanic. Each tick:
//   1. For every country, step forestHealth and drip passive liability.
//   2. If any country crossed the liability cap, fire succession.
// Additionally, listen to EVENT_FIRED for wildfire-tagged events and charge
// one-shot liability to the target country (or all countries for global
// wildfires) before any cap-check.
//
// Side-effects flow through the bus: EVT.GOVERNMENT_FELL carries the
// succession summary; Dispatches listens so the fall lands in the feed.

import { BALANCE } from '../config/balance.js';
import { EVT } from '../core/EventBus.js';
import { step as stepCountry, chargeWildfire } from '../model/Forestry.js';
import { succeed } from '../model/Government.js';
import { logDispatch } from '../model/Dispatches.js';

// Events whose firing should charge a wildfire liability hit. Keys match
// BALANCE.forestry.wildfireLiability. When the fired event is targeted, the
// hit goes to the target country; when it's global, it splits across all
// countries with governments so nobody is let off the hook for a global
// megafire season.
const WILDFIRE_EVENT_IDS = new Set(['wildfire', 'wildfire_local', 'wildfire_smog', 'wildfire_disaster']);

export class ForestrySystem {
  constructor(state, bus) {
    this.s = state;
    this.b = bus;
    this._unsubs = [
      bus.on(EVT.TICK, () => this._onTick()),
      bus.on(EVT.EVENT_FIRED, (payload) => this._onEventFired(payload)),
    ];
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this._unsubs = [];
  }

  _onTick() {
    const s = this.s;
    for (const c of Object.values(s.countries)) {
      if (stepCountry(c, s.world)) this._fall(c);
    }
  }

  _onEventFired(payload) {
    const id = payload?.event?.id;
    if (!id || !WILDFIRE_EVENT_IDS.has(id)) return;

    const s = this.s;
    // Targeted fires hit the one country; global megafire hits everyone.
    const target = payload.event._ctx?.target
                ?? (id === 'wildfire_local' ? null : null);
    const victims = target ? [target] : Object.values(s.countries);
    for (const c of victims) {
      if (chargeWildfire(c, id)) this._fall(c);
    }
  }

  _fall(country) {
    const s = this.s;
    const summary = succeed(country, s.meta.rng);
    if (!summary) return;

    // Apply the one-shot swing from the new incumbent's tag.
    const swing = summary.swing;
    if (swing.will) {
      country.politicalWill = Math.max(
        BALANCE.minPoliticalWill,
        Math.min(BALANCE.maxPoliticalWill, (country.politicalWill ?? 50) + swing.will),
      );
    }
    const adoptionSwing = swing.adoption ?? {};
    for (const [branch, delta] of Object.entries(adoptionSwing)) {
      country.adoption[branch] = Math.max(0, Math.min(1, (country.adoption[branch] ?? 0) + delta));
    }

    // Tell the world. Dispatch and toast both land from here — we keep the
    // narrative string centralized so UI layers stay dumb.
    const tone = summary.incoming.tag === 'green'  ? 'good'
               : summary.incoming.tag === 'denier' ? 'bad'
               :                                     'neutral';
    const headline = _fallHeadline(summary);
    logDispatch(s, this.b, {
      kind: 'milestone',
      category: 'government',
      title: `${country.name}: Government Falls`,
      body: headline,
      detail: `${summary.outgoing.name} (${summary.outgoing.tag}) removed over wildfire liability. `
            + `${summary.incoming.name} (${summary.incoming.tag}) sworn in.`,
      tone,
    });

    this.b.emit(EVT.GOVERNMENT_FELL, summary);
  }
}

// Narrative template for the fall. Reads the incoming tag so the headline
// lands with the right emotional weight — a green succession is a relief, a
// denier succession is a setback.
function _fallHeadline(summary) {
  const { outgoing, incoming, countryName } = summary;
  if (incoming.tag === 'green') {
    return `${countryName}: ${outgoing.name} removed over forest-fire liability. ${incoming.name} — a climate hawk — sworn in. Early polling surges.`;
  }
  if (incoming.tag === 'denier') {
    return `${countryName}: ${outgoing.name} removed after record wildfire season. Opposition leader ${incoming.name}, a declared climate skeptic, takes office. Green programs on pause.`;
  }
  return `${countryName}: ${outgoing.name} removed over forest-fire liability. Successor ${incoming.name} promises "pragmatism" — observers watch.`;
}
