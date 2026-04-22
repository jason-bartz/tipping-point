// Left-panel host. Owns the tab strip that switches between the Research
// tree and the Council (advisor board). Mirrors RightPanel's shape so the
// two sidebars read as a matched pair.
//
// Keeping this thin on purpose — it's a router, not a presenter.

const TABS = [
  { id: 'research', label: 'Research' },
  { id: 'council',  label: 'Council'  },
];

export class LeftPanel {
  constructor(root) {
    this.root = root;
    this.active = 'research';

    this.root.classList.add('left-panel-host');
    this.root.innerHTML =
      `<div class="left-tabs" role="tablist" aria-label="Left panel views"></div>
       <div class="left-body">
         <div class="left-view" data-view="research" role="tabpanel"></div>
         <div class="left-view" data-view="council"  role="tabpanel" hidden></div>
       </div>`;

    this.tabStrip = this.root.querySelector('.left-tabs');
    this.views = {
      research: this.root.querySelector('[data-view="research"]'),
      council:  this.root.querySelector('[data-view="council"]'),
    };

    this._renderTabs();
  }

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
  }

  _renderTabs() {
    this.tabStrip.innerHTML = TABS.map(t => `
      <button type="button" class="rt-tab ${t.id === this.active ? 'active' : ''}"
              data-view="${t.id}" role="tab"
              aria-selected="${t.id === this.active ? 'true' : 'false'}">
        <span class="rt-tab-label">${t.label}</span>
      </button>`).join('');
    for (const btn of this.tabStrip.querySelectorAll('.rt-tab')) {
      btn.addEventListener('click', () => this.setActive(btn.dataset.view));
    }
  }

  destroy() {
    // Nothing to unbind — sub-panels manage their own lifecycle.
  }
}
