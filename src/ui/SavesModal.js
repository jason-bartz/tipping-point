// Save slots modal. Two modes:
//   'loadOnly' — from country select. Lists every slot; Load and Delete only.
//   'ingame'   — from the Settings modal. Also allows "Save here" into any
//                manual slot, writing the current state into that slot.
//
// Slots: `auto` (read-only target for the autosave driver) and manual a/b/c.

import { installModalA11y } from './modal-a11y.js';
import {
  listSlots,
  saveToSlot,
  deleteSlot,
  MANUAL_SLOT_IDS,
} from '../save/saveLoad.js';
import { COUNTRY_PROFILES } from '../data/profiles.js';

function formatWhen(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function slotRowHTML(slot, mode) {
  const { id, label, meta } = slot;
  const isManual = MANUAL_SLOT_IDS.includes(id);
  const ingame = mode === 'ingame';

  if (!meta) {
    const saveBtn = ingame && isManual
      ? `<button class="saves-action saves-save" data-slot="${id}" type="button">Save here</button>`
      : '';
    return `<div class="saves-row empty" data-slot="${id}">
      <div class="saves-row-main">
        <div class="saves-label">${label}</div>
        <div class="saves-meta">Empty slot.</div>
      </div>
      <div class="saves-actions">${saveBtn}</div>
    </div>`;
  }

  const profile = COUNTRY_PROFILES[meta.homeCountryId];
  const countryName = profile?.title ?? meta.homeCountryId;
  const detail = `Q${meta.quarter} ${meta.year} · ${meta.co2ppm.toFixed(1)} ppm · +${meta.tempAnomalyC.toFixed(2)}°C`;
  const when = formatWhen(meta.savedAt);

  const actions = [];
  actions.push(`<button class="saves-action saves-load" data-slot="${id}" type="button">Resume</button>`);
  if (ingame && isManual) {
    actions.push(`<button class="saves-action saves-save" data-slot="${id}" type="button">Overwrite</button>`);
  }
  actions.push(`<button class="saves-action saves-delete" data-slot="${id}" type="button" title="Delete this save">×</button>`);

  return `<div class="saves-row" data-slot="${id}">
    <div class="saves-row-main">
      <div class="saves-label">${label}${when ? ` <span class="saves-when">· ${when}</span>` : ''}</div>
      <div class="saves-country">${countryName}</div>
      <div class="saves-meta">${detail}</div>
    </div>
    <div class="saves-actions">${actions.join('')}</div>
  </div>`;
}

function render(modal, { mode, state, onLoad }) {
  const slots = listSlots();
  const card = modal.querySelector('.saves-card');
  const list = card.querySelector('.saves-list');
  list.innerHTML = slots.map(s => slotRowHTML(s, mode)).join('');

  list.querySelectorAll('.saves-load').forEach(btn => {
    btn.addEventListener('click', () => {
      onLoad?.(btn.dataset.slot);
    });
  });

  list.querySelectorAll('.saves-save').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state) return;
      const slot = btn.dataset.slot;
      const row = btn.closest('.saves-row');
      if (row && !row.classList.contains('empty')) {
        if (!window.confirm(`Overwrite this slot?`)) return;
      }
      if (saveToSlot(slot, state)) {
        render(modal, { mode, state, onLoad });
      }
    });
  });

  list.querySelectorAll('.saves-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.slot;
      if (!window.confirm('Delete this save? This can\'t be undone.')) return;
      deleteSlot(slot);
      render(modal, { mode, state, onLoad });
    });
  });
}

export function showSaves({ mode = 'loadOnly', state, onLoad } = {}) {
  if (document.querySelector('.saves-modal')) return;

  const modal = document.createElement('div');
  modal.className = 'modal saves-modal';
  modal.innerHTML = `<div class="saves-card" role="dialog" aria-label="Save slots">
    <button class="modal-close" type="button" aria-label="Close">×</button>
    <h2>Save Slots</h2>
    <div class="saves-sub">${mode === 'ingame'
      ? 'Save your current run into any slot, or resume a different one. Autosave writes to the Autosave slot every 20 seconds.'
      : 'Resume any saved run below, or start a new game.'}</div>
    <div class="saves-list"></div>
    <div class="saves-foot">
      <button class="saves-dismiss" type="button">Close</button>
    </div>
  </div>`;

  document.body.appendChild(modal);

  // If triggered in-game, pause while open.
  const wasPaused = state?.meta?.paused;
  if (state) state.meta.paused = true;

  const close = () => {
    teardownA11y();
    modal.remove();
    if (state && wasPaused === false) state.meta.paused = false;
  };

  const teardownA11y = installModalA11y(modal.querySelector('.saves-card'), {
    onClose: close,
    label: 'Save slots',
  });

  render(modal, {
    mode, state,
    onLoad: (slotId) => {
      close();
      onLoad?.(slotId);
    },
  });

  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.saves-dismiss').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
