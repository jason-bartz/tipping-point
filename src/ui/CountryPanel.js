// Right panel. Shows selected country, its adoption bars, and deployable
// activities broken down by branch. Deploys fire through AdoptionSystem —
// failures surface as toasts + a shake on the offending button.
//
// UX goals (v0.3):
//   - Each adoption bar explains what "50% Energy" actually means.
//   - Deploy buttons are unambiguous cards: cost, effect, diminishing-returns
//     hint, political-will gate, and live synergy badges.
//   - A dismissable "What am I looking at?" key explains the sidebar once.
//
// Performance: per-tick we call _updateSoft() which re-runs the *deploy
// projection* per card (cheap — ~O(activities × synergies)) and updates text.
// A structural rebuild only happens on country change / research completion.

import { EVT } from '../core/EventBus.js';
import { BRANCHES, ACTIVITIES } from '../data/activities.js';
import { rectFlag, isBlocFlag } from '../data/flags.js';
import { projectDeploy } from '../model/DeployEconomy.js';
import { gate as politicalGate } from '../model/PoliticalGate.js';
import { formatPopulationFull, formatDelta } from '../model/Population.js';
import { showToast } from './Toast.js';

const BRANCH_EXPLAIN = {
  energy:    'Share of electricity and heat from clean sources.',
  transport: 'Share of trips and freight on clean modes.',
  industry:  'Share of heavy industry + buildings running electric/green.',
  land:      'Share of land use that stores carbon, not releases it.',
  capture:   'Deployment of CO₂ removal (DAC, BECCS, weathering).',
  policy:    'Policy coverage — pricing, bans, subsidies aligned with net zero.',
};

const LEGEND_KEY = 'greenprint.countryPanelLegendSeen.v1';
const legendDismissed = () => { try { return localStorage.getItem(LEGEND_KEY) === '1'; } catch { return false; } };
const markLegendDismissed = () => { try { localStorage.setItem(LEGEND_KEY, '1'); } catch { /* ignore */ } };

export class CountryPanel {
  constructor(root, state, bus, adoption) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    this.adoption = adoption;
    this.selectedId = null;
    this.selectedSector = 'energy';   // which sector's deploys are visible
    this._researchedSig = '';
    this._legendOpen = !legendDismissed();

    bus.on(EVT.COUNTRY_SELECTED, ({ id }) => { this.selectedId = id; this._render(); });
    bus.on(EVT.TICK,              () => this._updateSoft());
    // A deploy mutates diminishing-returns state + will, both of which change
    // card *structure* (diminishing hint appears, synergy chip counts may
    // shift). Soft-patch isn't enough — do a full re-render but only when it
    // affects the country currently displayed.
    bus.on(EVT.DEPLOYED,          ({ country }) => {
      if (country?.id === this.selectedId) this._render();
      else this._updateSoft();
    });
    bus.on(EVT.RESEARCH_DONE,     () => this._render()); // list changed
    bus.on(EVT.DEPLOY_FAILED,     (p) => this._onDeployFailed(p));
    this._render();
  }

  _researchedKey() {
    return [...this.state.world.researched].sort().join(',');
  }

  _legendHTML() {
    // Closed: nothing rendered inline (toggle lives in the panel header).
    // Open: a note card at the top of the scroll region.
    if (!this._legendOpen) return '';
    return `<div class="panel-legend" role="note">
      <button class="panel-legend-close" type="button" title="Hide this guide" aria-label="Close guide">×</button>
      <div class="panel-legend-title">How to read this panel</div>
      <ul class="panel-legend-list">
        <li><b>Sector tabs</b> show how decarbonized each part of this country is. Click to focus on one.</li>
        <li><b>Deploy cards</b> spend Credits to push the focused sector up. Repeat deploys of the same card return <b>diminishing</b> gains — diversify.</li>
        <li>Hard policies are <b>gated</b> by Political Will. Build consent first.</li>
        <li>Cross-branch research combos create <b>synergy bonuses</b> on deploys.</li>
      </ul>
    </div>`;
  }

  _render() {
    if (!this.selectedId) {
      this.root.innerHTML = `<div class="panel-title">Country</div>
        <div class="right-scroll"><div class="empty">Click a country on the map to see its sectors and deploy clean tech there.</div></div>`;
      return;
    }
    const c = this.state.countries[this.selectedId];
    if (!c) return;
    const s = this.state;
    const researched = Object.values(s.activities).filter(a => s.world.researched.has(a.id));
    const byBranch = Object.fromEntries(Object.keys(BRANCHES).map(b => [b, researched.filter(a => a.branch === b)]));

    // Sector tabs — one chip per sector, shows icon + % + progress bar. Click
    // swaps the deploy list below. Keeps the tab strip above the fold so the
    // user can jump between sectors without scrolling through 20+ deploy cards.
    const tabs = Object.entries(c.adoption).map(([k, v]) => {
      const pct = (v * 100).toFixed(0);
      const active = k === this.selectedSector;
      const count = byBranch[k]?.length ?? 0;
      return `<button class="sector-tab ${active ? 'active' : ''}" data-sector="${k}" style="--c:${BRANCHES[k].color}" title="${BRANCHES[k].label} · ${pct}% · ${BRANCH_EXPLAIN[k]}" aria-pressed="${active}">
        <span class="sector-tab-head">
          <span class="sector-tab-icon" style="color:${BRANCHES[k].color}">${BRANCHES[k].icon}</span>
          <span class="sector-tab-label">${BRANCHES[k].label}</span>
          ${count > 0 ? `<span class="sector-tab-count" title="${count} deployable">${count}</span>` : ''}
        </span>
        <span class="sector-tab-pct">${pct}%</span>
        <span class="sector-tab-track" aria-hidden="true"><span class="sector-tab-fill" style="width:${pct}%;background:${BRANCHES[k].color}"></span></span>
      </button>`;
    }).join('');

    // Selected-sector detail + deploy list. If no deploys researched yet for
    // this sector, show a helpful nudge pointing back to the left panel.
    const sector = this.selectedSector;
    const sectorActs = byBranch[sector] ?? [];
    const sectorPct = ((c.adoption[sector] ?? 0) * 100).toFixed(0);
    const sectorStage = this._stageLabel(c.adoption[sector] ?? 0);
    const deploysHTML = sectorActs.length
      ? sectorActs.map(a => this._deployCardHTML(c, a)).join('')
      : `<div class="empty">Nothing to deploy in ${BRANCHES[sector].label} yet. Research an activity in this branch to unlock deploys here.</div>`;

    this.root.innerHTML = `
      <div class="panel-title">
        <span>Country</span>
        ${c.isHome ? '<span class="home-badge" title="Your home country. Deploys here cost 25% less.">HOME</span>' : ''}
        <button class="panel-guide-toggle ${this._legendOpen ? 'active' : ''}" type="button" title="${this._legendOpen ? 'Hide' : 'Show'} quick guide" aria-label="Toggle quick guide" aria-pressed="${this._legendOpen}">?</button>
      </div>
      <div class="country-header">
        <div class="country-name-row">
          ${rectFlag(c.id) ? `<img class="country-flag ${isBlocFlag(c.id) ? 'bloc' : ''}" src="${rectFlag(c.id)}" alt="" aria-hidden="true" />` : ''}
          <span class="country-name">${c.name}</span>
          ${c.netZero ? '<span class="nz-badge">NET ZERO</span>' : ''}
        </div>
        <div class="country-meta-row">
          <span class="cm-chip" title="Baseline annual emissions in gigatons of CO₂."><label>Emit</label><b class="cm-emit">${c.baseEmissionsGtCO2.toFixed(2)}</b></span>
          <span class="cm-chip" title="Political Will (0–100). Popular + governmental appetite for climate action."><label>Will</label><b class="cm-will">${c.politicalWill.toFixed(0)}</b></span>
          <span class="cm-chip cm-chip-pop" title="Live population. Natural demographics set the base rate; climate mortality pulls it down past +1.5°C."><label>Pop</label><b class="cm-pop">${formatPopulationFull(c.populationM)}</b><span class="country-pop-delta cm-pop-delta">${formatDelta((c.populationDeltaM ?? 0) * 4)}/yr</span></span>
        </div>
      </div>
      <div class="sector-tabs" role="tablist" aria-label="Sector adoption — click to view deploys">${tabs}</div>
      <div class="right-scroll">
        ${this._legendHTML()}
        <div class="sector-detail">
          <div class="sector-detail-head" style="--c:${BRANCHES[sector].color}">
            <span class="sector-detail-icon" style="color:${BRANCHES[sector].color}">${BRANCHES[sector].icon}</span>
            <div class="sector-detail-meta">
              <div class="sector-detail-name">${BRANCHES[sector].label} · ${sectorPct}%</div>
              <div class="sector-detail-sub"><span class="bar-stage">${sectorStage}</span><span class="sector-detail-explain">${BRANCH_EXPLAIN[sector]}</span></div>
            </div>
          </div>
          <div class="deploys">${deploysHTML}</div>
        </div>
      </div>`;

    this.root.querySelectorAll('.sector-tab').forEach(btn =>
      btn.addEventListener('click', () => {
        const s = btn.dataset.sector;
        if (s === this.selectedSector) return;
        this.selectedSector = s;
        this._render();
      }));

    this.root.querySelectorAll('.deploy-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.adoption.deploy(this.selectedId, this.state.activities[btn.dataset.id]);
      }));

    this.root.querySelector('.panel-legend-close')?.addEventListener('click', () => {
      this._legendOpen = false;
      markLegendDismissed();
      this._render();
    });
    this.root.querySelector('.panel-guide-toggle')?.addEventListener('click', () => {
      this._legendOpen = !this._legendOpen;
      if (!this._legendOpen) markLegendDismissed();
      this._render();
    });

    this._researchedSig = this._researchedKey();
  }

  // Build the full deploy card. Always shows cost + effective yield. Adds
  // synergy badges only if active, diminishing-returns hint only after the
  // first deploy, and a will-gate lock only when gated.
  _deployCardHTML(country, activity) {
    const s = this.state;
    const projection = projectDeploy(s, country, activity);
    const gate = politicalGate(s, country, activity);

    const cp = s.world.climatePoints;
    const canAfford = cp >= projection.effectiveCost;
    const blocked = !gate.allowed || !canAfford;

    const branch = BRANCHES[activity.branch];
    const effectPct = Math.round(projection.effectiveYield * 100);
    const basePct   = Math.round(projection.baseYield * 100);

    const costBadge = projection.effectiveCost !== projection.baseCost
      ? `<span class="deploy-btn-cost deploy-btn-cost-discounted" title="Base ${projection.baseCost} — synergies discounted this deploy">${projection.effectiveCost} ●</span>`
      : `<span class="deploy-btn-cost">${projection.effectiveCost} ●</span>`;

    // Effect row: "+8% Transport (was +15%, diminishing)" or "+15% Transport".
    const effectLine = projection.prevDeploys > 0
      ? `<span class="deploy-btn-effect">+${effectPct}% ${branch.label}</span>
         <span class="deploy-btn-diminish" title="Each repeated deploy of this activity here is less effective. Try a different card to push the sector further.">was +${basePct}% · diminishing</span>`
      : `<span class="deploy-btn-effect">+${effectPct}% ${branch.label}</span>`;

    // Synergies — chip list.
    const synergyChips = projection.synergies.map(s => {
      const parts = [];
      if (s.effect.yieldMult && s.effect.yieldMult !== 1) parts.push(`×${s.effect.yieldMult.toFixed(2)} yield`);
      if (s.effect.costMult  && s.effect.costMult  !== 1) parts.push(`×${s.effect.costMult.toFixed(2)} cost`);
      if (s.effect.willCostMult && s.effect.willCostMult !== 1) parts.push(`×${s.effect.willCostMult.toFixed(2)} will`);
      return `<span class="deploy-synergy" title="${s.label} — ${parts.join(', ')}">${s.label}</span>`;
    }).join('');

    // Will row: gate state + cost.
    let willRow = '';
    if (gate.gated) {
      if (!gate.allowed) {
        willRow = `<div class="deploy-will deploy-will-blocked" title="Political Will too low. Build consent by running friendlier deploys, or wait for events to move Will.">
          <span class="deploy-will-lock">◆ Locked</span>
          <span>Needs Will ${gate.threshold} · have ${Math.round(gate.have)}</span>
        </div>`;
      } else {
        willRow = `<div class="deploy-will" title="Political cost of a hard deploy. Succeeds if Will ≥ threshold, then drains Will by ${gate.willCost}.">
          <span class="deploy-will-lock">◆ Hard policy</span>
          <span>Will ≥ ${gate.threshold} · costs ${gate.willCost} Will</span>
        </div>`;
      }
    }

    // CTA text.
    let cta = 'Deploy';
    if (!gate.allowed) cta = `Locked`;
    else if (!canAfford) cta = `Need ${projection.effectiveCost} ●`;

    // Tooltip summarizes the whole projection.
    const tip = [
      `Deploy ${activity.name} in ${country.name}.`,
      `Cost ${projection.effectiveCost} Credits${country.isHome ? ' (home discount)' : ''}.`,
      `Effect +${effectPct}% ${branch.label}.`,
      projection.prevDeploys > 0 ? `${projection.prevDeploys} prior deploy${projection.prevDeploys === 1 ? '' : 's'} here — yield diminishing.` : '',
      gate.gated && gate.allowed ? `Drains ${gate.willCost} Political Will.` : '',
      gate.gated && !gate.allowed ? `Needs Will ${gate.threshold}, have ${Math.round(gate.have)}.` : '',
      projection.synergies.length ? `Synergies: ${projection.synergies.map(s => s.label).join(' · ')}.` : '',
    ].filter(Boolean).join(' ');

    return `<button class="deploy-btn ${blocked ? 'blocked' : ''} ${!gate.allowed ? 'gate-blocked' : ''}" ${blocked ? 'disabled' : ''} data-id="${activity.id}" title="${tip.replace(/"/g, '&quot;')}">
      <div class="deploy-btn-head">
        <span class="deploy-btn-name">${activity.name}</span>
        ${costBadge}
      </div>
      <div class="deploy-btn-desc">${activity.desc}</div>
      ${synergyChips ? `<div class="deploy-btn-synergies">${synergyChips}</div>` : ''}
      ${willRow}
      <div class="deploy-btn-foot">
        <span class="deploy-btn-effect-row">${effectLine}</span>
        <span class="deploy-btn-cta">${cta}</span>
      </div>
    </button>`;
  }

  _stageLabel(v) {
    if (v >= 0.85) return 'Decarbonized';
    if (v >= 0.6)  return 'Mainstream';
    if (v >= 0.35) return 'Scaling';
    if (v >= 0.15) return 'Emerging';
    if (v > 0)     return 'Pilot';
    return 'Not started';
  }

  _updateSoft() {
    if (!this.selectedId) return;
    if (this._researchedKey() !== this._researchedSig) { this._render(); return; }
    const c = this.state.countries[this.selectedId];
    if (!c) return;

    // Patch sector-tab percentages + progress bars in place.
    for (const tabEl of this.root.querySelectorAll('.sector-tab[data-sector]')) {
      const k = tabEl.dataset.sector;
      const v = c.adoption[k] ?? 0;
      const pct = (v * 100).toFixed(0);
      const fill = tabEl.querySelector('.sector-tab-fill');
      if (fill) fill.style.width = `${pct}%`;
      const pctEl = tabEl.querySelector('.sector-tab-pct');
      if (pctEl) pctEl.textContent = `${pct}%`;
    }

    // Patch the currently-visible sector detail header.
    const sector = this.selectedSector;
    const v = c.adoption[sector] ?? 0;
    const sectorName = this.root.querySelector('.sector-detail-name');
    if (sectorName) sectorName.textContent = `${BRANCHES[sector].label} · ${(v * 100).toFixed(0)}%`;
    const sectorStage = this.root.querySelector('.sector-detail-head .bar-stage');
    if (sectorStage) sectorStage.textContent = this._stageLabel(v);

    const emit = this.root.querySelector('.cm-emit');
    if (emit) emit.textContent = c.baseEmissionsGtCO2.toFixed(2);
    const will = this.root.querySelector('.cm-will');
    if (will) will.textContent = c.politicalWill.toFixed(0);

    const pop = this.root.querySelector('.cm-pop');
    if (pop) pop.textContent = formatPopulationFull(c.populationM);
    const popDelta = this.root.querySelector('.cm-pop-delta');
    if (popDelta) {
      const annualDelta = (c.populationDeltaM ?? 0) * 4;
      popDelta.textContent = `${formatDelta(annualDelta)}/yr`;
      popDelta.classList.remove('up', 'down', 'flat');
      popDelta.classList.add(annualDelta > 0.0005 ? 'up' : annualDelta < -0.0005 ? 'down' : 'flat');
    }

    // Deploy cards — re-project each button and patch its contents in place.
    // Avoids a full innerHTML rewrite on every tick (which would lose focus
    // and fight CSS animations).
    for (const btn of this.root.querySelectorAll('.deploy-btn[data-id]')) {
      const a = this.state.activities[btn.dataset.id];
      if (!a) continue;
      this._patchDeployCard(btn, c, a);
    }
  }

  _patchDeployCard(btn, country, activity) {
    const s = this.state;
    const projection = projectDeploy(s, country, activity);
    const gate = politicalGate(s, country, activity);
    const cp = s.world.climatePoints;
    const canAfford = cp >= projection.effectiveCost;
    const blocked = !gate.allowed || !canAfford;

    btn.disabled = blocked;
    btn.classList.toggle('blocked', blocked);
    btn.classList.toggle('gate-blocked', !gate.allowed);

    const costEl = btn.querySelector('.deploy-btn-cost');
    if (costEl) costEl.textContent = `${projection.effectiveCost} ●`;

    const ctaEl = btn.querySelector('.deploy-btn-cta');
    if (ctaEl) {
      if (!gate.allowed) ctaEl.textContent = 'Locked';
      else if (!canAfford) ctaEl.textContent = `Need ${projection.effectiveCost} ●`;
      else ctaEl.textContent = 'Deploy';
    }
  }

  _onDeployFailed({ country, activity, reason, cost, threshold, have }) {
    if (country && country.id !== this.selectedId) return;
    const msg = {
      insufficient_cp: `Need ${cost ?? ''} Credits for ${activity?.name ?? 'this deploy'}.`,
      not_researched:  `Research ${activity?.name ?? 'this'} first.`,
      no_country:      'Pick a country first.',
      no_activity:     'No activity selected.',
      will_gate:       `Political Will too low for ${activity?.name ?? 'this'} (need ${threshold}, have ${Math.round(have ?? 0)}). Build consent first.`,
    }[reason] ?? 'Deploy failed.';
    showToast("Can't deploy", msg, 'bad');

    const btn = activity && this.root.querySelector(`.deploy-btn[data-id="${activity.id}"]`);
    if (btn) {
      btn.classList.remove('gp-shake');
      // eslint-disable-next-line no-unused-expressions
      btn.offsetWidth; // reflow → restart animation
      btn.classList.add('gp-shake');
      setTimeout(() => btn.classList.remove('gp-shake'), 400);
    }
  }
}
