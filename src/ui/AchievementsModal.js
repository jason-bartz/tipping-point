// Achievements modal. Opens from the end-screen and (optionally) the HUD.
// Shows every achievement with its unlock state. "New" entries (unlocked
// this session) are highlighted until the modal is opened, then cleared.

import { installModalA11y } from './modal-a11y.js';
import { listAllAchievements, loadUnlocked, readNew, clearNew } from '../model/Achievements.js';

export function showAchievements({ state } = {}) {
  if (document.querySelector('.achievements-modal')) return;

  const unlocked = loadUnlocked();
  const freshlyNew = readNew();
  const all = listAllAchievements();

  const modal = document.createElement('div');
  modal.className = 'modal achievements-modal';
  const unlockedCount = all.filter(a => unlocked.has(a.id)).length;
  modal.innerHTML = `<div class="achievements-card" role="dialog" aria-label="Achievements">
    <button class="modal-close" type="button" aria-label="Close achievements">×</button>
    <h2>Achievements</h2>
    <div class="achievements-progress">
      <span class="achievements-count">${unlockedCount}</span>
      <span class="achievements-total">/ ${all.length}</span>
      <span class="achievements-progress-label">unlocked</span>
    </div>
    <div class="achievements-grid">
      ${all.map(a => {
        const isUnlocked = unlocked.has(a.id);
        const isNew = freshlyNew.has(a.id);
        return `<div class="achievement ${isUnlocked ? 'unlocked' : 'locked'} ${isNew ? 'is-new' : ''}">
          <div class="achievement-icon">${isUnlocked ? a.icon : '🔒'}</div>
          <div class="achievement-body">
            <div class="achievement-title">${a.title}${isNew ? ' <span class="achievement-new-chip">NEW</span>' : ''}</div>
            <div class="achievement-desc">${a.desc}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="achievements-foot">
      <button class="achievements-dismiss" type="button">Close</button>
    </div>
  </div>`;

  document.body.appendChild(modal);

  const wasPaused = state?.meta?.paused;
  if (state) state.meta.paused = true;

  const close = () => {
    teardownA11y();
    modal.remove();
    if (state && wasPaused === false) state.meta.paused = false;
  };

  const teardownA11y = installModalA11y(modal.querySelector('.achievements-card'), {
    onClose: close,
    label: 'Achievements',
  });

  // Clear the NEW marker set now that the player has seen them.
  clearNew();

  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.achievements-dismiss').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
