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
      <button class="again">Play Again</button>
    </div>`;

  root.querySelector('.again')?.addEventListener('click', () => onAgain?.());
  root.querySelector('.end-achievements')?.addEventListener('click', () => {
    showAchievements({ state });
  });
  document.getElementById('game').classList.remove('active');
  document.getElementById('end-screen').classList.add('active');
}
