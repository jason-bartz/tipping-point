// Decisions panel. Interactive-event log — only entries where the player
// was asked to choose something. Answered decisions stay on the list so the
// player can read what they chose; pending ones pulse quietly at the top.
//
// Event / research / advisor / milestone dispatches still hit the log via
// logDispatch so the state keeps a full history, but they don't surface
// here. Advisor comments are attributed per-seat in the Advisors tab.

import { EVT } from '../core/EventBus.js';
import {
  markRead,
  pendingDecisionCount,
} from '../model/Dispatches.js';
import { formatSeconds } from '../systems/helpers.js';

export class DispatchesPanel {
  constructor(root, state, bus, { onOpenDecision } = {}) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    this.onOpenDecision = onOpenDecision || (() => {});
    this.expanded = new Set();   // ids of expanded cards
    this._lastSig = '';

    this.root.classList.add('dispatches-panel-root');
    this._render();

    this._unsubs = [
      this.bus.on(EVT.DISPATCH_LOGGED,         () => this._renderList()),
      this.bus.on(EVT.DISPATCH_UNREAD_CHANGED, () => this._renderList()),
      this.bus.on(EVT.DECISION_RESOLVED,       () => this._renderList()),
      this.bus.on(EVT.TICK, () => {
        // Cheap: only re-render if quarter ticked over (date labels change).
        // Skipped when sig unchanged inside _renderList.
        this._renderList();
      }),
    ];
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this._unsubs = [];
  }

  _render() {
    this.root.innerHTML = `
      <div class="dispatch-list right-scroll" role="list"></div>`;

    this.listEl = this.root.querySelector('.dispatch-list');

    this._lastSig = '';
    this._renderList();
  }

  _decisions() {
    const arr = this.state.meta.dispatches ?? [];
    return arr.filter(d => d.kind === 'decision');
  }

  _sig() {
    const arr = this._decisions();
    const head = arr[0];
    const pending = pendingDecisionCount(this.state);
    // Include the current tick in the sig so the countdown chip on each
    // pending card re-renders every tick (text changes from "3q" → "2q").
    return `${arr.length}|${head?.id || ''}|${head?.read ? 1 : 0}|${head?.needsAction ? 1 : 0}|${pending}|${this.state.meta.tick}|${[...this.expanded].join(',')}`;
  }

  _renderList() {
    if (!this.listEl) return;
    const sig = this._sig();
    if (sig === this._lastSig) {
      this._updateHeaderCount();
      return;
    }
    this._lastSig = sig;
    this._updateHeaderCount();

    const arr = this._decisions();
    if (!arr.length) {
      this.listEl.innerHTML = `<div class="dispatch-empty">No decisions to make right now. When the advisors need your call, it'll land here.</div>`;
      return;
    }

    this.listEl.innerHTML = arr.map(d => this._cardHTML(d)).join('');

    // Card interactions — click expands/collapses (and marks read on first
    // open); Decide button opens the event modal, staying on this tab.
    for (const card of this.listEl.querySelectorAll('.dispatch-card')) {
      const id = card.dataset.id;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.dispatch-action')) return; // button handles itself
        this._toggleExpanded(id);
      });
    }
    for (const btn of this.listEl.querySelectorAll('.dispatch-action')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const d = this.state.meta.dispatches?.find(x => x.id === id);
        if (!d) return;
        if (d.needsAction && d.eventId) this.onOpenDecision(d.eventId);
        else this._toggleExpanded(id);
      });
    }
  }

  _updateHeaderCount() {
    const pending = pendingDecisionCount(this.state);
    const countEl = this.root.querySelector('.dispatches-count');
    if (countEl) {
      countEl.textContent = pending ? `${pending} pending` : '';
      countEl.title = `${pending} awaiting your call`;
    }
  }

  _toggleExpanded(id) {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      this.expanded.add(id);
      markRead(this.state, this.bus, id); // opening = read
    }
    // Sig includes expanded set, so force-ish rebuild.
    this._lastSig = '';
    this._renderList();
  }

  _cardHTML(d) {
    const isExpanded = this.expanded.has(d.id);
    const cls = [
      'dispatch-card',
      `tone-${d.tone}`,
      'kind-decision',
      d.read ? 'read' : 'unread',
      d.needsAction ? 'needs-action' : (d.expired ? 'expired' : 'answered'),
      isExpanded ? 'expanded' : '',
    ].filter(Boolean).join(' ');
    const body = d.body ? `<div class="dispatch-body">${d.body}</div>` : '';
    const detail = d.detail ? `<div class="dispatch-detail">${d.detail}</div>` : '';
    const actionLabel = d.needsAction ? 'Decide' : (isExpanded ? 'Collapse' : 'Expand');
    const actionCls   = d.needsAction ? 'dispatch-action action-decide' : 'dispatch-action';
    const pendingDot = d.needsAction ? `<span class="dispatch-pending-dot" aria-label="Awaiting decision"></span>` : '';
    // Countdown chip on pending decisions. Turns urgent within 2 ticks
    // of expiry, and disappears when the decision is answered or expired.
    let timerChip = '';
    if (d.needsAction && d.expiresAtTick != null) {
      const remaining = Math.max(0, d.expiresAtTick - this.state.meta.tick);
      const urgent = remaining <= 2;
      const label = `${formatSeconds(remaining, this.state)} left`;
      timerChip = `<span class="dispatch-timer ${urgent ? 'urgent' : ''}" title="Time until this decision expires with consequences">${label}</span>`;
    } else if (d.expired) {
      timerChip = `<span class="dispatch-timer expired" title="This decision ran out of time">Expired</span>`;
    }
    // Thematic category chip. Today only "unintended" is wired — a tag for
    // decisions where any choice tends to produce backfire consequences, so
    // the player can recognize the pattern before reading each echo.
    const categoryChip = d.category === 'unintended'
      ? `<span class="dispatch-category unintended" title="Every path here carries backfire risk. Read the echoes.">Unintended</span>`
      : '';
    return `<div class="${cls}" data-id="${d.id}" role="listitem" tabindex="0"
                 aria-expanded="${isExpanded ? 'true' : 'false'}">
      <div class="dispatch-card-head">
        <span class="dispatch-when">Q${d.quarter} ${d.year}</span>
        ${timerChip}
        ${categoryChip}
        ${pendingDot}
      </div>
      <div class="dispatch-title">${d.title || '(untitled)'}</div>
      ${isExpanded ? body : ''}
      ${isExpanded && detail ? detail : ''}
      ${(body || d.needsAction) ? `<button type="button" class="${actionCls}" data-id="${d.id}">${actionLabel}</button>` : ''}
    </div>`;
  }
}
