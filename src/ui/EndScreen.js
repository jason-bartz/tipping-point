// Win / loss summary. Replaces the giant alert() that the old src/main.js
// used to fire. `onAgain` is passed in so the host controls reset behavior —
// we don't want to reload the page anymore, just return to country select.

import { showAchievements } from './AchievementsModal.js';
import { readNew } from '../model/Achievements.js';

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sprinkle 80-odd pixel confetti squares down the end screen for a win.
// Each gets a random horizontal start, fall duration, rotation, and color;
// CSS keyframe `gpConfettiFall` does the animation. The whole layer removes
// itself on animationend of the last particle so we don't leak DOM.
const CONFETTI_COLORS = ['#16a34a', '#facc15', '#0ea5e9', '#f472b6', '#f97316', '#a78bfa'];
function dropConfetti(root, count = 80) {
  if (!root) return;
  const reduced = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const layer = document.createElement('div');
  layer.className = 'gp-confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'gp-confetti';
    const left = Math.random() * 100;
    const dur = 2.4 + Math.random() * 2.6;
    const delay = Math.random() * 0.5;
    const rot = Math.random() * 540 - 270;
    const size = 6 + Math.round(Math.random() * 6);
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.cssText =
      `left:${left}%;width:${size}px;height:${Math.round(size * 0.5)}px;` +
      `background:${color};animation-duration:${dur.toFixed(2)}s;` +
      `animation-delay:${delay.toFixed(2)}s;--r:${rot}deg`;
    layer.appendChild(p);
  }
  root.appendChild(layer);
  setTimeout(() => layer.remove(), 6000);
}

// Build a shareable replay link. `seed` + `country` are enough to replay the
// same starting conditions; the RNG is seeded from it in createState().
function buildReplayURL(state) {
  try {
    const base = new URL(window.location.href);
    base.search = '';
    const p = new URLSearchParams();
    p.set('country', state.meta.homeCountryId);
    if (state.meta.seed != null) p.set('seed', String(state.meta.seed >>> 0));
    base.search = p.toString();
    return base.toString();
  } catch { return null; }
}

// Render the player's decision log as an attributed timeline. Only shown on
// a win — this is the "what you chose that got you here" recap. Each row
// includes the immediate in-universe reaction and (if fired) the delayed
// echo from several years later.
function decisionsHTML(decisions) {
  if (!decisions?.length) return '';
  const rows = decisions.map(d => {
    const when = `Q${d.quarter} ${d.year}`;
    const summaryLine = d.effectsSummary
      ? `<div class="decision-summary">${escapeHTML(d.effectsSummary)}</div>`
      : '';
    const echoLine = d.echoHeadline
      ? `<div class="decision-echo">Later — ${escapeHTML(d.echoHeadline)}</div>`
      : '';
    return `<div class="decision-row decision-${d.tone}">
      <div class="decision-when">${when}</div>
      <div class="decision-body">
        <div class="decision-title">${escapeHTML(d.title)}</div>
        <div class="decision-choice">You chose: <strong>${escapeHTML(d.choiceLabel)}</strong></div>
        ${summaryLine}
        <div class="decision-reaction">${escapeHTML(d.choiceHeadline)}</div>
        ${echoLine}
      </div>
    </div>`;
  }).join('');
  return `<div class="decisions-block" aria-label="Your decisions">
    <div class="decisions-head">Decisions that shaped this outcome</div>
    <div class="decisions-list">${rows}</div>
  </div>`;
}

export function showEndScreen(state, payload, won, { onAgain } = {}) {
  const root = document.getElementById('end-card');
  if (!root) return;
  const nz = Object.values(state.countries).filter(c => c.netZero).length;
  root.className = `end-card ${won ? 'won' : 'lost'}`;
  const title = won ? (payload.perfect ? 'Reversed' : 'Stabilized') : 'Too Late';
  const flavor = won
    ? (payload.perfect
        ? 'CO₂ is falling toward pre-industrial levels. Future generations inherit a cooling planet.'
        : 'CO₂ has peaked and is trending down. The worst is behind you.')
    : (payload.reason || 'The climate has moved on.');

  root.innerHTML = `
    <h1>${title}</h1>
    <div style="color:var(--text-dim);margin-top:4px">${flavor}</div>
    ${won ? `<div class="grade grade-${payload.grade}">${payload.grade}</div>` : ''}
    <div class="stats">
      <div class="stat"><label>Peak Temp</label><span>+${payload.peakTemp.toFixed(2)}°C</span></div>
      <div class="stat"><label>Final CO₂</label><span>${state.world.co2ppm.toFixed(1)} ppm</span></div>
      <div class="stat"><label>Net Zero</label><span>${nz} countries</span></div>
      <div class="stat"><label>Year</label><span>${state.meta.year}</span></div>
    </div>
    ${won ? decisionsHTML(state.meta.decisions) : ''}
    <div class="end-actions">
      <button class="end-achievements" type="button">
        Achievements${readNew().size ? ` <span class="end-ach-badge">${readNew().size} new</span>` : ''}
      </button>
      <button class="end-share" type="button" title="Copy a shareable link that replays this exact seed">Copy replay link</button>
      <button class="again">Play Again</button>
    </div>`;

  root.querySelector('.again')?.addEventListener('click', () => onAgain?.());
  root.querySelector('.end-achievements')?.addEventListener('click', () => {
    showAchievements({ state });
  });

  const shareBtn = root.querySelector('.end-share');
  shareBtn?.addEventListener('click', async () => {
    const url = buildReplayURL(state);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      const prev = shareBtn.textContent;
      shareBtn.textContent = 'Copied!';
      shareBtn.classList.add('end-share-copied');
      setTimeout(() => {
        shareBtn.textContent = prev;
        shareBtn.classList.remove('end-share-copied');
      }, 1800);
    } catch {
      // Clipboard blocked (e.g. insecure origin) — fall back to a prompt.
      try { window.prompt('Copy this replay link:', url); } catch { /* ignore */ }
    }
  });

  document.getElementById('game').classList.remove('active');
  const endScreen = document.getElementById('end-screen');
  endScreen.classList.add('active');
  endScreen.classList.toggle('state-won', !!won);
  endScreen.classList.toggle('state-lost', !won);

  // Ceremony on wins. The grade reveals on a small delay so the stats land
  // first; confetti rains; S/A get an extra beat.
  if (won) {
    setTimeout(() => root.classList.add('end-reveal'), 60);
    setTimeout(() => dropConfetti(root, payload.perfect ? 110 : 70), 180);
  }
}
