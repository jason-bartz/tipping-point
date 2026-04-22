// Advisors panel. Lives inside the left sidebar's Advisors tab as a vertical
// list of advisor seats — portrait, mood dot, name, one-liner, influence
// bar, and active agenda. Clicking a seat expands a detail card beneath it
// with the signature-ability button (unlocks at 80 influence).
//
// Rendering strategy mirrors HUD / ResearchTree: skeleton once, text/class
// updates per tick. No innerHTML on the hot path.

import { EVT } from '../core/EventBus.js';
import { BALANCE } from '../config/balance.js';
import { ADVISOR_IDS, ABILITIES, ADVISOR_ARCHETYPES } from '../data/advisors.js';
import { agendaDef } from '../model/Advisors.js';

// Mood colors live in CSS (:root --mood-* + .council-mood-dot.mood-{key}).
// This map is display-only — pair each mood with its label.
const MOOD_COPY = {
  confident: { label: 'Confident' },
  neutral:   { label: 'Steady'    },
  worried:   { label: 'Worried'   },
  alarmed:   { label: 'Alarmed'   },
};

export class CouncilPanel {
  constructor(container, state, bus, advisorSystem) {
    this.s = state;
    this.b = bus;
    this.advisorSystem = advisorSystem;
    this.container = container;
    this.expandedId = null;

    // The left-panel tab host owns layout; this root just holds the seat
    // list + the expanded-detail slot. No toggle — tab switching handles
    // show/hide at the host level.
    this.root = document.createElement('div');
    this.root.className = 'council-panel';
    this.root.setAttribute('aria-label', 'Advisory Board');

    this.strip = document.createElement('div');
    this.strip.className = 'council-list';
    this.root.appendChild(this.strip);

    // Expanded detail lives beneath the clicked seat — we attach it to the
    // DOM inline after the seat element in _toggleDetail().
    this.detail = document.createElement('div');
    this.detail.className = 'council-detail';
    this.detail.hidden = true;

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
      bus.on(EVT.ADVISOR_WHISPER, () => this.update()),
      bus.on(EVT.COUNTRY_SELECTED, () => this.update()),
      // Re-render the expanded detail when a new dispatch lands for the
      // currently-expanded advisor so their comment stream stays live.
      bus.on(EVT.DISPATCH_LOGGED, (d) => {
        if (d?.advisorId && d.advisorId === this.expandedId) this._renderDetail();
      }),
    ];
    this.update();
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this.root?.remove();
    this.seatEls.clear();
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
    // Collapse if clicking the already-open seat.
    if (this.expandedId === id) {
      this.expandedId = null;
      this.detail.hidden = true;
      this.detail.remove();
      for (const el of this.seatEls.values()) el.classList.remove('expanded');
      return;
    }
    this.expandedId = id;
    // Re-anchor the detail card immediately beneath the clicked seat so the
    // expanded content reads as "belonging to" that advisor.
    const seatEl = this.seatEls.get(id);
    if (seatEl) {
      seatEl.insertAdjacentElement('afterend', this.detail);
      for (const el of this.seatEls.values()) el.classList.toggle('expanded', el === seatEl);
    }
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

    const moodKey = MOOD_COPY[seat.mood] ? seat.mood : 'neutral';
    const mood = MOOD_COPY[moodKey];
    const dot = el.querySelector('.council-mood-dot');
    dot.className = `council-mood-dot mood-${moodKey}`;
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

    // Recent comments attributed to this advisor — pulled from the dispatch
    // log by advisorId. Oldest first (chronological) so newest sits at the
    // bottom, closest to the ability button.
    const comments = (this.s.meta.dispatches ?? [])
      .filter(d => d.advisorId === seat.id)
      .slice(0, 8); // newest-first; cap to 8
    const commentsHTML = comments.length
      ? `<div class="council-detail-comments">
           <div class="council-detail-comments-head">Recent comments</div>
           <ul class="council-comment-list">
             ${comments.map(d => `<li class="council-comment tone-${d.tone}">
               <span class="council-comment-when">Q${d.quarter} ${d.year}</span>
               <span class="council-comment-body">${d.body || d.title}</span>
             </li>`).join('')}
           </ul>
         </div>`
      : '';

    this.detail.innerHTML = `
      <div class="council-detail-head">
        <div class="council-detail-title">${seat.title}</div>
        <div class="council-detail-line">“${seat.commentary || seat.tagline}”</div>
      </div>
      <div class="council-detail-stats">
        <div><b>Influence</b> ${Math.round(seat.influence)} / 100</div>
        <div><b>Mood</b> ${MOOD_COPY[seat.mood]?.label ?? '—'}</div>
      </div>
      ${commentsHTML}
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
