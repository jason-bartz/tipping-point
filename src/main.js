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
import { PopulationSystem } from './systems/PopulationSystem.js';
import { AdvisorSystem } from './systems/AdvisorSystem.js';
import { MarineLifeSystem } from './systems/MarineLifeSystem.js';

import { HUD } from './ui/HUD.js';
import { WorldMap } from './ui/WorldMap.js';
import { ResearchTree } from './ui/ResearchTree.js';
import { CountryPanel } from './ui/CountryPanel.js';
import { RightPanel } from './ui/RightPanel.js';
import { DispatchesPanel } from './ui/DispatchesPanel.js';
import { NewsFeed } from './ui/NewsFeed.js';
import { MapAmbience } from './ui/MapAmbience.js';
import { RecoveryBar } from './ui/RecoveryBar.js';
import { CloudLayer } from './ui/CloudLayer.js';
import { SmogPlumes } from './ui/SmogPlumes.js';
import { CouncilPanel } from './ui/CouncilPanel.js';
import { PauseOverlay } from './ui/PauseOverlay.js';
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
import { save, load, clearSave, installAutoSave, loadFromSlot } from './save/saveLoad.js';
import { BALANCE } from './config/balance.js';
import { logDispatch, resolveDecisionDispatch, pendingDecisionCount } from './model/Dispatches.js';

// ─── Top-level globals. Held in module scope so a "Play Again" click can tear
// the running game down cleanly and rebuild. Keep this small — any state that
// needs to move between screens lives here.
let teardown = null;
let soundBoard = null;
let musicPlayer = null;

function ensureSoundBoard() {
  if (!soundBoard) soundBoard = new SoundBoard();
  return soundBoard;
}

function ensureMusicPlayer() {
  if (!musicPlayer) musicPlayer = new MusicPlayer();
  return musicPlayer;
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
  document.getElementById('end-screen').classList.remove('active');
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
  const council = new CouncilPanel(mapContainer, state, bus, advisors);
  const marineLife = new MarineLifeSystem(state, bus, worldMap);
  const clouds = new CloudLayer(worldMap);
  const smogPlumes = new SmogPlumes(state, bus, worldMap);
  const pauseOverlay = new PauseOverlay(mapContainer, state);
  installFloatingText();
  installScreenShake(document.getElementById('game'));

  const board = ensureSoundBoard();
  const music = ensureMusicPlayer();
  const soundUnsubs = bindSounds(board, bus);
  music.start();

  const hud = new HUD(document.getElementById('hud-root'), state, bus, loop, {
    board,
    onHelp:  () => showTutorial({ state, pauseWhileOpen: true }),
    onStats: () => showStatsModal(state),
    onAchievements: () => showAchievements({ state }),
    onMute:  () => { const m = board.toggleMute(); music.setMuted(m); return m; },
    onSave:  () => { save(state); showToast('Saved', 'Progress written to this browser.', 'good'); },
    onSettings: () => showSettings({
      board, music, state,
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
  const tree        = new ResearchTree(document.getElementById('left-panel'), state, bus, research, loop);
  const rightPanel  = new RightPanel(document.getElementById('right-panel'), state, bus);
  const panel       = new CountryPanel(rightPanel.mountPoint('country'), state, bus, adoption);
  // Clicking "Decide" on a pending-decision dispatch opens the event modal.
  // We also flip the tab back to country afterwards so the next decision
  // surfaces cleanly — but only if the player wasn't already reading
  // dispatches voluntarily. Simple heuristic: stay on dispatches.
  const dispatchesPanel = new DispatchesPanel(rightPanel.mountPoint('dispatches'), state, bus, {
    onOpenDecision: () => showEventModal(state, events),
  });
  const feed  = new NewsFeed(document.getElementById('news-bar'), state, bus);
  void hud; void tree; void panel; void rightPanel; void dispatchesPanel; void feed;

  // Auto-pause helpers. Interactive events auto-pause the game so the
  // player never misses a decision; on resolve we restore whatever speed
  // state the player had before (don't resume a deliberately-paused game).
  const autoPauseForDecision = () => {
    if (state.meta.autoPausedForDecision) return;
    state.meta.autoPausedForDecision = true;
    state.meta._preAutoPausedState = !!state.meta.paused;
    if (!state.meta.paused) { loop.setPaused(true); hud.syncSpeedUI?.(); }
  };
  const autoResumeIfDone = () => {
    if (!state.meta.autoPausedForDecision) return;
    if (pendingDecisionCount(state) > 0) return;
    const wasPaused = state.meta._preAutoPausedState;
    state.meta.autoPausedForDecision = false;
    delete state.meta._preAutoPausedState;
    if (wasPaused === false) { loop.setPaused(false); hud.syncSpeedUI?.(); }
  };

  // Event firing. Two flows now:
  //   · Interactive events  → log as 'decision' dispatch (needsAction), auto-pause,
  //                           pulse the Dispatches tab, play the decision chime.
  //                           No modal auto-open — the player chooses when to engage.
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
        title: evt.title || 'Decision',
        body: p.headline || '',
        detail: 'The council is waiting on you. Open to read the full situation and decide.',
        needsAction: true,
        eventId: evt.id,
      });
      autoPauseForDecision();
      board.decision();
    } else {
      // Echoes are delayed consequences of past decisions — they're logged
      // as events (same category in the filter strip) with an "Echo" label
      // so the player can trace the chain back to its source decision.
      logDispatch(state, bus, {
        kind: 'event',
        tone: p.tone || 'neutral',
        title: evt.title || (isEcho ? 'Echo' : 'Event'),
        body: p.headline || '',
        detail: isEcho ? 'Consequence of an earlier decision.' : '',
      });
      showToast(evt.title ?? 'Event', p.headline ?? '', p.tone);
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
    // Fanfare: spawn a radial burst from the left panel (where research lives).
    const leftPanel = document.getElementById('left-panel');
    if (leftPanel) {
      const burst = document.createElement('div');
      burst.className = 'gp-research-burst';
      leftPanel.style.position = leftPanel.style.position || 'relative';
      leftPanel.appendChild(burst);
      setTimeout(() => burst.remove(), 800);
    }
  });
  bus.on(EVT.COLLECTABLE_CLAIMED, (p) => {
    showToast(p.title, p.body, p.tone);
    // If the collectable carries screen coords, float the value there.
    if (p && typeof p.clientX === 'number' && typeof p.clientY === 'number') {
      const label = p.floatLabel || (typeof p.value === 'number' ? `+${p.value} ●` : p.title);
      floatAt({ x: p.clientX, y: p.clientY }, label, p.tone || 'good');
    }
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
    autoResumeIfDone();
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
  bus.on(EVT.WON,  (p) => { shakeScreen('thump'); showEndScreen(state, p, true,  { onAgain: returnToSelect }); });
  bus.on(EVT.LOST, (p) => { shakeScreen('quake'); showEndScreen(state, p, false, { onAgain: returnToSelect }); });

  // Advisor-board toasts — whispers are the only proactive interrupt; agenda
  // resolutions announce themselves as toasts so the player sees the reward.
  // Everything also lands in dispatches so the player can re-read later.
  bus.on(EVT.ADVISOR_WHISPER, (p) => {
    showToast(`${p.name}: warning`, p.text, 'bad');
    logDispatch(state, bus, {
      kind: 'advisor', tone: 'bad',
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
      logDispatch(state, bus, { kind: 'advisor', tone: 'good', title, body });
    }
  });
  bus.on(EVT.ADVISOR_ABILITY_USED, (p) => {
    const seat = state.advisors?.seats?.[p.id];
    if (!seat) return;
    const body = `${seat.title} used their signature ability.`;
    showToast(`${seat.name}`, body, 'good');
    logDispatch(state, bus, { kind: 'advisor', tone: 'good', title: seat.name, body });
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
    onAchievements: () => showAchievements({ state }),
    onSettings: () => showSettings({
      board, music, state,
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
    council.destroy?.();
    advisors.destroy?.();
    marineLife.destroy?.();
    clouds.destroy?.();
    smogPlumes.destroy?.();
    pauseOverlay.destroy?.();
    teardownFloatingText();
    teardownScreenShake();
    worldMap.destroy?.();
    hud.destroy?.();
    tree.destroy?.();
    population.destroy?.();
    feed.destroy?.();
    dispatchesPanel.destroy?.();
    rightPanel.destroy?.();
    soundUnsubs.forEach(u => u?.());
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

function newGame(homeCountryId) {
  if (!homeCountryId || !COUNTRY_PROFILES[homeCountryId]) return;
  const state = createState(homeCountryId);
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
  document.getElementById('end-screen').classList.remove('active');
  document.getElementById('country-screen').classList.add('active');
  renderCountrySelect({ onStart: newGame, onResume: resumeGame, onLoadSlot: loadSlot });
}

// ─── Boot ────────────────────────────────────────────────────────────────
applyAccessibilityFlags();
renderCountrySelect({ onStart: newGame, onResume: resumeGame, onLoadSlot: loadSlot });
