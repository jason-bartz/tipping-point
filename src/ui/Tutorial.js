// First-run tutorial + reopen-from-HUD. Pauses the game while open.
//
// Structure: four numbered "big beats" (Research → Deploy → Advisors →
// Win), each a one-sentence takeaway plus a compact detail line. One
// primary CTA closes the modal — the × button, Escape, and backdrop click
// are enough fallbacks for impatient first-timers. The Glossary is linked
// for the curious. Keyboard shortcuts are surfaced in the footer so the
// info is discoverable without stretching the modal.

import { installModalA11y } from './modal-a11y.js';
import { showGlossary } from './Glossary.js';

const SEEN_KEY = 'tipping-point.tutorialSeen.v3';

export function hasSeenTutorial() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; }
  catch { return false; }
}

export function markTutorialSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); }
  catch { /* ignore */ }
}

export function showTutorial({ state, pauseWhileOpen = false } = {}) {
  if (document.querySelector('.tutorial-modal')) return;
  const modal = document.createElement('div');
  modal.className = 'modal tutorial-modal';
  modal.innerHTML = `<div class="tutorial-card" role="dialog" aria-label="How to play">
    <button class="modal-close" type="button" aria-label="Close how to play">×</button>
    <h2>How to Play</h2>
    <p class="tutorial-intro">No ticking clock — play until you <b>reverse</b> climate change or temperature crosses <b>+4°C</b>. Four things to learn:</p>
    <div class="tutorial-steps">
      <div class="tutorial-step">
        <div class="tutorial-step-num">1</div>
        <div>
          <b>Research in the left panel.</b>
          <div class="tutorial-step-sub">Entry activities cost <b>1–3</b> Credits <img class="credit-icon" src="/icons/credit.png" alt="" aria-hidden="true">. You can run one project per branch in parallel — up to six at once.</div>
        </div>
      </div>
      <div class="tutorial-step">
        <div class="tutorial-step-num">2</div>
        <div>
          <b>Deploy to the map.</b>
          <div class="tutorial-step-sub">Click a country, then Deploy in the right panel. Neighbors copy what works. Your <b>home</b> gets a 25% discount. Grab map <b>bubbles</b> before they fade.</div>
        </div>
      </div>
      <div class="tutorial-step">
        <div class="tutorial-step-num">3</div>
        <div>
          <b>Work your Advisors.</b>
          <div class="tutorial-step-sub">The <b>Advisors</b> tab holds four voices — scientist, diplomat, activist, industrialist — who weigh in on every decision and flag tipping points before they bite. They propose <b>agendas</b> you fulfill through normal play; click a seat to see who wants what. Push influence to <b>80</b> to unlock a signature ability — free deploys, backchannel, and more.</div>
        </div>
      </div>
      <div class="tutorial-step">
        <div class="tutorial-step-num">4</div>
        <div>
          <b>Win by bending the curve.</b>
          <div class="tutorial-step-sub">CO₂ past peak (−8 ppm), peak temp ≤ <b>+2.1°C</b>, and <b>65%+</b> of countries at Net Zero. Stalling is losing in slow motion.</div>
        </div>
      </div>
    </div>
    <p class="tutorial-outro">Keys: <span class="kbd">Space</span> pause · <span class="kbd">1</span>/<span class="kbd">2</span>/<span class="kbd">4</span> speed · <span class="kbd">H</span> help · <span class="kbd">S</span> stats · <span class="kbd">Esc</span> close modals. Progress autosaves every 20 seconds.</p>
    <div class="tutorial-foot">
      <button class="tutorial-glossary" type="button">Glossary</button>
      <button class="tutorial-dismiss" type="button">Got it — let's go</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  const wasPaused = state?.meta?.paused;
  if (pauseWhileOpen && state) state.meta.paused = true;

  const close = () => {
    teardownA11y();
    modal.remove();
    if (pauseWhileOpen && state && wasPaused === false) state.meta.paused = false;
  };
  const teardownA11y = installModalA11y(modal.querySelector('.tutorial-card'), {
    onClose: close,
    label: 'How to play',
  });
  modal.querySelector('.tutorial-dismiss').addEventListener('click', close);
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.tutorial-glossary').addEventListener('click', () => showGlossary());
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
