// Right-panel host. Owns the tab strip that switches between the Country
// view (deploys + adoption) and the Dispatches view (persistent event log).
// Each tab's body is a sibling <div> inside #right-panel; only the active
// one is visible, so the subordinate CountryPanel / DispatchesPanel both
// manage their own content without knowing about the other.
//
// Keeping this thin on purpose — it's a router, not a presenter. If we ever
// add a third tab (research summary, history charts, etc.) we drop another
// entry into the TABS array and mount a matching body.

import { EVT } from '../core/EventBus.js';
import { pendingDecisionCount } from '../model/Dispatches.js';

const TABS = [
  { id: 'country',    label: 'Country' },
  { id: 'dispatches', label: 'Decisions' },
];

export class RightPanel {
  constructor(root, state, bus) {
    this.root = root;
    this.state = state;
    this.bus = bus;
    this.active = 'country';

    // Skeleton: tab strip + body with one host div per tab. Sub-panels
    // mount into the body hosts — CountryPanel already expects its root
    // to behave like the old #right-panel (flex column), which .right-view
    // replicates in CSS.
    this.root.classList.add('right-panel-host');
    this.root.innerHTML =
      `<div class="right-tabs" role="tablist" aria-label="Right panel views"></div>
       <div class="right-body">
         <div class="right-view" data-view="country" role="tabpanel"></div>
         <div class="right-view" data-view="dispatches" role="tabpanel" hidden></div>
       </div>`;

    this.tabStrip = this.root.querySelector('.right-tabs');
    this.bodyEl   = this.root.querySelector('.right-body');
    this.views = {
      country:    this.root.querySelector('[data-view="country"]'),
      dispatches: this.root.querySelector('[data-view="dispatches"]'),
    };

    this._renderTabs();
    this._updateBadges();

    this._unsubs = [
      this.bus.on(EVT.DISPATCH_LOGGED,         (d) => this._onDispatch(d)),
      this.bus.on(EVT.DISPATCH_UNREAD_CHANGED, () => this._updateBadges()),
    ];
  }

  // Sub-panels call this to get their mount node. Returns the body host for
  // the named tab; callers should only touch what's inside.
  mountPoint(viewId) {
    return this.views[viewId] ?? null;
  }

  setActive(viewId) {
    if (!TABS.find(t => t.id === viewId)) return;
    if (viewId === this.active) return;
    this.active = viewId;
    for (const [id, el] of Object.entries(this.views)) el.hidden = id !== viewId;
    for (const btn of this.tabStrip.querySelectorAll('.rt-tab')) {
      const on = btn.dataset.view === viewId;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    this.bus.emit('rightPanelTabChanged', { view: viewId });
  }

  _renderTabs() {
    this.tabStrip.innerHTML = TABS.map(t => `
      <button type="button" class="rt-tab ${t.id === this.active ? 'active' : ''}"
              data-view="${t.id}" role="tab"
              aria-selected="${t.id === this.active ? 'true' : 'false'}">
        <span class="rt-tab-label">${t.label}</span>
        <span class="rt-tab-badge" hidden>0</span>
        <span class="rt-tab-dot" aria-hidden="true" hidden></span>
      </button>`).join('');
    for (const btn of this.tabStrip.querySelectorAll('.rt-tab')) {
      btn.addEventListener('click', () => this.setActive(btn.dataset.view));
    }
  }

  _onDispatch(record) {
    this._updateBadges();
    // Only a pending decision draws attention — everything else is a
    // quiet log entry. No flash on routine beats.
    const tab = this.tabStrip.querySelector('.rt-tab[data-view="dispatches"]');
    if (!tab) return;
    if (this.active === 'dispatches') return;
    if (record.needsAction) {
      tab.classList.add('rt-tab-urgent');
    }
  }

  _updateBadges() {
    const tab = this.tabStrip.querySelector('.rt-tab[data-view="dispatches"]');
    if (!tab) return;
    const badge = tab.querySelector('.rt-tab-badge');
    const dot   = tab.querySelector('.rt-tab-dot');
    const pending = pendingDecisionCount(this.state);
    // Badge stays hidden — the tab is decisions-only now and we don't want
    // to nag about already-answered log entries. The pulsing dot alone
    // signals "something needs you" when a decision is pending.
    if (badge) badge.hidden = true;
    if (dot) dot.hidden = pending === 0;
    tab.classList.toggle('rt-tab-urgent', pending > 0);
  }

  destroy() {
    this._unsubs.forEach(u => u?.());
    this._unsubs = [];
  }
}
