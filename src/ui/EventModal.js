// Interactive event modal. Fires when an event has `choices`. Arrow-key
// navigation + Enter to confirm make it keyboard-friendly.
//
// Advisor-conflict events carry an `_advisorStances` array, which surfaces
// a separate "The council weighs in" panel between the headline and the
// choices so the decision text leads and advisor positions are clearly
// attributed.

import { installModalA11y } from './modal-a11y.js';

function stancesHTML(stances) {
  if (!stances?.length) return '';
  const rows = stances.map(s => `
    <div class="advisor-stance" style="--advisor: ${s.color}">
      <span class="advisor-stance-portrait" aria-hidden="true">
        <img class="advisor-stance-portrait-img" alt="" src="${s.portrait}" decoding="async">
      </span>
      <span class="advisor-stance-body">
        <span class="advisor-stance-name">${s.name}</span>
        <span class="advisor-stance-title">${s.title}</span>
        <span class="advisor-stance-quote">“${s.stance}”</span>
      </span>
    </div>`).join('');
  return `<div class="advisor-stance-block" aria-label="The council weighs in">
    <div class="advisor-stance-head">The council weighs in</div>
    ${rows}
  </div>`;
}

export function showEventModal(state, eventSystem) {
  const evt = state.activeEvents[0];
  if (!evt) return;
  if (document.querySelector('.modal')) return; // one at a time

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-card" role="dialog" aria-label="${evt.title}">
    <h2>${evt.title}</h2>
    <p>${evt.headline}</p>
    ${stancesHTML(evt._advisorStances)}
    <div class="modal-choices">
      ${evt.choices.map((c, i) => `<button class="modal-choice" data-k="${c.key}" data-idx="${i}">${c.label}${c._advisorHint ? `<span class="modal-choice-hint">Backed by ${c._advisorHint}</span>` : ''}</button>`).join('')}
    </div></div>`;
  document.body.appendChild(modal);

  const choices = [...modal.querySelectorAll('.modal-choice')];
  let idx = 0;
  const focusIdx = (i) => { idx = (i + choices.length) % choices.length; choices[idx]?.focus(); };
  focusIdx(0);

  // A11y helper — sets aria-modal, restores focus on close. We don't give
  // it an onClose because this modal intentionally forces a choice (no Esc
  // dismiss), but it still traps Tab which is safe here.
  const teardownA11y = installModalA11y(modal.querySelector('.modal-card'), { label: evt.title });

  const close = (key) => {
    teardownA11y();
    modal.remove();
    document.removeEventListener('keydown', onKey);
    if (key) eventSystem.resolve(evt.id, key);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') return; // don't auto-resolve on Esc; force a choice
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { focusIdx(idx + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { focusIdx(idx - 1); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      const k = choices[idx]?.dataset.k;
      if (k) close(k);
    } else if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key) - 1;
      const k = choices[n]?.dataset.k;
      if (k) close(k);
    }
  };
  document.addEventListener('keydown', onKey);

  choices.forEach(btn => btn.addEventListener('click', () => close(btn.dataset.k)));
}
