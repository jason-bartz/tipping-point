// First-run tutorial + reopen-from-HUD. Pauses the game while open.

import { installModalA11y } from './modal-a11y.js';
import { showGlossary } from './Glossary.js';

const SEEN_KEY = 'greenprint.tutorialSeen.v3';

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
    <h2>How to Play</h2>
    <p class="tutorial-intro">No ticking clock. You play until you <b>reverse</b> climate change — or until temperature crosses <b>+4°C</b> and civilization fails. Here's the loop:</p>
    <div class="tutorial-steps">
      <div class="tutorial-step"><div class="tutorial-step-num">1</div><div>Earn <b>Carbon Credits <span class="glyph">●</span></b> slowly each quarter. Entry activities cost just <b>1–3</b> credits, so you can start building fast.</div></div>
      <div class="tutorial-step"><div class="tutorial-step-num">2</div><div><b>Research takes time</b> and shows a live countdown (<b><span class="gi gi-stopwatch"></span> Ns</b>). You can run <b>one project per branch</b> in parallel — up to 6 at once (Energy + Transport + Industry + Land + Capture + Policy). Tree tiers: <b>Entry → Scale → Transform → Capstone</b>.</div></div>
      <div class="tutorial-step"><div class="tutorial-step-num">3</div><div>Click a country on the <b>map</b>, then <b>Deploy</b> from the <b>right panel</b>. Adoption rises locally and neighbors copy what works. Your <b>home country</b> gets a 25% discount.</div></div>
      <div class="tutorial-step"><div class="tutorial-step-num">4</div><div>Click <b>bubbles</b> on the map for bonuses — <span class="gi gi-sprout" style="color:#15803d"></span> Credits + Will · <span class="gi gi-leaf" style="color:#16a34a"></span> Credits + free adoption · <span class="gi gi-star" style="color:#ca8a04"></span> regional Will surge · <span class="gi gi-diamond" style="color:#0369a1"></span> research discount. They fade fast. <b>Events</b> (some with hard choices) will swing things either direction.</div></div>
      <div class="tutorial-step"><div class="tutorial-step-num">5</div><div><b>Win</b>: CO₂ clearly past its peak (dropped 8+ ppm), peak temp ≤ <b>+2.1°C</b>, and <b>65%+</b> of countries at Net Zero. <b>Lose</b>: temperature hits <b>+4°C</b>.</div></div>
      <div class="tutorial-step"><div class="tutorial-step-num">6</div><div><b>Keyboard</b>: <span class="kbd">Space</span> pause · <span class="kbd">1</span>/<span class="kbd">2</span>/<span class="kbd">4</span> speed · <span class="kbd">M</span> mute · <span class="kbd">H</span> help · <span class="kbd">S</span> stats · <span class="kbd">Esc</span> close a modal.</div></div>
    </div>
    <p class="tutorial-outro">Your progress autosaves every 20 seconds. Close the tab and come back later — the world waits. Progress is slow early on; stick with it. Unfamiliar with a term? Open the <b>Glossary</b> for plain-language definitions of every climate concept in the game.</p>
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
  modal.querySelector('.tutorial-glossary').addEventListener('click', () => showGlossary());
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
