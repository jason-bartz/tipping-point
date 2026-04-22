// Left panel. Branch tabs + a readable stacked-card tech tree. Click a card
// to focus it; the sticky footer shows full details (description, prereq
// chain, research button).
//
// Layout: one branch visible at a time. Activities in that branch render
// as full-width horizontal cards grouped under tier headers (Entry → Scale
// → Transform → Capstone). Each card puts the cost, time, adoption yield,
// and status on-screen so the player doesn't have to click-to-learn. The
// previous icon-tile grid with SVG connectors is gone — at 72 px wide tiles
// the tree was impossible to read; prereqs surface inline as "Needs: X"
// on locked cards, which is clearer than connector lines at this density.
//
// Performance: card DOM rebuilds only when the branch switches or the
// researched/in-progress set changes. Per-tick only patches status classes
// + the detail card.

import { EVT } from '../core/EventBus.js';
import { BRANCHES, ACTIVITIES, TIER_META } from '../data/activities.js';
import { researchCostFor, formatSeconds } from '../systems/helpers.js';
import { researchTicksFor } from '../model/Economy.js';

const COIN = '<img class="credit-icon" src="/icons/credit.png" alt="" aria-hidden="true">';

export class ResearchTree {
  constructor(root, state, bus, researchSystem, loop) {
    this.root = root;
    this.state = state;
    this.research = researchSystem;
    this.bus = bus;
    this.loop = loop;
    this.active = 'energy';
    this.focusId = null;          // currently-focused activity id (details card)
    this._nodeByActivity = new Map();

    // Branch tabs carry a completion chip and a progress-bar underline so
    // the player can see which branches are mid-research and which are
    // untouched without clicking through each one.
    const tabs = Object.entries(BRANCHES).map(([id, b]) =>
      `<button class="branch-tab" data-b="${id}" style="--c:${b.color}" title="${b.label} branch">
        <span class="branch-tab-icon" style="color:${b.color}">${b.icon}</span>
        <span class="branch-tab-label">${b.label}</span>
        <span class="branch-tab-meta" data-branch-meta="${id}">0/0</span>
        <span class="branch-tab-progress" aria-hidden="true"><span class="branch-tab-progress-fill" data-branch-fill="${id}"></span></span>
      </button>`
    ).join('');

    root.innerHTML = `
      <div class="research-intro">One lab per branch — up to six projects running in parallel. Tap a card to read it, then Research.</div>
      <div class="branches">${tabs}</div>
      <div class="tree-wrap">
        <div class="tree-scroll">
          <div class="tree-canvas"></div>
        </div>
      </div>`;

    root.querySelectorAll('.branch-tab').forEach(t =>
      t.addEventListener('click', () => {
        this.active = t.dataset.b;
        this.focusId = null;
        this._rebuild();
        this._updateTabs();
      }));

    this.canvasEl = root.querySelector('.tree-canvas');
    this.scrollEl = root.querySelector('.tree-scroll');

    // Inline detail card — anchored after the clicked node row, advisor-style.
    // Built once, reattached on click, hidden when no node is focused.
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'tree-detail tree-detail-inline';
    this.detailEl.hidden = true;

    bus.on(EVT.TICK,             () => this._tick());
    bus.on(EVT.RESEARCH_DONE,    () => this._rebuild());
    bus.on(EVT.RESEARCH_STARTED, () => this._rebuild());

    this._rebuild();
    this._updateTabs();
    this._animRaf = requestAnimationFrame(this._animate);
  }

  destroy() {
    if (this._animRaf) cancelAnimationFrame(this._animRaf);
  }

  _updateTabs() {
    this.root.querySelectorAll('.branch-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.b === this.active));
  }

  // Per-branch "N/M researched" chip + underline progress bar. Run on
  // every research started/done so the dormant branches update live.
  _updateBranchProgress() {
    for (const id of Object.keys(BRANCHES)) {
      const activities = ACTIVITIES.filter(a => a.branch === id);
      const total = activities.length;
      const done = activities.filter(a => this.state.world.researched.has(a.id)).length;
      const running = !!this.state.world.activeResearch?.[id];
      const meta = this.root.querySelector(`[data-branch-meta="${id}"]`);
      const fill = this.root.querySelector(`[data-branch-fill="${id}"]`);
      if (meta) meta.textContent = running ? `${done}/${total} ·` : `${done}/${total}`;
      if (fill) fill.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
      const tab = this.root.querySelector(`.branch-tab[data-b="${id}"]`);
      if (tab) tab.classList.toggle('has-running', running);
    }
  }

  _statusOf(a) {
    const s = this.state;
    const branchSlot = s.world.activeResearch[a.branch];
    if (s.world.researched.has(a.id)) return 'done';
    if (branchSlot && branchSlot.id === a.id) return 'inprogress';
    if (a.prereqs.every(p => s.world.researched.has(p))) return 'ready';
    return 'locked';
  }

  _rebuild() {
    const activitiesInBranch = ACTIVITIES.filter(a => a.branch === this.active);
    const byTier = { 1: [], 2: [], 3: [], 4: [] };
    for (const a of activitiesInBranch) (byTier[a.tier ?? 1] ||= []).push(a);

    const branch = BRANCHES[this.active];
    const out = [];
    for (const tier of [1, 2, 3, 4]) {
      const acts = byTier[tier];
      if (!acts?.length) continue;
      const meta = TIER_META[tier] ?? { label: `Tier ${tier}`, hint: '' };
      // Tier header: one row, full-width, label left, hint right. Hint
      // lands on-screen instead of in a tooltip so the player actually
      // reads it — that's the whole point of the label.
      out.push(`<div class="tree-tier" data-tier="${tier}">
        <div class="tree-tier-head">
          <span class="tree-tier-num">T${tier}</span>
          <span class="tree-tier-label">${meta.label}</span>
          ${meta.hint ? `<span class="tree-tier-hint">${meta.hint}</span>` : ''}
        </div>
        <div class="tree-list">
          ${acts.map(a => this._nodeHTML(a, branch)).join('')}
        </div>
      </div>`);
    }
    this.canvasEl.innerHTML = out.join('');

    // Index the nodes. Click = toggle inline detail beneath that row.
    this._nodeByActivity.clear();
    for (const n of this.canvasEl.querySelectorAll('.tree-node[data-id]')) {
      this._nodeByActivity.set(n.dataset.id, n);
      n.addEventListener('click', () => this._toggleDetail(n.dataset.id));
    }

    // Clear focus when the branch changes — the inline detail stays closed
    // until the player clicks a card in the new branch.
    if (this.focusId && (!this.state.activities[this.focusId] || this.state.activities[this.focusId].branch !== this.active)) {
      this.focusId = null;
      this.detailEl.hidden = true;
      this.detailEl.remove();
    }
    this._renderDetail();
    this._highlightFocus();
    this._reanchorDetail();
    this._updateBranchProgress();
  }

  // Advisor-pattern expand/collapse. Click the same card to close; click a
  // different card to re-anchor beneath it.
  _toggleDetail(id) {
    if (this.focusId === id) {
      this.focusId = null;
      this.detailEl.hidden = true;
      this.detailEl.remove();
      this._highlightFocus();
      return;
    }
    this.focusId = id;
    this._renderDetail();
    this._reanchorDetail();
    this._highlightFocus();
  }

  // Place the detail card in the DOM immediately after the focused card
  // so it reads as "belonging to" that row. Scroll the clicked card into
  // view on first anchor so expanding near the bottom of the list doesn't
  // push the Research button below the fold. Guarded to "first anchor"
  // so a tick-driven re-render doesn't keep yanking the scroll.
  _reanchorDetail() {
    if (!this.focusId) { this.detailEl.hidden = true; this.detailEl.remove(); return; }
    const nodeEl = this._nodeByActivity.get(this.focusId);
    if (!nodeEl) { this.detailEl.hidden = true; this.detailEl.remove(); return; }
    const isFirstAnchor = !this.detailEl.isConnected;
    nodeEl.insertAdjacentElement('afterend', this.detailEl);
    this.detailEl.hidden = false;
    if (isFirstAnchor) {
      try { nodeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      catch { /* older browsers */ }
    }
  }

  // Row card: icon · name + meta · status. Locked cards show the missing
  // prereq inline; in-progress cards carry a progress bar along the bottom
  // edge (animated in _animate). Everything a player needs to decide
  // "research this next?" is visible without clicking.
  _nodeHTML(a, branch) {
    const status = this._statusOf(a);
    const s = this.state;
    const mod = s.meta.mod;
    const cost = researchCostFor(s, a, mod);
    const ticks = researchTicksFor(a, mod);
    const secs = formatSeconds(ticks, s);
    const adoption = Math.round((a.deployAdoption ?? 0) * 100);

    let metaBits = '';
    let statusEl = '';
    let extra = '';
    if (status === 'done') {
      metaBits = `<span class="tnc-meta-adopt">+${adoption}% on deploy</span>`;
      statusEl = `<span class="tnc-status done">Researched</span>`;
    } else if (status === 'inprogress') {
      const slot = s.world.activeResearch[a.branch];
      const remSecs = formatSeconds(slot.ticksRemaining, s);
      metaBits = `<span class="tnc-meta-researching">${remSecs} left</span>`;
      statusEl = `<span class="tnc-status inprogress">In Progress</span>`;
      extra = `<span class="tnc-progress" aria-hidden="true"><span class="tnc-progress-fill" data-node-fill="${a.id}"></span></span>`;
    } else if (status === 'locked') {
      const missing = a.prereqs
        .filter(p => !s.world.researched.has(p))
        .map(p => s.activities[p]?.name ?? p);
      const needsText = missing.length ? `Needs: ${missing.join(', ')}` : 'Locked';
      metaBits = `<span class="tnc-meta-needs" title="${needsText}">${needsText}</span>`;
      statusEl = `<span class="tnc-status locked" aria-label="Locked">🔒</span>`;
    } else {
      // Ready
      metaBits = `<span class="tnc-meta-cost">${cost} ${COIN}</span>
                  <span class="tnc-meta-sep">·</span>
                  <span class="tnc-meta-time">${secs}</span>
                  <span class="tnc-meta-sep">·</span>
                  <span class="tnc-meta-adopt">+${adoption}%</span>`;
      statusEl = `<span class="tnc-status ready">Ready</span>`;
    }

    return `<button class="tree-node ${status}" data-id="${a.id}" data-tier="${a.tier}" style="--c:${branch.color}" title="${a.name}">
      <span class="tree-node-icon" aria-hidden="true">${branch.icon}</span>
      <span class="tree-node-body">
        <span class="tree-node-name">${a.name}</span>
        <span class="tree-node-meta">${metaBits}</span>
      </span>
      ${statusEl}
      ${extra}
    </button>`;
  }

  /* Walk prereqs recursively from a node. Returns the set of ancestor
     activity ids (not including the node itself). Cycle-safe via the
     visited set. */
  _prereqAncestors(id) {
    const visited = new Set();
    const walk = (nodeId) => {
      const a = this.state.activities[nodeId];
      if (!a) return;
      for (const p of a.prereqs) {
        if (visited.has(p)) continue;
        visited.add(p);
        walk(p);
      }
    };
    walk(id);
    return visited;
  }

  _highlightFocus() {
    // When the focused card is locked, light up the whole chain — every
    // prereq ancestor + the focused card. With the row layout this reads
    // as "here's what you need, in order" without any connector lines.
    const focused = this.focusId ? this.state.activities[this.focusId] : null;
    const focusedLocked = focused && this._statusOf(focused) === 'locked';
    this._onPath = focusedLocked ? this._prereqAncestors(this.focusId) : new Set();

    for (const [id, el] of this._nodeByActivity) {
      el.classList.toggle('focused', id === this.focusId);
      el.classList.toggle('on-path', this._onPath.has(id));
    }
  }

  _renderDetail() {
    if (!this.focusId) { this.detailEl.hidden = true; return; }
    const s = this.state;
    const a = s.activities[this.focusId];
    if (!a) { this.detailEl.hidden = true; return; }
    const mod = s.meta.mod;
    const branch = BRANCHES[a.branch];
    const status = this._statusOf(a);
    const cost = researchCostFor(s, a, mod);
    const ticks = researchTicksFor(a, mod);
    const secs = formatSeconds(ticks, s);
    const cp = s.world.climatePoints;

    const prereqLine = a.prereqs.length
      ? a.prereqs.map(p => {
          const prereq = s.activities[p];
          const done = s.world.researched.has(p);
          return `<span class="tree-prereq ${done ? 'done' : 'todo'}">${done ? '✓' : '○'} ${prereq?.name ?? p}</span>`;
        }).join('')
      : `<span class="tree-prereq none">No prerequisites</span>`;

    let actionBlock = '';
    if (status === 'done') {
      actionBlock = `<div class="tree-action-done">Researched ✓ — deploy it from the right panel to any country.</div>`;
    } else if (status === 'inprogress') {
      const slot = s.world.activeResearch[a.branch];
      const pct = Math.round(((slot.totalTicks - slot.ticksRemaining) / slot.totalTicks) * 100);
      const remSecs = formatSeconds(slot.ticksRemaining, s);
      actionBlock = `<div class="research-progress">
        <div class="rp-label">Researching · ${remSecs} left · ${pct}%</div>
        <div class="rp-track"><div class="rp-fill" style="width:${pct}%"></div></div>
      </div>`;
    } else if (status === 'locked') {
      actionBlock = `<div class="tree-action-locked">Unlock by researching its prerequisites first.</div>`;
    } else {
      const branchSlot = s.world.activeResearch[a.branch];
      const branchBusy = !!branchSlot && (branchSlot.id !== a.id);
      const canAfford = cp >= cost;
      const blocked = branchBusy || !canAfford;
      const title = branchBusy
        ? `${branch.label} lab is busy with another project.`
        : !canAfford ? `Needs ${cost} Credits.` : `Start research (${secs}).`;
      actionBlock = `<button class="research-btn" ${blocked ? 'disabled' : ''} title="${title}">
        ${branchBusy ? `${branch.label} lab busy` : `Research (${cost} ${COIN} · ${secs})`}
      </button>`;
    }

    // Longer scientific grounding — only shown if the activity ships one.
    const detailBlock = a.detail
      ? `<p class="tree-detail-science">${a.detail}</p>`
      : '';

    // Will cost/requirement surfaced inline so the political cost is visible
    // next to the money/time cost instead of buried in the desc.
    const willRow = (a.willRequirement || a.willCost)
      ? `<div class="tree-detail-will">
          ${a.willRequirement ? `<span class="tree-will-chip">Needs Will ${a.willRequirement}</span>` : ''}
          ${a.willCost ? `<span class="tree-will-chip">Drains ${a.willCost} Will</span>` : ''}
        </div>`
      : '';

    this.detailEl.innerHTML = `
      <button type="button" class="tree-detail-close" aria-label="Close detail" title="Close">×</button>
      <div class="tree-detail-head">
        <span class="tree-detail-icon" style="color:${branch.color}">${branch.icon}</span>
        <div class="tree-detail-title">
          <div class="tree-detail-name">${a.name}</div>
          <div class="tree-detail-meta">
            <span class="tree-tier-pill tier-${a.tier}">T${a.tier} · ${TIER_META[a.tier]?.label ?? ''}</span>
            <span class="tree-branch-pill" style="background:${branch.color}">${branch.label}</span>
          </div>
        </div>
      </div>
      <p class="tree-detail-desc">${a.desc}</p>
      ${detailBlock}
      <div class="tree-detail-stats">
        <div class="tree-stat"><span class="tree-stat-label">Cost</span><span class="tree-stat-val">${cost} ${COIN}</span></div>
        <div class="tree-stat"><span class="tree-stat-label">Time</span><span class="tree-stat-val">${secs}</span></div>
        <div class="tree-stat"><span class="tree-stat-label">Deploys for</span><span class="tree-stat-val">${a.deployCost} ${COIN}</span></div>
        <div class="tree-stat"><span class="tree-stat-label">+Adoption</span><span class="tree-stat-val">+${Math.round(a.deployAdoption*100)}%</span></div>
      </div>
      ${willRow}
      <div class="tree-detail-prereqs">${prereqLine}</div>
      ${actionBlock}`;

    const btn = this.detailEl.querySelector('.research-btn');
    btn?.addEventListener('click', () => this.research.research(a.id));
    const closeBtn = this.detailEl.querySelector('.tree-detail-close');
    closeBtn?.addEventListener('click', () => {
      this.focusId = null;
      this.detailEl.hidden = true;
      this.detailEl.remove();
      this._highlightFocus();
    });
  }

  _tick() {
    // Keep node status classes + detail card affordability fresh. A
    // status transition (e.g. "ready" → "inprogress") means the card's
    // meta line needs a rebuild too, since the meta text is baked into
    // the HTML per status.
    let structuralChange = false;
    for (const [id, el] of this._nodeByActivity) {
      const a = this.state.activities[id];
      if (!a) continue;
      const status = this._statusOf(a);
      const current = el.classList.contains('done') ? 'done'
        : el.classList.contains('inprogress') ? 'inprogress'
        : el.classList.contains('ready') ? 'ready'
        : 'locked';
      if (current !== status) {
        structuralChange = true;
        break;
      }
    }
    if (structuralChange) {
      this._rebuild();
    }

    // Detail-card affordability (only if we're showing a ready node).
    if (this.focusId) {
      const a = this.state.activities[this.focusId];
      if (a) {
        const status = this._statusOf(a);
        if (status === 'ready' || status === 'locked') {
          // Re-render detail card lightly — cheap, handles cost tracking too.
          this._renderDetail();
        }
      }
    }
  }

  // Per-frame: animate the in-progress card's bottom bar + the detail-card
  // progress bar when the focused activity is the one being researched.
  _animate = () => {
    this._animRaf = requestAnimationFrame(this._animate);
    const slot = this.state.world.activeResearch?.[this.active];
    if (!slot) return;
    const frac = this.loop?.fractionalTick?.() ?? 0;
    const effRem = Math.max(0, slot.ticksRemaining - frac);
    const progress = Math.max(0, Math.min(1, (slot.totalTicks - effRem) / slot.totalTicks));
    const pctStr = `${(progress * 100).toFixed(2)}%`;

    // The in-progress card's own baseline progress bar.
    const cardFill = this.canvasEl.querySelector(`[data-node-fill="${slot.id}"]`);
    if (cardFill) cardFill.style.width = pctStr;

    // Detail card, if it's the same activity.
    if (this.focusId === slot.id) {
      const fill = this.detailEl.querySelector('.rp-fill');
      const label = this.detailEl.querySelector('.rp-label');
      if (fill) fill.style.width = pctStr;
      if (label) {
        const secs = formatSeconds(effRem, this.state);
        const pctText = Math.round(progress * 100);
        label.textContent = `Researching · ${secs} left · ${pctText}%`;
      }
    }
  };
}
