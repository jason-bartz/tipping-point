// Dispatches panel. Persistent log of every meaningful beat — events, news
// ticker items, research completions, advisor whispers, milestones, and the
// big one: pending interactive decisions, which land here as "needs action"
// cards instead of as auto-popping modals.
//
// The panel owns its own scroll region, filter chip strip, and per-card
// expand/collapse. Rendering is cheap: we rebuild the list DOM on every
// relevant change because the dispatches array is capped at 250. A signature
// check skips the rebuild when nothing visible has changed — important when
// ticks fire DISPATCH_UNREAD_CHANGED from read-marking alone.

import { EVT } from '../core/EventBus.js';
import {
  DISPATCH_FILTERS,
  filteredDispatches,
  markRead,
  markAllRead,
  unreadCount,
} from '../model/Dispatches.js';

const KIND_LABELS = {
  decision:  'DECISION',
  event:     'EVENT',
  news:      'NEWS',
  research:  'RESEARCH',
  milestone: 'MILESTONE',
  advisor:   'ADVISOR',
  deploy:    'DEPLOY',
  system:    'SYSTEM',
};

export class DispatchesPanel {
  constructor(root, state, bus, { onOpenDecision } = {}) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    this.onOpenDecision = onOpenDecision || (() => {});
    this.filter = 'all';
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
    const total = this.state.meta.dispatches?.length ?? 0;
    const unread = unreadCount(this.state);
    this.root.innerHTML = `
      <div class="panel-title dispatches-title">
        <span>Dispatches</span>
        <span class="dispatches-count" title="${unread} unread of ${total} total">${unread}/${total}</span>
        <button class="dispatches-mark-all" type="button" title="Mark every non-pending dispatch as read"${unread === 0 ? ' disabled' : ''}>Mark all read</button>
      </div>
      <div class="dispatch-filters" role="tablist" aria-label="Filter dispatches">
        ${DISPATCH_FILTERS.map(f => `
          <button class="df-chip ${f.id === this.filter ? 'active' : ''}" type="button"
                  data-filter="${f.id}" role="tab"
                  aria-selected="${f.id === this.filter ? 'true' : 'false'}">
            ${f.label}
          </button>`).join('')}
      </div>
      <div class="dispatch-list right-scroll" role="list"></div>`;

    this.listEl = this.root.querySelector('.dispatch-list');

    for (const btn of this.root.querySelectorAll('.df-chip')) {
      btn.addEventListener('click', () => {
        if (this.filter === btn.dataset.filter) return;
        this.filter = btn.dataset.filter;
        for (const b of this.root.querySelectorAll('.df-chip')) {
          const on = b.dataset.filter === this.filter;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        }
        this._lastSig = ''; // force rebuild
        this._renderList();
      });
    }

    this.root.querySelector('.dispatches-mark-all')?.addEventListener('click', () => {
      if (markAllRead(this.state, this.bus) > 0) this._renderList();
    });

    this._lastSig = '';
    this._renderList();
  }

  _sig() {
    const arr = filteredDispatches(this.state, this.filter);
    // Lightweight: length + first id + first read-state flags. When any
    // dispatch lands or flips, the head of the array changes → sig changes.
    const head = arr[0];
    const unread = unreadCount(this.state);
    return `${arr.length}|${head?.id || ''}|${head?.read ? 1 : 0}|${head?.needsAction ? 1 : 0}|${unread}|${this.filter}|${[...this.expanded].join(',')}`;
  }

  _renderList() {
    if (!this.listEl) return;
    const sig = this._sig();
    if (sig === this._lastSig) {
      // Still update the count chip in the header so it ticks even when the
      // list body is unchanged (filter-scoped count).
      this._updateHeaderCount();
      return;
    }
    this._lastSig = sig;
    this._updateHeaderCount();

    const arr = filteredDispatches(this.state, this.filter);
    if (!arr.length) {
      this.listEl.innerHTML = `<div class="dispatch-empty">No dispatches here yet. Play on — events, decisions, and news will land in this log.</div>`;
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
    const total = this.state.meta.dispatches?.length ?? 0;
    const unread = unreadCount(this.state);
    const countEl = this.root.querySelector('.dispatches-count');
    if (countEl) {
      countEl.textContent = `${unread}/${total}`;
      countEl.title = `${unread} unread of ${total} total`;
    }
    const mark = this.root.querySelector('.dispatches-mark-all');
    if (mark) mark.disabled = unread === 0;
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
    const kindLabel = KIND_LABELS[d.kind] || d.kind.toUpperCase();
    const isExpanded = this.expanded.has(d.id);
    const cls = [
      'dispatch-card',
      `tone-${d.tone}`,
      `kind-${d.kind}`,
      d.read ? 'read' : 'unread',
      d.needsAction ? 'needs-action' : '',
      isExpanded ? 'expanded' : '',
    ].filter(Boolean).join(' ');
    const body = d.body ? `<div class="dispatch-body">${d.body}</div>` : '';
    const detail = d.detail ? `<div class="dispatch-detail">${d.detail}</div>` : '';
    const actionLabel = d.needsAction ? 'Decide' : (isExpanded ? 'Collapse' : 'Expand');
    const actionCls   = d.needsAction ? 'dispatch-action action-decide' : 'dispatch-action';
    return `<div class="${cls}" data-id="${d.id}" role="listitem" tabindex="0"
                 aria-expanded="${isExpanded ? 'true' : 'false'}">
      <div class="dispatch-card-head">
        <span class="dispatch-kind-chip kind-${d.kind}">${kindLabel}</span>
        ${d.needsAction ? `<span class="dispatch-urgent">NEEDS ACTION</span>` : ''}
        <span class="dispatch-when">Q${d.quarter} ${d.year}</span>
        ${!d.read ? `<span class="dispatch-unread-dot" aria-label="Unread"></span>` : ''}
      </div>
      <div class="dispatch-title">${d.title || '(untitled)'}</div>
      ${isExpanded ? body : ''}
      ${isExpanded && detail ? detail : ''}
      ${(body || d.needsAction) ? `<button type="button" class="${actionCls}" data-id="${d.id}">${actionLabel}</button>` : ''}
    </div>`;
  }
}
