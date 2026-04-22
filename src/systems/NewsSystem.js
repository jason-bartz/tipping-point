// News ticker. Mixes canned flavor with system-driven headlines. Throttles
// flavor so the ticker has quiet stretches like a real newsroom; first-time
// milestones (first Net Zero, first CO₂ dip below baseline, first capstone)
// fire special headlines.

import { EVT } from '../core/EventBus.js';
import { NEWS_POOL } from '../data/news.js';
import { BALANCE } from '../config/balance.js';
import { STATUS_LABELS, TAXON_EMOJI } from '../data/species.js';

export class NewsSystem {
  constructor(state, bus) {
    this.s = state;
    this.b = bus;
    this._lastFlavorTick = -999;
    this._sinceAnyNews = 0;
    this._firstNetZeroHit = false;
    this._firstCO2DropHit = false;
    this._firstCapstoneHit = false;
    bus.on(EVT.TICK, () => this.tick());
    bus.on(EVT.RESEARCH_DONE, (p) => this._onResearchDone(p));
    bus.on(EVT.NET_ZERO, (p) => this._onNetZero(p));
    bus.on(EVT.EVENT_FIRED, (p) => this._onEventFired(p));
    bus.on(EVT.DEPLOYED, (p) => this._onDeployed(p));
    // Species ticker. SpeciesSystem fires SPECIES_STATUS_CHANGED twice per
    // actual change: once live (for UI listeners / dispatches) and once with
    // `drained: true` when it finally releases the headline through its
    // rate-limited queue. We only publish on the drained copy so a bad year
    // doesn't collapse four downlistings into the same visible tick.
    bus.on(EVT.SPECIES_STATUS_CHANGED, (p) => { if (p?.drained) this._onSpeciesChange(p); });
  }

  // Turn major events into "BREAKING:" headlines. The ticker's LIVE label
  // flashes red when a breaking item is in view, so even a glancing read
  // signals "this mattered." Criteria: tipping-point tier (weight ≤ 1, bad
  // tone) or any interactive decision. Everything else is a normal headline.
  _onEventFired(p) {
    const evt = p?.event || {};
    const isBigBad = p?.tone === 'bad' && (evt.weight ?? 99) <= 1;
    const isDecision = !!evt.interactive && Array.isArray(evt.choices);
    if (isBigBad || isDecision) {
      this.push(`BREAKING: ${p.headline}`, 'breaking');
    } else {
      this.push(p.headline, p.tone);
    }
  }

  tick() {
    this._sinceAnyNews += 1;
    // Respect the same opening quiet that EventSystem honors, so the ticker
    // doesn't spill a flavor headline in the first few seconds of play.
    if (this.s.meta.tick < (BALANCE.newsFlavorStartupGraceTicks ?? 0)) return;
    if (this.s.meta.tick - this._lastFlavorTick < 3) return;
    if (this._sinceAnyNews < 2) return;
    const rng = this.s.meta.rng;
    if (rng.random() > 0.22) return;

    // Try up to 4 picks — context-sensitive templates return null when their
    // precondition doesn't hold, and we'd rather show a static line than
    // silently skip the tick.
    let text = null;
    for (let i = 0; i < 4 && !text; i++) {
      const pick = rng.pick(NEWS_POOL);
      text = typeof pick === 'function' ? pick(this.s) : pick;
    }
    if (text) {
      this.push(text, 'flavor');
      this._lastFlavorTick = this.s.meta.tick;
    }

    if (!this._firstCO2DropHit && this.s.world.co2ppm < BALANCE.startingCO2ppm - 0.5) {
      this._firstCO2DropHit = true;
      this.push('Mauna Loa reports CO₂ below the 2026 baseline for the first time. "We are bending the curve."', 'good');
    }
  }

  _onResearchDone(p) {
    const a = p.activity;
    if (a.tier === 4 && !this._firstCapstoneHit) {
      this._firstCapstoneHit = true;
      this.push(`Historic: humanity completes ${a.name}. A new era of climate action begins.`, 'good');
    } else if (a.tier === 4) {
      this.push(`Another capstone lands: ${a.name} enters the global toolkit.`, 'good');
    } else if (a.tier === 3) {
      this.push(`${a.name} passes final review. Deployments open worldwide.`, 'good');
    } else {
      this.push(`Research complete: ${a.name}.`, 'good');
    }
  }

  _onNetZero(p) {
    if (!this._firstNetZeroHit) {
      this._firstNetZeroHit = true;
      this.push(`BREAKING: ${p.country.name} becomes the first nation to reach Net Zero. A working blueprint exists.`, 'breaking');
    } else {
      this.push(`${p.country.name} reaches Net Zero. Neighbors take notes.`, 'good');
    }
  }

  _onDeployed(p) {
    const c = p.country;
    const a = p.activity;
    const rng = this.s.meta.rng;
    if (c.isHome && rng.random() < 0.35) {
      this.push(`${c.name}'s home program rolls out ${a.name}. A signal to the rest.`, 'info');
      return;
    }
    if (c.infra === 'petrostate') {
      this.push(`${c.name} — a petrostate — adopts ${a.name}. Oil capitals take note.`, 'good');
      return;
    }
    if (c.baseEmissionsGtCO2 >= 2.0 && rng.random() < 0.5) {
      this.push(`${a.name} rolls out in ${c.name}. Top-10 emitter feels the squeeze.`, 'info');
      return;
    }
    if (rng.random() < 0.15) {
      this.push(`${a.name} rolled out in ${c.name}.`, 'info');
    }
  }

  _onSpeciesChange(p) {
    const { def, prevStatus, nextStatus, kind } = p;
    if (!def) return;
    const emoji = TAXON_EMOJI[def.taxon] || '';
    const prevLabel = STATUS_LABELS[prevStatus] || prevStatus;
    const nextLabel = STATUS_LABELS[nextStatus] || nextStatus;
    if (kind === 'rediscovery') {
      this.push(`${emoji} BREAKING: ${def.name} rediscovered in ${def.region}. Listed as Critically Endangered — back from the dead.`, 'breaking');
      return;
    }
    if (nextStatus === 'EX') {
      this.push(`${emoji} BREAKING: ${def.name} declared extinct. Last seen in ${def.region}.`, 'breaking');
      return;
    }
    if (kind === 'recovery') {
      this.push(`${emoji} ${def.name} downlisted from ${prevLabel} to ${nextLabel}. Populations returning in ${def.region}.`, 'good');
      return;
    }
    // Generic decline. Tone escalates with how dire the new status is.
    const tone = (nextStatus === 'CR' || nextStatus === 'EW') ? 'bad' : 'info';
    this.push(`${emoji} ${def.name} uplisted from ${prevLabel} to ${nextLabel}. ${def.region} populations in decline.`, tone);
  }

  push(text, tone) {
    if (!text) return;
    const rng = this.s.meta.rng;
    const item = {
      text,
      tone: tone || 'flavor',
      date: `Q${this.s.meta.quarter} ${this.s.meta.year}`,
      id: Math.floor(rng.random() * 1e9).toString(36),
    };
    this.s.news.unshift(item);
    if (this.s.news.length > 60) this.s.news.length = 60;
    this._sinceAnyNews = 0;
    this.b.emit(EVT.NEWS, item);
  }
}
