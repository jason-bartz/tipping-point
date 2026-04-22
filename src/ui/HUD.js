// Top bar. Date, CO₂, temperature, Net Zero count, Credits, + speed controls
// and the help/stats/mute buttons.
//
// Performance: the skeleton is built once in the constructor. Per-tick we
// only touch the text nodes and class toggles — no innerHTML= on the hot path.

import { EVT } from '../core/EventBus.js';
import { select } from '../core/GameState.js';
import { BALANCE } from '../config/balance.js';
import { mountTicker } from './PopulationTicker.js';

export class HUD {
  constructor(root, state, bus, loop, { onHelp, onStats, onMute, onSave, onSettings, onAchievements, board } = {}) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    this.loop = loop;
    this.board = board;

    root.innerHTML = `
      <div class="hud-stats">
        <div class="hud-block" title="Current game date. Each quarter is one tick. No fixed end year — play until you reverse climate change or cross +${BALANCE.lossTempC.toFixed(1)}°C."><label>Date</label><span class="date">Q1 ${BALANCE.startYear}</span></div>
        <div class="hud-block hud-temp" title="Global temperature anomaly above pre-industrial. Lose at +${BALANCE.lossTempC.toFixed(1)}°C. Win requires peak ≤ +2.1°C."><label>Temp</label><span class="temp">+0.00°C</span></div>
        <div class="hud-block hud-co2" title="Atmospheric CO₂ concentration in parts per million. Pre-industrial was 280 ppm. Win target: ≤395 ppm and clearly past the peak."><label>CO₂</label><span class="co2">0 ppm</span></div>
        <div class="hud-block" title="Countries at Net Zero (≥${Math.round(BALANCE.netZeroThresholdAdoption*100)}% clean adoption across all sectors). Win requires ${Math.round(BALANCE.winCountryNetZeroPct*100)}% of countries here."><label>Net Zero</label><span class="nz">0 / 0</span></div>
        <div class="hud-block" title="Carbon Credits — your currency. Earned each quarter and via Net Zero milestones. Spend on research and deployment."><label>Credits</label><span class="hud-value-row"><span class="cp">0</span><span class="cp-glyph">●</span></span></div>
        <div class="hud-block hud-pop" title="World population, animated in real time. Grows naturally by default; climate mortality (heat, crop loss, water stress) pulls it down as temperature rises past +1.5°C. Deploying clean tech in a country shields its people from climate drag."><label>Pop</label><span class="hud-pop-ticker"></span></div>
      </div>
      <div class="hud-alert-zone" id="hud-alert-zone" aria-live="polite" aria-atomic="false"></div>
      <div class="hud-tools" role="toolbar" aria-label="Game controls">
        <button class="hud-toolbtn save-btn" title="Save now (autosave runs in the background)" aria-label="Save game"><img class="hud-icon" src="/icons/save.png" alt="" aria-hidden="true" /></button>
        <button class="hud-toolbtn mute-btn" title="Mute / unmute (M)" aria-label="Toggle sound"><img class="hud-icon" src="/icons/sound-on.png" alt="" aria-hidden="true" /></button>
        <button class="hud-toolbtn stats-btn" title="World & country stats (S)" aria-label="Open stats">STATS</button>
        <button class="hud-toolbtn achievements-btn" title="Achievements (A)" aria-label="Open achievements">★</button>
        <button class="hud-toolbtn settings-btn" title="Settings (,)" aria-label="Open settings">⚙</button>
        <button class="hud-toolbtn help-btn" title="How to play (H)" aria-label="Show help">?</button>
      </div>
      <div class="hud-speed" role="group" aria-label="Game speed">
        <button data-s="p" title="Pause (Space)" aria-label="Pause">❚❚</button>
        <button data-s="1" class="active" title="1x speed" aria-label="1x speed">1×</button>
        <button data-s="2" title="2x speed" aria-label="2x speed">2×</button>
        <button data-s="4" title="4x speed" aria-label="4x speed">4×</button>
      </div>`;

    // Cache nodes we update each tick.
    this.el = {
      date:      root.querySelector('.date'),
      temp:      root.querySelector('.temp'),
      co2:       root.querySelector('.co2'),
      nz:        root.querySelector('.nz'),
      cp:        root.querySelector('.cp'),
      mute:      root.querySelector('.mute-btn'),
    };

    // World-population ticker. Owns its own RAF; HUD.destroy() cancels it.
    // The anchor closure captures `state` so it always reports live values
    // without re-binding when the country set changes.
    this.ticker = mountTicker(root.querySelector('.hud-pop-ticker'), {
      anchor: () => ({
        valueM: select.worldPopulationM(state),
        deltaPerTickM: select.worldPopulationDeltaM(state),
      }),
      fractionalTick: () => loop?.fractionalTick?.() ?? 0,
    }, { compact: false, showDelta: true });

    root.querySelector('.save-btn').addEventListener('click', () => onSave?.());
    root.querySelector('.mute-btn').addEventListener('click', () => {
      const muted = onMute?.();
      this._renderMuteIcon(!!muted);
    });
    this._renderMuteIcon(board?.muted ?? false);

    root.querySelector('.help-btn').addEventListener('click', () => onHelp?.());
    root.querySelector('.stats-btn').addEventListener('click', () => onStats?.());
    root.querySelector('.settings-btn').addEventListener('click', () => onSettings?.());
    root.querySelector('.achievements-btn').addEventListener('click', () => {
      onAchievements?.();
      root.querySelector('.achievements-btn')?.classList.remove('has-new');
    });

    root.querySelectorAll('.hud-speed [data-s]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.s;
        if (v === 'p') { loop.setPaused(true); }
        else           { loop.setPaused(false); loop.setSpeed(Number(v)); }
        // Manual speed control overrides any director-driven auto-pause —
        // clear the flag so resolving a decision doesn't undo the player's
        // explicit choice.
        state.meta.autoPausedForDecision = false;
        delete state.meta._preAutoPausedState;
        root.querySelectorAll('.hud-speed button').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    bus.on(EVT.TICK, () => this.update());
    this.update();

    // Mark the achievements button if any unlocks happened out-of-modal
    // (e.g. fired before this HUD mounted, or persisted from a prior run).
    this.markAchievementsNew = () => {
      root.querySelector('.achievements-btn')?.classList.add('has-new');
    };
  }

  // Reflect the current paused/speed state on the speed buttons. Called
  // by main.js after any programmatic loop.setPaused() so the visual
  // stays in sync (the TICK path can't do it — ticks don't fire while
  // paused).
  syncSpeedUI() {
    const s = this.state.meta;
    const target = s.paused ? 'p' : String(s.speed ?? 1);
    for (const btn of this.root.querySelectorAll('.hud-speed [data-s]')) {
      btn.classList.toggle('active', btn.dataset.s === target);
    }
  }

  destroy() {
    this.ticker?.destroy?.();
    this.ticker = null;
  }

  _renderMuteIcon(muted) {
    if (!this.el.mute) return;
    const icon = this.el.mute.querySelector('.hud-icon');
    if (icon) icon.setAttribute('src', muted ? '/icons/sound-off.png' : '/icons/sound-on.png');
    this.el.mute.classList.toggle('muted', muted);
  }

  update() {
    const s = this.state;
    const w = s.world;
    this.el.date.textContent = select.displayDate(s);
    this.el.temp.textContent = `+${w.tempAnomalyC.toFixed(2)}°C`;
    this.el.co2.textContent  = `${w.co2ppm.toFixed(0)} ppm`;
    const total = Object.keys(s.countries).length;
    const nz = Object.values(s.countries).filter(c => c.netZero).length;
    this.el.nz.textContent = `${nz} / ${total}`;
    this.el.cp.textContent = Math.floor(s.world.climatePoints);
  }

  _updateTrend(el, history, threshold, higherIsBad) {
    if (!el || !history || history.length < 4) return;
    const recent = history.slice(-8);
    const delta = recent[recent.length - 1] - recent[0];
    let sym = '→', cls = 'trend-flat';
    if (delta > threshold)       { sym = '↑'; cls = higherIsBad ? 'trend-up' : 'trend-down'; }
    else if (delta < -threshold) { sym = '↓'; cls = higherIsBad ? 'trend-down' : 'trend-up'; }
    el.textContent = sym;
    el.className = 'trend-arrow ' + cls;
  }
}
