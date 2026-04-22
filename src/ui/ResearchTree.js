// Left panel. Branch tabs + RPG-style tier tree with SVG connectors. Click a
// node to see its details in the sticky footer card — from there, start
// research, watch progress, or review why it's locked.
//
// Layout: for each visible branch we render one tree container made of four
// rows (Entry → Scale → Transform → Capstone). Each row is a flex-centered
// set of round icon nodes. A single absolutely-positioned <svg> behind the
// rows draws cubic-bezier lines from every node to its prereqs.
//
// Performance: the tree DOM changes only when the branch switches or the
// researched/in-progress set changes. Per-tick updates touch only the
// selected node's detail card (text + progress bar).

import { EVT } from '../core/EventBus.js';
import { BRANCHES, ACTIVITIES, TIER_META } from '../data/activities.js';
import { researchCostFor, formatSeconds } from '../systems/helpers.js';

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

    const tabs = Object.entries(BRANCHES).map(([id, b]) =>
      `<button class="branch-tab" data-b="${id}" style="--c:${b.color}" title="${b.label} branch">
        <span class="branch-tab-icon" style="color:${b.color}">${b.icon}</span>
        <span class="branch-tab-label">${b.label}</span>
      </button>`
    ).join('');

    root.innerHTML = `
      <div class="panel-title">Research</div>
      <div class="research-intro">Each branch = one research lab (6 slots total). Click a node to see it. Start with a bordered (ready) node.</div>
      <div class="branches">${tabs}</div>
      <div class="tree-wrap">
        <div class="tree-scroll">
          <div class="tree-canvas"></div>
        </div>
      </div>
      <div class="tree-detail"></div>`;

    root.querySelectorAll('.branch-tab').forEach(t =>
      t.addEventListener('click', () => {
        this.active = t.dataset.b;
        this.focusId = null;
        this._rebuild();
        this._updateTabs();
      }));

    this.canvasEl = root.querySelector('.tree-canvas');
    this.scrollEl = root.querySelector('.tree-scroll');
    this.detailEl = root.querySelector('.tree-detail');
    this.titleEl  = root.querySelector('.panel-title');

    bus.on(EVT.TICK,             () => this._tick());
    bus.on(EVT.RESEARCH_DONE,    () => this._rebuild());
    bus.on(EVT.RESEARCH_STARTED, () => this._rebuild());

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._drawLines());
      this._ro.observe(this.canvasEl);
    }

    this._rebuild();
    this._updateTabs();
    this._animRaf = requestAnimationFrame(this._animate);
  }

  destroy() {
    if (this._animRaf) cancelAnimationFrame(this._animRaf);
    this._ro?.disconnect();
  }

  _updateTabs() {
    this.root.querySelectorAll('.branch-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.b === this.active));
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
    out.push(`<svg class="tree-lines" aria-hidden="true"></svg>`);
    for (const tier of [1, 2, 3, 4]) {
      const acts = byTier[tier];
      if (!acts?.length) continue;
      const meta = TIER_META[tier] ?? { label: `Tier ${tier}`, hint: '' };
      // Tier header is a single compact pill — chapter marker, not a
      // decorative chip row. Hint text lives in the title attribute so
      // the panel stays uncluttered.
      const tierTip = meta.hint ? `${meta.label} · ${meta.hint}` : meta.label;
      out.push(`<div class="tree-tier" data-tier="${tier}">
        <div class="tree-tier-head">
          <span class="tree-tier-pill" title="${tierTip}">T${tier} · ${meta.label}</span>
        </div>
        <div class="tree-row">
          ${acts.map(a => this._nodeHTML(a, branch)).join('')}
        </div>
      </div>`);
    }
    this.canvasEl.innerHTML = out.join('');

    // Index the nodes.
    this._nodeByActivity.clear();
    for (const n of this.canvasEl.querySelectorAll('.tree-node[data-id]')) {
      this._nodeByActivity.set(n.dataset.id, n);
      n.addEventListener('click', () => {
        this.focusId = n.dataset.id;
        this._renderDetail();
        this._highlightFocus();
      });
    }

    // Draw connector lines between nodes (prereqs).
    this._drawLines();

    // If no focus yet, preselect the first ready node, else first node.
    if (!this.focusId || !this.state.activities[this.focusId] || this.state.activities[this.focusId].branch !== this.active) {
      const firstReady = activitiesInBranch.find(a => this._statusOf(a) === 'ready')
                      ?? activitiesInBranch.find(a => this._statusOf(a) === 'inprogress')
                      ?? activitiesInBranch[0];
      this.focusId = firstReady?.id ?? null;
    }
    this._renderDetail();
    this._highlightFocus();
    this._updateTitleBadge();
  }

  _nodeHTML(a, branch) {
    const status = this._statusOf(a);
    const icon = branch.icon; // re-use branch icon for all nodes in that branch
    return `<button class="tree-node ${status}" data-id="${a.id}" data-tier="${a.tier}" style="--c:${branch.color}" title="${a.name}">
      <span class="tree-node-icon">${icon}</span>
      <span class="tree-node-label">${a.name}</span>
      <span class="tree-node-status-dot" aria-hidden="true"></span>
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
    // When the focused node is locked, light up the path: every prereq
    // ancestor + the focused node itself get the `on-path` class. Lines
    // pick this up via _drawLines, which reads the same set.
    const focused = this.focusId ? this.state.activities[this.focusId] : null;
    const focusedLocked = focused && this._statusOf(focused) === 'locked';
    this._onPath = focusedLocked ? this._prereqAncestors(this.focusId) : new Set();

    for (const [id, el] of this._nodeByActivity) {
      el.classList.toggle('focused', id === this.focusId);
      el.classList.toggle('on-path', this._onPath.has(id));
    }
    // Redraw so line classes update too.
    this._drawLines();
  }

  _drawLines() {
    const svg = this.canvasEl.querySelector('.tree-lines');
    if (!svg) return;
    const bbox = this.canvasEl.getBoundingClientRect();
    const w = this.canvasEl.clientWidth;
    const h = this.canvasEl.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width',  w);
    svg.setAttribute('height', h);

    const coords = new Map();
    for (const [id, el] of this._nodeByActivity) {
      const r = el.getBoundingClientRect();
      coords.set(id, {
        cx: r.left - bbox.left + r.width / 2,
        topY: r.top - bbox.top,
        bottomY: r.bottom - bbox.top,
      });
    }

    // An edge's target being on-path (or the focused node itself) means the
    // edge is part of the lineage leading to the focused locked node.
    const onPathTargets = this._onPath
      ? new Set([...this._onPath, this.focusId])
      : new Set();

    let paths = '';
    for (const a of ACTIVITIES) {
      if (a.branch !== this.active) continue;
      const to = coords.get(a.id);
      if (!to) continue;
      for (const p of a.prereqs) {
        const from = coords.get(p);
        if (!from) continue;
        const x1 = from.cx, y1 = from.bottomY;
        const x2 = to.cx,   y2 = to.topY;
        // Orthogonal route: down from source, across at midY, down to target.
        // Right-angle corners keep the SNES/strategy-game tech-tree feel.
        const midY = Math.round((y1 + y2) / 2);
        const d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
        const prereqDone = this.state.world.researched.has(p);
        const onPath = onPathTargets.has(a.id);
        const cls = ['tree-line'];
        if (prereqDone) cls.push('active');
        if (onPath)     cls.push('on-path');
        paths += `<path d="${d}" class="${cls.join(' ')}" />`;
      }
    }
    svg.innerHTML = paths;
  }

  _renderDetail() {
    if (!this.focusId) {
      this.detailEl.innerHTML = `<div class="tree-detail-empty">Pick a node above to see what it does.</div>`;
      return;
    }
    const s = this.state;
    const a = s.activities[this.focusId];
    if (!a) { this.detailEl.innerHTML = ''; return; }
    const mod = s.meta.mod;
    const branch = BRANCHES[a.branch];
    const status = this._statusOf(a);
    const cost = researchCostFor(s, a, mod);
    const ticks = Math.max(1, Math.round((a.researchTicks ?? 4) * (mod?.researchMult ?? 1)));
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
        ${branchBusy ? `${branch.label} lab busy` : `Research (${cost} ● · ${secs})`}
      </button>`;
    }

    this.detailEl.innerHTML = `
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
      <div class="tree-detail-stats">
        <div class="tree-stat"><span class="tree-stat-label">Cost</span><span class="tree-stat-val">${cost} ●</span></div>
        <div class="tree-stat"><span class="tree-stat-label">Time</span><span class="tree-stat-val">${secs}</span></div>
        <div class="tree-stat"><span class="tree-stat-label">Deploys for</span><span class="tree-stat-val">${a.deployCost} ●</span></div>
        <div class="tree-stat"><span class="tree-stat-label">+Adoption</span><span class="tree-stat-val">+${Math.round(a.deployAdoption*100)}%</span></div>
      </div>
      <div class="tree-detail-prereqs">${prereqLine}</div>
      ${actionBlock}`;

    const btn = this.detailEl.querySelector('.research-btn');
    btn?.addEventListener('click', () => this.research.research(a.id));
  }

  _tick() {
    // Keep node status classes + detail card affordability fresh.
    let statusChanged = false;
    for (const [id, el] of this._nodeByActivity) {
      const a = this.state.activities[id];
      if (!a) continue;
      const status = this._statusOf(a);
      const current = el.classList.contains('done') ? 'done'
        : el.classList.contains('inprogress') ? 'inprogress'
        : el.classList.contains('ready') ? 'ready'
        : 'locked';
      if (current !== status) {
        el.classList.remove('done', 'inprogress', 'ready', 'locked');
        el.classList.add(status);
        statusChanged = true;
      }
    }
    if (statusChanged) this._drawLines();

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
    this._updateTitleBadge();
  }

  _updateTitleBadge() {
    if (!this.titleEl) return;
    const runningCount = Object.keys(this.state.world.activeResearch).length;
    const discountTicks = this.state.world.researchDiscountTicksRemaining;
    const discountPct = Math.round((this.state.world.researchDiscountPct ?? 0) * 100);
    let badge = '';
    if (runningCount > 0) {
      badge = `<span class="panel-badge" title="${runningCount} project${runningCount === 1 ? '' : 's'} active — one slot per branch.">${runningCount} running</span>`;
    } else if (discountTicks > 0) {
      badge = `<span class="panel-badge" title="Research ${discountPct}% off for ${discountTicks} more tick${discountTicks === 1 ? '' : 's'}.">${discountPct}% off · ${discountTicks}t</span>`;
    }
    this.titleEl.innerHTML = badge ? `Research ${badge}` : 'Research';
  }

  // Per-frame: animate the in-progress node + its detail-card progress bar.
  _animate = () => {
    this._animRaf = requestAnimationFrame(this._animate);
    const slot = this.state.world.activeResearch?.[this.active];
    if (!slot) return;
    const frac = this.loop?.fractionalTick?.() ?? 0;
    const effRem = Math.max(0, slot.ticksRemaining - frac);
    const progress = Math.max(0, Math.min(1, (slot.totalTicks - effRem) / slot.totalTicks));

    // Detail card, if it's the same activity.
    if (this.focusId === slot.id) {
      const fill = this.detailEl.querySelector('.rp-fill');
      const label = this.detailEl.querySelector('.rp-label');
      if (fill) fill.style.width = `${(progress * 100).toFixed(2)}%`;
      if (label) {
        const secs = formatSeconds(effRem, this.state);
        const pctText = Math.round(progress * 100);
        label.textContent = `Researching · ${secs} left · ${pctText}%`;
      }
    }
  };
}
