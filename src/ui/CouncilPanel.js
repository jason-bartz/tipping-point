// Floating cabinet strip pinned to the lower-left of the map. Shows four
// portrait chips — mood ring, name, current one-liner, influence bar, and
// current agenda (with progress). Clicking a chip expands a detail card that
// offers the signature ability button once influence ≥ 80.
//
// Rendering strategy mirrors HUD / ResearchTree: skeleton once, text/class
// updates per tick. No innerHTML on the hot path.

import { EVT } from '../core/EventBus.js';
import { BALANCE } from '../config/balance.js';
import { ADVISOR_IDS, ABILITIES, ADVISOR_ARCHETYPES } from '../data/advisors.js';
import { agendaDef } from '../model/Advisors.js';

const MOOD_COPY = {
  confident: { label: 'Confident', dot: '#22c55e' },
  neutral:   { label: 'Steady',    dot: '#facc15' },
  worried:   { label: 'Worried',   dot: '#f59e0b' },
  alarmed:   { label: 'Alarmed',   dot: '#ef4444' },
};

export class CouncilPanel {
  constructor(container, state, bus, advisorSystem) {
    this.s = state;
    this.b = bus;
    this.advisorSystem = advisorSystem;
    this.container = container;
    this.expandedId = null;

    this.root = document.createElement('div');
    // Default to collapsed so the Council doesn't obscure the map on load —
    // the toggle chip stays visible at the bottom-left for the player to
    // open when they want to check agendas.
    this.root.className = 'council-panel collapsed';
    this.root.setAttribute('aria-label', 'Advisory Board');

    this.toggle = document.createElement('button');
    this.toggle.className = 'council-toggle';
    this.toggle.type = 'button';
    this.toggle.textContent = '▲ Council';
    this.toggle.title = 'Show or hide the Advisory Board.';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.addEventListener('click', () => this._toggleCollapsed());
    this.root.appendChild(this.toggle);

    this.strip = document.createElement('div');
    this.strip.className = 'council-strip';
    this.root.appendChild(this.strip);

    this.detail = document.createElement('div');
    this.detail.className = 'council-detail';
    this.detail.hidden = true;
    this.root.appendChild(this.detail);

    this.seatEls = new Map();
    for (const id of ADVISOR_IDS) {
      const el = this._buildSeat(id);
      this.strip.appendChild(el);
      this.seatEls.set(id, el);
    }

    container.appendChild(this.root);

    this._unsubs = [
      bus.on(EVT.TICK, () => this.update()),
      bus.on(EVT.ADVISOR_MOOD_CHANGED, () => this.update()),
      bus.on(EVT.ADVISOR_AGENDA_PROPOSED, () => this.update()),
      bus.on(EVT.ADVISOR_AGENDA_RESOLVED, () => this.update()),
      bus.on(EVT.ADVISOR_ABILITY_USED, () => this.update()),
      bus.on(EVT.COUNTRY_SELECTED, () => this.update()),
    ];
    this.update();
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this.root?.remove();
    this.seatEls.clear();
  }

  _toggleCollapsed() {
    const collapsed = this.root.classList.toggle('collapsed');
    this.toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    this.toggle.textContent = collapsed ? '▲ Council' : '▼ Council';
  }

  _buildSeat(id) {
    const seat = this.s.advisors?.seats?.[id];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'council-seat';
    el.setAttribute('data-id', id);
    el.style.setProperty('--advisor', seat?.color ?? '#888');
    el.innerHTML = `
      <span class="council-portrait" aria-hidden="true">
        <img class="council-portrait-img" alt="" src="${seat?.portrait ?? ''}" loading="lazy" decoding="async">
      </span>
      <span class="council-seat-body">
        <span class="council-seat-name"></span>
        <span class="council-seat-line"></span>
        <span class="council-seat-meters">
          <span class="council-influence" title="Influence — rises when their agendas succeed, unlocks signature ability at 80."><span class="council-inf-fill"></span></span>
        </span>
        <span class="council-seat-agenda"></span>
      </span>
      <span class="council-mood-dot" aria-hidden="true"></span>`;
    el.addEventListener('click', () => this._toggleDetail(id));
    return el;
  }

  _toggleDetail(id) {
    if (this.expandedId === id) { this.expandedId = null; this.detail.hidden = true; return; }
    this.expandedId = id;
    this.detail.hidden = false;
    this._renderDetail();
  }

  update() {
    const advisors = this.s.advisors;
    if (!advisors) return;
    for (const id of ADVISOR_IDS) {
      const seat = advisors.seats[id];
      const el = this.seatEls.get(id);
      if (!seat || !el) continue;
      this._renderSeat(el, seat);
    }
    if (this.expandedId) this._renderDetail();
  }

  _renderSeat(el, seat) {
    const img = el.querySelector('.council-portrait-img');
    if (img && img.getAttribute('src') !== seat.portrait) img.setAttribute('src', seat.portrait);
    el.querySelector('.council-seat-name').textContent = seat.name;
    el.querySelector('.council-seat-line').textContent = seat.commentary || seat.tagline || '';
    const infFill = el.querySelector('.council-inf-fill');
    infFill.style.width = `${Math.max(3, Math.min(100, Math.round(seat.influence)))}%`;
    infFill.style.background = seat.color;

    const mood = MOOD_COPY[seat.mood] ?? MOOD_COPY.neutral;
    const dot = el.querySelector('.council-mood-dot');
    dot.style.background = mood.dot;
    dot.title = `${seat.title} — ${mood.label}`;

    const agenda = seat.agenda;
    const agendaEl = el.querySelector('.council-seat-agenda');
    if (agenda) {
      const pct = this._agendaPctText(seat.id, agenda);
      const remain = Math.max(0, agenda.deadline - this.s.meta.tick);
      agendaEl.textContent = `${agenda.text} — ${pct} (${remain}q left)`;
      agendaEl.classList.add('active');
    } else {
      const now = this.s.meta.tick;
      const cd = (seat.cooldownUntilTick ?? 0) - now;
      agendaEl.textContent = cd > 0 ? `No proposal (quiet for ${cd}q).` : 'Considering next move…';
      agendaEl.classList.remove('active');
    }
  }

  _agendaPctText(id, agenda) {
    const def = agendaDef(id, agenda.id);
    if (!def) return '—';
    const raw = def.progress(this.s, agenda.snap);
    const pct = Math.max(0, Math.min(1, raw));
    return `${Math.round(pct * 100)}%`;
  }

  _renderDetail() {
    if (!this.expandedId) { this.detail.hidden = true; return; }
    const seat = this.s.advisors?.seats?.[this.expandedId];
    if (!seat) { this.detail.hidden = true; return; }
    const archetype = ADVISOR_ARCHETYPES[seat.id];
    const ability = ABILITIES[archetype?.abilityId];
    const readyAt = seat.abilityReadyAtTick ?? 0;
    const cdLeft = Math.max(0, readyAt - this.s.meta.tick);
    const canUse = this.advisorSystem.canUseAbility(seat.id);
    const lockReason = (() => {
      if (seat.influence < BALANCE.advisor.abilityInfluenceThreshold) {
        return `Locked — needs ${BALANCE.advisor.abilityInfluenceThreshold}+ influence (currently ${Math.round(seat.influence)}).`;
      }
      if (cdLeft > 0) return `On cooldown for ${cdLeft} quarters.`;
      return 'Ready.';
    })();

    this.detail.innerHTML = `
      <div class="council-detail-head">
        <span class="council-detail-portrait" aria-hidden="true">
          <img class="council-detail-portrait-img" alt="" src="${seat.portrait}" decoding="async">
        </span>
        <div>
          <div class="council-detail-name">${seat.name}</div>
          <div class="council-detail-title">${seat.title}</div>
          <div class="council-detail-line">“${seat.commentary || seat.tagline}”</div>
        </div>
      </div>
      <div class="council-detail-stats">
        <div><b>Influence</b> ${Math.round(seat.influence)} / 100</div>
        <div><b>Mood</b> ${MOOD_COPY[seat.mood]?.label ?? '—'}</div>
      </div>
      <div class="council-detail-ability">
        <div class="council-ability-head"><b>${ability?.label ?? 'Signature'}</b> — ${ability?.hint ?? ''}</div>
        <div class="council-ability-status">${lockReason}</div>
        <button class="council-ability-btn" ${canUse ? '' : 'disabled'}>${canUse ? 'Use Ability' : 'Unavailable'}</button>
      </div>`;

    const btn = this.detail.querySelector('.council-ability-btn');
    btn.addEventListener('click', () => {
      if (this.advisorSystem.useAbility(seat.id)) {
        this.update();
      }
    });
  }
}
