// Entry point. Wires data → state → systems → UI together and owns the
// one-line game-lifecycle: country-select → game → end-screen → (back).

import { initSentry, captureError, SentryReporter } from './telemetry/sentry.js';
import { install as installTelemetry, setReporter } from './telemetry/index.js';

// First thing on the page. Auto-binds window.onerror + unhandledrejection.
// No-op when VITE_SENTRY_DSN is unset.
initSentry();

import './styles/main.css';
// Bundle TopoJSON world atlas so there's no network dep for the map.
// Vite handles JSON imports out of the box; no import attribute needed.
import topoData from 'world-atlas/countries-110m.json';

import { EventBus, EVT } from './core/EventBus.js';
import { GameLoop } from './core/GameLoop.js';
import { createState } from './core/GameState.js';

import { CarbonSystem } from './systems/CarbonSystem.js';
import { AdoptionSystem } from './systems/AdoptionSystem.js';
import { ResearchSystem } from './systems/ResearchSystem.js';
import { EventSystem } from './systems/EventSystem.js';
import { NewsSystem } from './systems/NewsSystem.js';
import { ScoringSystem } from './systems/ScoringSystem.js';
import { CollectableSystem } from './systems/CollectableSystem.js';
import { CitizenChatterSystem } from './systems/CitizenChatterSystem.js';
import { PopulationSystem } from './systems/PopulationSystem.js';
import { AdvisorSystem } from './systems/AdvisorSystem.js';
import { ForestrySystem } from './systems/ForestrySystem.js';
import { SporadicWildfireSystem } from './systems/SporadicWildfireSystem.js';
import { MarineLifeSystem } from './systems/MarineLifeSystem.js';
import { SpeciesSystem } from './systems/SpeciesSystem.js';
import { WildfireFx } from './ui/WildfireFx.js';

import { HUD } from './ui/HUD.js';
import { WorldMap } from './ui/WorldMap.js';
import { ResearchTree } from './ui/ResearchTree.js';
import { CountryPanel } from './ui/CountryPanel.js';
import { LeftPanel } from './ui/LeftPanel.js';
import { RightPanel } from './ui/RightPanel.js';
import { DispatchesPanel } from './ui/DispatchesPanel.js';
import { NewsFeed } from './ui/NewsFeed.js';
import { MapAmbience } from './ui/MapAmbience.js';
import { RecoveryBar } from './ui/RecoveryBar.js';
import { CloudLayer } from './ui/CloudLayer.js';
import { SmogPlumes } from './ui/SmogPlumes.js';
import { CouncilPanel } from './ui/CouncilPanel.js';
import { installFloatingText, floatAt, teardownFloatingText } from './ui/FloatingText.js';
import { installScreenShake, shakeScreen, teardownScreenShake } from './ui/ScreenShake.js';
import { showToast } from './ui/Toast.js';
import { showTutorial, hasSeenTutorial, markTutorialSeen } from './ui/Tutorial.js';
import { showEventModal } from './ui/EventModal.js';
import { showStatsModal } from './ui/StatsModal.js';
import { showSettings, applyAccessibilityFlags } from './ui/SettingsModal.js';
import { showAchievements } from './ui/AchievementsModal.js';
import { installAchievements, readNew, ensureProgressSlot } from './model/Achievements.js';
import { showEndScreen } from './ui/EndScreen.js';
import { renderCountrySelect } from './ui/CountrySelect.js';
import { installKeyboard } from './ui/Keyboard.js';

import { COUNTRY_PROFILES } from './data/profiles.js';
import { SoundBoard, bindSounds } from './audio/SoundBoard.js';
import { MusicPlayer } from './audio/MusicPlayer.js';
import { FireAmbience } from './audio/FireAmbience.js';
import { save, load, clearSave, installAutoSave, loadFromSlot } from './save/saveLoad.js';
import { BALANCE } from './config/balance.js';
import { logDispatch, resolveDecisionDispatch, expireDecisionDispatch } from './model/Dispatches.js';

// ─── Top-level globals. Held in module scope so a "Play Again" click can tear
// the running game down cleanly and rebuild. Keep this small — any state that
// needs to move between screens lives here.
let teardown = null;
let soundBoard = null;
let musicPlayer = null;
let fireAmbience = null;

function ensureSoundBoard() {
  if (!soundBoard) soundBoard = new SoundBoard();
  return soundBoard;
}

function ensureMusicPlayer() {
  if (!musicPlayer) musicPlayer = new MusicPlayer();
  return musicPlayer;
}

function ensureFireAmbience() {
  if (!fireAmbience) fireAmbience = new FireAmbience();
  return fireAmbience;
}

// Show an error banner in the map container. Used when map data somehow
// fails (shouldn't — it's bundled — but belt-and-suspenders).
function showMapError(mapContainer, err) {
  mapContainer.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = 'err-banner';
  banner.innerHTML = `<h3>Map failed to load</h3>
    <p>${err?.message ?? 'Unknown error'}. Try reloading the page.</p>
    <button type="button">Reload</button>`;
  banner.querySelector('button').addEventListener('click', () => window.location.reload());
  mapContainer.appendChild(banner);
}

function startGame(state) {
  // Tear down a running game if one exists (e.g. "Play Again" path).
  if (teardown) { try { teardown(); } catch { /* ignore */ } teardown = null; }

  document.getElementById('country-screen').classList.remove('active');
  document.getElementById('end-screen').classList.remove('active', 'state-won', 'state-lost');
  document.getElementById('game').classList.add('active');

  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = ''; // clear loading

  const profile = COUNTRY_PROFILES[state.meta.homeCountryId];
  const mod = state.meta.mod;

  const bus = new EventBus();
  const loop = new GameLoop(state, bus);

  // Systems. Construction order = tick-handler order (EventBus iterates its
  // listener Set in insertion order), so anything that reads a value must be
  // constructed *after* the thing that writes it.
  //   CarbonSystem    → writes co2ppm, tempAnomalyC
  //   PopulationSystem→ reads tempAnomalyC (and adoption)  — placed after carbon
  //   AdoptionSystem  → reads adoption / tempAnomalyC, writes political will
  //   Research / Events / News / Scoring / Collectables — downstream consumers.
  const carbon     = new CarbonSystem(state, bus);     void carbon;
  const population = new PopulationSystem(state, bus); void population;
  const research   = new ResearchSystem(state, bus, mod);
  const adoption   = new AdoptionSystem(state, bus, mod);
  const events     = new EventSystem(state, bus);
  const news       = new NewsSystem(state, bus);
  const scoring    = new ScoringSystem(state, bus);    void scoring;
  const advisors   = new AdvisorSystem(state, bus);
  events.setAdvisorSystem(advisors);
  // Forestry + government. Ticks forest health + liability; hooks into
  // EVENT_FIRED so wildfire-class events charge the sitting incumbent.
  const forestry   = new ForestrySystem(state, bus);
  // Sporadic wildfires — RNG-driven out-of-season fires that paint a country
  // with a small drain on climate credits. Constructed after ForestrySystem
  // so a season-event tick fires liability first, sporadic FX after.
  const sporadicFires = new SporadicWildfireSystem(state, bus);
  // Biodiversity — reads tempAnomalyC, mutates species statuses, emits
  // SPECIES_* events that NewsSystem (already constructed above) picks up
  // for the ticker and dispatches log.
  const species    = new SpeciesSystem(state, bus);    void species;

  // UI
  let worldMap;
  try {
    worldMap = new WorldMap(mapContainer, state, bus, topoData);
  } catch (err) {
    console.error('[map] init failed:', err);
    captureError(err, { area: 'map-init', homeCountryId: state.meta.homeCountryId });
    showMapError(mapContainer, err);
    return;
  }
  const ambience = new MapAmbience(mapContainer, state, bus);
  const recovery = new RecoveryBar(mapContainer, state, bus);
  const collectables = new CollectableSystem(state, bus, worldMap, mapContainer);
  const chatter = new CitizenChatterSystem(state, bus, worldMap, mapContainer);
  const marineLife = new MarineLifeSystem(state, bus, worldMap);
  const fireAmb = ensureFireAmbience();
  const wildfireFx = new WildfireFx(state, bus, worldMap, { fireAmbience: fireAmb });
  const clouds = new CloudLayer(worldMap);
  const smogPlumes = new SmogPlumes(state, bus, worldMap);
  installFloatingText();
  installScreenShake(document.getElementById('game'));

  const board = ensureSoundBoard();
  const music = ensureMusicPlayer();
  const soundUnsubs = bindSounds(board, bus);
  music.start();

  // Delegated hover SFX — a soft sine blip on the buttons that matter
  // (deploys, research nodes, sector tabs, modal choices, primary CTAs).
  // Rate-limited so a fast cursor sweep doesn't stack into a buzz. Skipped
  // on touch-only devices where hover is meaningless.
  const HOVER_SELECTOR = '.deploy-btn:not([disabled]), .tree-node, .sector-tab, .modal-choice, .intro-cta, .starter-select-btn, .again, .end-share, .end-achievements, .rt-tab, .starter[data-id]';
  let lastHoverAt = 0;
  const onDelegatedHover = (e) => {
    const target = e.target?.closest?.(HOVER_SELECTOR);
    if (!target || target.hasAttribute('disabled')) return;
    const now = performance.now();
    if (now - lastHoverAt < 55) return;
    lastHoverAt = now;
    board.hover?.();
  };
  const hoverHost = document.getElementById('game');
  const titleHost = document.getElementById('country-screen');
  const canHover = !window.matchMedia?.('(hover: none)')?.matches;
  if (canHover) {
    hoverHost?.addEventListener('pointerover', onDelegatedHover);
    titleHost?.addEventListener('pointerover', onDelegatedHover);
  }

  const hud = new HUD(document.getElementById('hud-root'), state, bus, loop, {
    board,
    onHelp:  () => showTutorial({ state, pauseWhileOpen: true }),
    onStats: () => showStatsModal(state),
    onAchievements: () => showAchievements({ state }),
    onMute:  () => { const m = board.toggleMute(); music.setMuted(m); fireAmb.setMuted(m); return m; },
    onSave:  () => { save(state); showToast('Saved', 'Progress written to this browser.', 'good'); },
    onSettings: () => showSettings({
      board, music, fireAmbience: fireAmb, state,
      onMuteChanged: (m) => {
        const btn = document.querySelector('.mute-btn');
        if (!btn) return;
        btn.classList.toggle('muted', m);
        const icon = btn.querySelector('.hud-icon');
        if (icon) icon.setAttribute('src', m ? '/icons/sound-off.png' : '/icons/sound-on.png');
      },
      onLoadSlot: loadSlot,
    }),
  });
  // Badge the achievements button if carryover unreads exist from a prior run.
  ensureProgressSlot(state);
  if (readNew().size > 0) hud.markAchievementsNew?.();
  const leftPanel   = new LeftPanel(document.getElementById('left-panel'));
  const tree        = new ResearchTree(leftPanel.mountPoint('research'), state, bus, research, loop);
  const council     = new CouncilPanel(leftPanel.mountPoint('council'), state, bus, advisors);
  const rightPanel  = new RightPanel(document.getElementById('right-panel'), state, bus);
  const panel       = new CountryPanel(rightPanel.mountPoint('country'), state, bus, adoption);
  // Clicking "Decide" on a pending-decision dispatch opens the event modal.
  // We also flip the tab back to country afterwards so the next decision
  // surfaces cleanly — but only if the player wasn't already reading
  // dispatches voluntarily. Simple heuristic: stay on dispatches.
  const dispatchesPanel = new DispatchesPanel(rightPanel.mountPoint('dispatches'), state, bus, {
    onOpenDecision: () => showEventModal(state, events, bus),
  });
  const feed  = new NewsFeed(document.getElementById('news-bar'), state, bus);
  void hud; void tree; void panel; void leftPanel; void rightPanel; void dispatchesPanel; void feed;

  // Event firing. Two flows now:
  //   · Interactive events  → log as 'decision' dispatch (needsAction),
  //                           pulse the Dispatches tab, play the decision chime.
  //                           Game keeps running — player engages when ready.
  //   · Passive events      → log as 'event' dispatch + a brief toast for the
  //                           immediate beat. Full text is always in the log.
  bus.on(EVT.EVENT_FIRED, (p) => {
    // Three kinds of EVENT_FIRED fly through here:
    //   1. Fresh passive event   — event object, no `interactive`.
    //   2. Fresh interactive     — event object, `interactive: true`, still in activeEvents.
    //   3. Post-resolve re-fire  — same event object, `interactive: true`, already spliced
    //                              from activeEvents (EventSystem.resolve emits this as the
    //                              choice's echo headline for the ticker). We skip it here —
    //                              DECISION_RESOLVED carries the receipt.
    //   4. Delayed echo          — synthetic event id ending in `_echo`, no `interactive`.
    const evt = p.event || {};
    const isInteractiveFresh =
      evt.interactive && state.activeEvents.some(e => e.id === evt.id);
    const isInteractivePost =
      evt.interactive && !isInteractiveFresh;
    if (isInteractivePost) return;

    const isEcho = !evt.choices && !evt.interactive && typeof evt.id === 'string' && evt.id.endsWith('_echo');
    if (isInteractiveFresh) {
      logDispatch(state, bus, {
        kind: 'decision',
        tone: p.tone || 'neutral',
        category: evt.category || null,
        title: evt.title || 'Decision',
        body: p.headline || '',
        detail: 'The advisors are waiting on you. Open to read the full situation and decide.',
        needsAction: true,
        eventId: evt.id,
        expiresAtTick: evt.expiresAtTick ?? null,
      });
      board.decision();
    } else {
      // Echoes are delayed consequences of past decisions — they're logged
      // as events (same category in the filter strip) with an "Echo" label
      // so the player can trace the chain back to its source decision.
      // No toast: the ticker already carries the headline and dispatches
      // holds the full record, so a passive event doesn't need three surfaces.
      logDispatch(state, bus, {
        kind: 'event',
        tone: p.tone || 'neutral',
        title: evt.title || (isEcho ? 'Echo' : 'Event'),
        body: p.headline || '',
        detail: isEcho ? 'Consequence of an earlier decision.' : '',
      });
    }
  });
  bus.on(EVT.NET_ZERO, (p) => {
    const body = `${p.country.name} decarbonized. +${BALANCE.milestoneBonusCP} Credits.`;
    showToast('Net Zero', body, 'good');
    logDispatch(state, bus, { kind: 'milestone', tone: 'good', title: 'Net Zero', body });
    shakeScreen('thump');
  });
  bus.on(EVT.RESEARCH_STARTED, (p) => {
    showToast('Research Begins', `${p.activity.name} — research underway.`, 'info');
    logDispatch(state, bus, {
      kind: 'research', tone: 'info',
      title: 'Research Begins', body: `${p.activity.name} — research underway.`,
    });
  });
  bus.on(EVT.RESEARCH_DONE, (p) => {
    showToast('Research Complete', p.activity.name, 'good');
    logDispatch(state, bus, {
      kind: 'research', tone: 'good',
      title: 'Research Complete', body: p.activity.name,
    });
    shakeScreen('soft');
    // Fanfare: radial flash + 8 scatter particles from the completed node,
    // if we can find it in the tree. Falls back to the panel centerpoint.
    const leftPanel = document.getElementById('left-panel');
    if (!leftPanel) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    leftPanel.style.position = leftPanel.style.position || 'relative';
    const burst = document.createElement('div');
    burst.className = 'gp-research-burst';
    leftPanel.appendChild(burst);
    setTimeout(() => burst.remove(), 800);
    if (reducedMotion) return;
    // Scatter particles — 8 pixel squares in a radial pattern, each with
    // its own trajectory and rotation. Physics is done purely via CSS
    // variables; the keyframe handles translate/rotate/fade.
    const node = leftPanel.querySelector(`[data-id="${p.activity?.id}"]`) || leftPanel;
    const anchor = node.getBoundingClientRect();
    const pRoot = leftPanel.getBoundingClientRect();
    const ox = anchor.left + anchor.width / 2 - pRoot.left;
    const oy = anchor.top + anchor.height / 2 - pRoot.top;
    for (let i = 0; i < 8; i++) {
      const particle = document.createElement('span');
      particle.className = 'gp-research-particle';
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const dist = 48 + Math.random() * 32;
      const dx = Math.round(Math.cos(angle) * dist);
      const dy = Math.round(Math.sin(angle) * dist - 20);
      const color = ['#facc15', '#fde68a', '#fef3c7', '#fbbf24'][i % 4];
      particle.style.cssText =
        `left:${ox}px;top:${oy}px;background:${color};` +
        `--dx:${dx}px;--dy:${dy}px;--rot:${Math.random() * 720 - 360}deg`;
      leftPanel.appendChild(particle);
      setTimeout(() => particle.remove(), 900);
    }
  });
  // Auto first-deploy at home on research complete. Home is always the
  // cheapest first deploy (25% discount, +15 PW floor) and the 1st deploy
  // is the highest-yield of the three allowed per pair. Automating it
  // removes a rote click without flattening the 2nd/3rd-deploy decisions,
  // which are where real judgment lives. Failures toast, but don't queue —
  // if you can't afford it, that's information, not a deferred transaction.
  bus.on(EVT.RESEARCH_DONE, (p) => {
    const homeId = state.meta?.homeCountryId;
    if (!homeId || !p?.activity) return;
    const result = adoption.deploy(homeId, p.activity);
    if (result.ok) {
      showToast('Auto-deployed at home', p.activity.name, 'good');
    } else if (result.reason === 'insufficient_cp') {
      showToast("Can't auto-deploy", `${p.activity.name} — need ${result.cost} Credits. Deploy manually when ready.`, 'warn');
    } else if (result.reason === 'will_gate') {
      showToast("Can't auto-deploy", `${p.activity.name} — home political will below threshold (${result.have}/${result.threshold}).`, 'warn');
    }
    // Other reasons (pair_cap, not_researched) can't occur for a freshly-
    // completed research in the home country, so silent is correct.
  });
  bus.on(EVT.COLLECTABLE_CLAIMED, (p) => {
    showToast(p.title, p.body, p.tone);
    // If the collectable carries screen coords, float the value there.
    if (p && typeof p.clientX === 'number' && typeof p.clientY === 'number') {
      const label = p.floatLabel || (typeof p.value === 'number' ? `+${p.value} ●` : p.title);
      floatAt({ x: p.clientX, y: p.clientY }, label, p.tone || 'good');
    }
    // Keep pickups quiet — only rare high-value drops get a soft shake so the
    // screen doesn't jitter on every collectable grab.
    const big = typeof p?.value === 'number' && p.value >= 12;
    if (big) shakeScreen('soft');
  });
  // Deploy — float "+X% Branch" from the deploy button; spend cost floats as
  // a red "-Y ●" chip. Emits right after the model mutates, so the button's
  // data-id is still on the DOM.
  bus.on(EVT.DEPLOYED, (p) => {
    if (!p?.activity) return;
    const btn = document.querySelector(`.deploy-btn[data-id="${p.activity.id}"]`);
    if (!btn) return;
    const branchLabel = p.activity.branch?.toUpperCase?.() ?? p.activity.branch ?? '';
    const pct = Math.max(1, Math.round((p.appliedYield ?? 0) * 100));
    floatAt(btn, `+${pct}% ${branchLabel}`, 'good');
    if (typeof p.cost === 'number' && p.cost > 0) {
      floatAt({
        x: btn.getBoundingClientRect().right - 10,
        y: btn.getBoundingClientRect().top + 10,
      }, `−${p.cost} ●`, 'warn');
    }
  });
  // Decision receipt — immediate, concrete feedback on what the choice did.
  // The receipt also resolves the pending-decision dispatch (flipping it
  // from "needs action" to "answered"), and may auto-resume the game.
  bus.on(EVT.DECISION_RESOLVED, (p) => {
    const body = p.effectsSummary || 'Choice recorded.';
    showToast(`You chose: ${p.choiceLabel}`, body, p.tone || 'info');
    resolveDecisionDispatch(state, bus, p.eventId, p.choiceLabel, p.effectsSummary);
  });
  // Decisions expire if the player doesn't act in time. Flip the pending
  // dispatch to expired, toast the consequence, and shake the screen so
  // the player feels the lapse.
  bus.on(EVT.DECISION_EXPIRED, (p) => {
    showToast(`Too late: ${p.title}`, p.effectsSummary || 'The moment passed.', 'bad');
    expireDecisionDispatch(state, bus, p.eventId, p.effectsSummary);
    shakeScreen('soft');
    board.eventBad?.();
  });
  // Event modal state — dim the world (CSS via body.has-event-modal, toggled
  // in EventModal.js) and duck the music so the decision carries weight.
  bus.on(EVT.EVENT_MODAL_STATE, ({ open }) => {
    if (open) music.duck(0.35, 0.35);
    else      music.restore(0.7);
  });

  // Music tension — temperature drives a lowpass filter on the master bus,
  // so as the world warms the soundtrack sounds increasingly distant and
  // muffled. Starts at 1.8°C, saturates at 3.5°C. Checked every ~20 ticks
  // (once every couple of quarters at 1×) since the filter glides smoothly.
  let lastTensionTick = -999;
  bus.on(EVT.TICK, () => {
    const tick = state.meta.tick;
    if (tick - lastTensionTick < 20) return;
    lastTensionTick = tick;
    const t = state.world.tempAnomalyC ?? 0;
    const tension = Math.max(0, Math.min(1, (t - 1.8) / (3.5 - 1.8)));
    music.setTension?.(tension);
  });
  bus.on(EVT.RESEARCH_FAILED, ({ reason, cost, activity }) => {
    const msg = {
      insufficient_cp: `Need ${cost ?? ''} Credits for ${activity?.name ?? 'research'}.`,
      branch_busy: `${activity ? activity.name : 'That branch'} can't start — the lab is busy.`,
      prereqs: `Research the prereqs for ${activity?.name ?? 'this'} first.`,
      already: `${activity?.name ?? 'This'} is already researched.`,
    }[reason];
    if (msg) showToast("Can't research", msg, 'bad');
  });
  bus.on(EVT.WON, (p) => {
    // Ceremony: brief music swell (unduck past baseline for a beat, then
    // settle), a bigger shake for perfect wins, and the end-card with
    // confetti lands. Music fades out naturally on the teardown that
    // returnToSelect triggers via loop.stop().
    shakeScreen(p.perfect ? 'quake' : 'thump');
    const original = music.baseVolume;
    try {
      music.setVolume(Math.min(1, original * 1.35));
      setTimeout(() => music.setVolume(original), 2800);
    } catch { /* ignore */ }
    showEndScreen(state, p, true, { onAgain: returnToSelect });
  });
  bus.on(EVT.LOST, (p) => { shakeScreen('quake'); showEndScreen(state, p, false, { onAgain: returnToSelect }); });

  // Advisor-board toasts — whispers are the only proactive interrupt; agenda
  // resolutions announce themselves as toasts so the player sees the reward.
  // Everything also lands in dispatches so the player can re-read later.
  bus.on(EVT.ADVISOR_WHISPER, (p) => {
    showToast(`${p.name}: warning`, p.text, 'bad');
    logDispatch(state, bus, {
      kind: 'advisor', tone: 'bad',
      advisorId: p.id,
      title: `${p.name}: warning`, body: p.text,
    });
  });
  bus.on(EVT.ADVISOR_AGENDA_RESOLVED, (p) => {
    const seat = state.advisors?.seats?.[p.id];
    if (!seat) return;
    if (p.won && p.reward) {
      const title = p.reward.title ?? `${seat.name} agenda complete`;
      const body  = p.reward.body ?? '';
      showToast(title, body, 'good');
      logDispatch(state, bus, {
        kind: 'advisor', tone: 'good',
        advisorId: p.id,
        title, body,
      });
    }
  });
  bus.on(EVT.ADVISOR_ABILITY_USED, (p) => {
    const seat = state.advisors?.seats?.[p.id];
    if (!seat) return;
    const body = `${seat.title} used their signature ability.`;
    showToast(`${seat.name}`, body, 'good');
    logDispatch(state, bus, {
      kind: 'advisor', tone: 'good',
      advisorId: p.id,
      title: seat.name, body,
    });
  });
  // Flavor news intentionally does NOT land in dispatches. The news ticker
  // is the home for those headlines; the dispatches log is reserved for
  // actionable beats (decisions, events, advisors, milestones, research,
  // deploys). Echoes — delayed consequences of past decisions — already
  // come through EVT.EVENT_FIRED above as kind:'event' with an Echo marker.
  //
  // Soft chime when a neutral dispatch lands and the dispatches tab isn't
  // active — gives the player a heads-up without being intrusive. Decisions
  // get their own urgent chime above; skip those here.
  bus.on(EVT.DISPATCH_LOGGED, (d) => {
    if (d.needsAction) return;                // already chimed via board.decision()
    if (rightPanel.active === 'dispatches') return; // player is already looking
    board.notification();
  });

  // Keyboard shortcuts.
  const removeKeys = installKeyboard(loop, {
    onHelp:  () => showTutorial({ state, pauseWhileOpen: true }),
    onStats: () => showStatsModal(state),
    onSpeedChanged: () => hud.syncSpeedUI?.(),
    onAchievements: () => showAchievements({ state }),
    onSettings: () => showSettings({
      board, music, fireAmbience: fireAmb, state,
      onMuteChanged: (m) => {
        const btn = document.querySelector('.mute-btn');
        if (!btn) return;
        btn.classList.toggle('muted', m);
        const icon = btn.querySelector('.hud-icon');
        if (icon) icon.setAttribute('src', m ? '/icons/sound-off.png' : '/icons/sound-on.png');
      },
      onLoadSlot: loadSlot,
    }),
    onMute:  () => {
      const muted = board.toggleMute();
      music.setMuted(muted);
      fireAmb.setMuted(muted);
      const btn = document.querySelector('.mute-btn');
      if (btn) {
        btn.classList.toggle('muted', muted);
        const icon = btn.querySelector('.hud-icon');
        if (icon) icon.setAttribute('src', muted ? '/icons/sound-off.png' : '/icons/sound-on.png');
      }
    },
  });

  // Autosave.
  const autoSave = installAutoSave(state, bus, { intervalMs: 20000 });

  // Telemetry. Sentry is the prod reporter (no-op without a DSN); dev
  // sessions with ?debug=1 auto-fall back to ConsoleReporter.
  if (import.meta.env.VITE_SENTRY_DSN) setReporter(SentryReporter);
  const removeTelemetry = installTelemetry(bus, state);

  // Achievements — installed after the core bus listeners so unlocks can
  // react to bus activity already being wired. `onUnlock` surfaces a toast
  // and badges the HUD button.
  const removeAchievements = installAchievements(state, bus, { EVT }, {
    onUnlock: (def) => {
      showToast(`Achievement: ${def.title}`, def.desc, 'good');
      hud.markAchievementsNew?.();
    },
  });

  // Initial news (only for fresh games — not resumes).
  if (state.meta.tick === 0 && state.news.length === 0) {
    const home = state.countries[state.meta.homeCountryId];
    news.push('Tipping Point Initiative launches. The world watches skeptically.', 'info');
    news.push(`${profile.title}: ${profile.subtitle}. ${profile.bonusLabel}.`, 'info');
    news.push(`${home.name} named host of the Initiative. Home deploys get a 25% discount.`, 'good');
  }

  // Auto-select the home country.
  setTimeout(() => bus.emit(EVT.COUNTRY_SELECTED, { id: state.meta.homeCountryId }), 0);

  state.meta.paused = false;
  loop.start();

  // First-run tutorial.
  if (!hasSeenTutorial()) {
    showTutorial({ state, pauseWhileOpen: true });
    markTutorialSeen();
  }

  // Teardown closure for "Play Again" → country select.
  teardown = () => {
    loop.stop();
    autoSave.stop();
    removeTelemetry?.();
    removeAchievements?.();
    removeKeys();
    music.stop();
    ambience.destroy?.();
    recovery.destroy?.();
    collectables.destroy?.();
    chatter.destroy?.();
    council.destroy?.();
    advisors.destroy?.();
    forestry.destroy?.();
    sporadicFires.destroy?.();
    marineLife.destroy?.();
    wildfireFx.destroy?.();
    fireAmb?.setFireCount?.(0);
    clouds.destroy?.();
    smogPlumes.destroy?.();
    teardownFloatingText();
    teardownScreenShake();
    worldMap.destroy?.();
    hud.destroy?.();
    tree.destroy?.();
    leftPanel.destroy?.();
    population.destroy?.();
    feed.destroy?.();
    dispatchesPanel.destroy?.();
    rightPanel.destroy?.();
    soundUnsubs.forEach(u => u?.());
    if (canHover) {
      hoverHost?.removeEventListener('pointerover', onDelegatedHover);
      titleHost?.removeEventListener('pointerover', onDelegatedHover);
    }
    // Clear mounts.
    for (const id of ['hud-root', 'left-panel', 'right-panel', 'news-bar']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    }
    mapContainer.innerHTML = '';
    const toastStack = document.getElementById('toast-stack');
    if (toastStack) toastStack.innerHTML = '';
  };
}

function newGame(homeCountryId, { seed } = {}) {
  if (!homeCountryId || !COUNTRY_PROFILES[homeCountryId]) return;
  const parsedSeed = seed != null && Number.isFinite(Number(seed)) ? (Number(seed) >>> 0) : undefined;
  const state = createState(homeCountryId, { seed: parsedSeed });
  const profile = COUNTRY_PROFILES[homeCountryId];
  for (const id of profile.starter) state.world.researched.add(id);
  // Discard any prior save when starting a new run — the resume banner on
  // the select screen already offers the alternative.
  clearSave();
  startGame(state);
}

function resumeGame() {
  const state = load();
  if (!state) {
    showToast("Couldn't resume", "The save appears corrupted. Starting fresh.", 'bad');
    return;
  }
  startGame(state);
}

function loadSlot(slotId) {
  const state = loadFromSlot(slotId);
  if (!state) {
    showToast("Couldn't load slot", "The save appears corrupted or empty.", 'bad');
    return;
  }
  startGame(state);
}

function returnToSelect() {
  if (teardown) { try { teardown(); } catch { /* ignore */ } teardown = null; }
  clearSave(); // the finished game is a snapshot of a game that's over
  document.getElementById('game').classList.remove('active');
  document.getElementById('end-screen').classList.remove('active', 'state-won', 'state-lost');
  document.getElementById('country-screen').classList.add('active');
  renderCountrySelect({ onStart: newGame, onResume: resumeGame, onLoadSlot: loadSlot });
}

// ─── Boot ────────────────────────────────────────────────────────────────
applyAccessibilityFlags();
// Replay-link support: ?country=DEU&seed=12345 starts that exact game. We
// clear the URL after so the user can Play Again without re-triggering it.
const params = new URLSearchParams(window.location.search);
const urlCountry = params.get('country');
const urlSeed = params.get('seed');
if (urlCountry && COUNTRY_PROFILES[urlCountry]) {
  try { history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
  newGame(urlCountry, { seed: urlSeed });
} else {
  renderCountrySelect({ onStart: newGame, onResume: resumeGame, onLoadSlot: loadSlot });
}
